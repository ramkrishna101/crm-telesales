import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../../lib/prisma';
import { authenticate, requireRole } from '../../middleware/auth';
import { AppError } from '../../middleware/errorHandler';
import {
  createStringeeAccessToken,
  getStringeeServerAddrs,
  getStringeeTokenTtlSeconds,
  isStringeeEnabled,
} from '../../lib/stringee';
import { isStringeeXAdminConfigured, listStringeeXNumbers, pccProxy } from '../../lib/stringeexAdmin';
import { z } from 'zod';

const router = Router();

router.use(authenticate);
router.use(requireRole('super_admin', 'branch_admin', 'agent'));

router.get('/config', (_req: Request, res: Response) => {
  res.json({
    success: true,
    data: {
      enabled: isStringeeEnabled(),
      serverAddrs: getStringeeServerAddrs(),
      tokenTtlSeconds: getStringeeTokenTtlSeconds(),
    },
  });
});

// ── GET /api/stringee/numbers ─────────────────────────────────────────
// Returns the ordered list of hotlines (StringeeX numbers) the agent's
// SDK may dial from. Browser iterates and retries through them when
// CALL_NOT_ALLOWED_BY_YOUR_SERVER comes back, matching the Zoho widget pattern.
router.get('/numbers', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    if (!isStringeeXAdminConfigured()) {
      throw new AppError(503, 'STRINGEEX_ADMIN_NOT_CONFIGURED', 'Stringee number sync is not configured');
    }

    const hotlines = await listStringeeXNumbers(true);
    if (!hotlines.length) {
      throw new AppError(503, 'STRINGEE_NUMBERS_UNAVAILABLE', 'No number available');
    }

    res.json({
      success: true,
      data: { hotlines },
    });
  } catch (err) {
    next(err);
  }
});

router.get('/token', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!isStringeeEnabled()) {
      throw new AppError(503, 'STRINGEE_DISABLED', 'Stringee integration is disabled');
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: { id: true, email: true, stringeeEmail: true, stringeeAccountId: true, status: true, role: true },
    });

    if (!user) {
      throw new AppError(404, 'USER_NOT_FOUND', 'User not found');
    }

    if (user.status === 'inactive') {
      throw new AppError(403, 'USER_INACTIVE', 'Inactive users cannot request call tokens');
    }

    if (!user.stringeeEmail) {
      throw new AppError(400, 'STRINGEE_EMAIL_REQUIRED', 'Stringee email is not configured for this user');
    }

    const stringeeUserId = user.stringeeEmail;
    const token = createStringeeAccessToken(stringeeUserId);
    res.json({
      success: true,
      data: {
        token,
        userId: stringeeUserId,
        expiresInSeconds: getStringeeTokenTtlSeconds(),
      },
    });
  } catch (err) {
    next(err);
  }
});

const syncProfileSchema = z.object({
  stringeeUserId: z.string().email().max(255),
  stringeeAccountId: z.string().min(1).max(255).optional().nullable(),
});

router.post('/profile', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = syncProfileSchema.parse(req.body);
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: { id: true, stringeeEmail: true },
    });

    if (!user) {
      throw new AppError(404, 'USER_NOT_FOUND', 'User not found');
    }

    if (!user.stringeeEmail) {
      throw new AppError(400, 'STRINGEE_EMAIL_REQUIRED', 'Stringee email is not configured for this user');
    }

    if (user.stringeeEmail !== body.stringeeUserId) {
      throw new AppError(403, 'STRINGEE_ID_MISMATCH', 'Authenticated Stringee user does not match configured Stringee email');
    }

    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        stringeeAccountId: body.stringeeAccountId && body.stringeeAccountId.trim()
          ? body.stringeeAccountId.trim()
          : null,
      },
      select: { stringeeEmail: true, stringeeAccountId: true },
    });

    res.json({ success: true, data: updatedUser });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/stringee/agent-token ────────────────────────────────────
// Locally signs a Stringee SDK access token for the agent using
// STRINGEE_API_SID/SECRET and the agent's `stringeeAccountId`. No password
// required: the project key authorises us to mint tokens for any of our
// project's user IDs (StringeeX account_id format, e.g. `AC...`).

router.post('/agent-token', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!isStringeeEnabled()) {
      throw new AppError(503, 'STRINGEE_DISABLED', 'Stringee integration is disabled');
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: { id: true, stringeeEmail: true, stringeeAccountId: true, status: true },
    });

    if (!user) throw new AppError(404, 'USER_NOT_FOUND', 'User not found');
    if (user.status === 'inactive') {
      throw new AppError(403, 'USER_INACTIVE', 'Inactive users cannot request call tokens');
    }
    if (!user.stringeeAccountId) {
      throw new AppError(
        400,
        'STRINGEE_ACCOUNT_ID_REQUIRED',
        'Ask your admin to set your Stringee Account ID before placing calls',
      );
    }

    let authToken: string;
    try {
      authToken = createStringeeAccessToken(user.stringeeAccountId);
    } catch (err: any) {
      throw new AppError(500, 'STRINGEE_TOKEN_MINT_FAILED', err.message || 'Token mint failed');
    }

    res.json({
      success: true,
      data: {
        authToken,
        accountId: user.stringeeAccountId,
        stringeeEmail: user.stringeeEmail,
        expiresInSeconds: getStringeeTokenTtlSeconds(),
      },
    });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/stringee/callout ────────────────────────────────────────
// Server-side outbound call via PCC. PCC rings the agent's browser SDK
// first (Web app leg), then on answer dials the customer and bridges.
// This avoids CALL_NOT_ALLOWED_BY_YOUR_SERVER which only affects the
// client-side `makeCall()` path that requires a `callout_answer_url`.

const calloutSchema = z.object({
  leadId: z.string().min(1).optional(),
  phone: z.string().min(3).max(32).optional(),
  displayName: z.string().max(120).optional(),
}).refine((d) => !!d.leadId || !!d.phone, { message: 'leadId or phone required' });

router.post('/callout', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!isStringeeEnabled()) {
      throw new AppError(503, 'STRINGEE_DISABLED', 'Stringee integration is disabled');
    }

    const body = calloutSchema.parse(req.body);

    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: { id: true, stringeeAccountId: true, status: true },
    });
    if (!user) throw new AppError(404, 'USER_NOT_FOUND', 'User not found');
    if (user.status === 'inactive') throw new AppError(403, 'USER_INACTIVE', 'Inactive user');
    if (!user.stringeeAccountId) {
      throw new AppError(400, 'STRINGEE_ACCOUNT_ID_REQUIRED', 'Agent has no Stringee Account ID');
    }

    const hotlines = await listStringeeXNumbers(true);
    const hotline = hotlines[0];
    if (!hotline) throw new AppError(503, 'STRINGEE_NUMBERS_UNAVAILABLE', 'No number available');

    let customerNumber = (body.phone || '').replace(/\s+/g, '');
    let displayName = body.displayName || '';

    if (body.leadId) {
      const lead = await prisma.lead.findUnique({
        where: { id: body.leadId },
        select: { id: true, phone: true, name: true, assignedToId: true },
      });
      if (!lead) throw new AppError(404, 'LEAD_NOT_FOUND', 'Lead not found');
      // Basic ownership check: agent must own the lead (admins skipped)
      if (req.user!.role === 'agent' && lead.assignedToId !== user.id) {
        throw new AppError(403, 'LEAD_NOT_ASSIGNED', 'Lead not assigned to you');
      }
      customerNumber = lead.phone.replace(/\s+/g, '');
      displayName = displayName || lead.name || '';
    }

    if (!customerNumber) throw new AppError(400, 'PHONE_REQUIRED', 'Customer phone required');

    const payload: Record<string, unknown> = {
      agentUserId: user.stringeeAccountId,
      toAgentFromNumberDisplay: displayName || customerNumber,
      toCustomerFromNumber: hotline,
      customerNumber,
    };

    let json: any;
    try {
      json = await pccProxy('v1/call/callout', 'POST', payload);
    } catch (err: any) {
      console.error('[stringee.callout] pccProxy threw', err?.message || err);
      throw new AppError(502, 'STRINGEE_CALLOUT_FAILED', err?.message || 'Callout failed');
    }

    // pccconfig returns: { r, message, resFromPccApi: { r, message, ... } }
    const inner = json?.resFromPccApi ?? json;
    if (typeof inner?.r === 'number' && inner.r !== 0) {
      console.error('[stringee.callout] PCC rejected', json);
      throw new AppError(
        502,
        'STRINGEE_CALLOUT_FAILED',
        inner?.message || `PCC returned r=${inner.r}`,
      );
    }

    res.json({ success: true, data: json });
  } catch (err) {
    next(err);
  }
});

export default router;