import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import multer from 'multer';
import path from 'path';
import { prisma } from '../../lib/prisma';
import { authenticate, requireRole } from '../../middleware/auth';
import { AppError } from '../../middleware/errorHandler';
import { param } from '../../lib/params';
import { leadUploadQueue, getUploadProgress } from '../../jobs/leadUpload.worker';
import { ADMIN_ROLES, assertBranchAccess, getUserBranchId, isSuperAdmin } from '../../lib/access';

const router = Router();
router.use(authenticate);

// ── Multer Config ─────────────────────────────────────────────────────

const UPLOAD_DIR = process.env.UPLOAD_DIR || './uploads';

const storage = multer.diskStorage({
  destination: UPLOAD_DIR,
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    cb(null, `${unique}${path.extname(file.originalname)}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: (parseInt(process.env.MAX_FILE_SIZE_MB || '50')) * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['.csv', '.xlsx', '.xls'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (!allowed.includes(ext)) {
      cb(new Error(`Invalid file type. Allowed: ${allowed.join(', ')}`));
    } else {
      cb(null, true);
    }
  },
});

// ── POST /api/leads/upload/:campaignId ────────────────────────────────

router.post(
  '/upload/:campaignId',
  requireRole(...ADMIN_ROLES),
  upload.single('file'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.file) throw new AppError(400, 'NO_FILE', 'No file uploaded');

      const campaignId = param(req, 'campaignId');
      const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
      if (!campaign) throw new AppError(404, 'CAMPAIGN_NOT_FOUND', 'Campaign not found');
      assertBranchAccess(req.user!, campaign.branchId);
      if (campaign.status === 'closed') throw new AppError(400, 'CAMPAIGN_CLOSED', 'Cannot upload to a closed campaign');

      const job = await leadUploadQueue.add('process-leads', {
        campaignId,
        filePath: req.file.path,
        fileExt: path.extname(req.file.originalname).toLowerCase(),
        uploadedBy: req.user!.userId,
      });

      res.status(202).json({
        success: true,
        data: {
          jobId: job.id,
          message: 'Upload queued for processing',
          statusUrl: `/api/leads/upload/status/${job.id}`,
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

// ── GET /api/leads/upload/status/:jobId ───────────────────────────────

router.get('/upload/status/:jobId', requireRole(...ADMIN_ROLES, 'supervisor'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const jobId = param(req, 'jobId');
    const progress = await getUploadProgress(jobId);
    if (!progress) throw new AppError(404, 'JOB_NOT_FOUND', 'Upload job not found');
    res.json({ success: true, data: { jobId, ...progress } });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/leads ─────────────────────────────────────────────────────
// List leads — scoped by role

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { role: callerRole, userId } = req.user!;
    const {
      page = '1', limit = '50', campaignId, status, priority, assignedToId, q, callResult, followUpStatus, from, to,
    } = req.query as Record<string, string>;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    let where: Record<string, unknown> = { deletedAt: null };

    if (callerRole === 'agent') {
      where.assignedToId = userId;
    } else if (callerRole === 'supervisor') {
      where = { deletedAt: null, campaign: { team: { supervisorId: userId } } };
    } else if (!isSuperAdmin(callerRole)) {
      where.branchId = getUserBranchId(req.user!);
    }

    if (campaignId) where.campaignId = campaignId;
    if (status) where.status = status;
    if (priority) where.priority = priority;
    if (assignedToId && callerRole !== 'agent') {
      where.assignedToId = assignedToId === 'null' ? null : assignedToId;
    }

    // Date range filter on createdAt (IST). Used by the admin dashboard.
    if (from || to) {
      const range: Record<string, Date> = {};
      if (from) range.gte = new Date(`${from}T00:00:00+05:30`);
      if (to) range.lte = new Date(`${to}T23:59:59.999+05:30`);
      where.createdAt = range;
    }

    if (q && q.trim()) {
      const term = q.trim();
      where.OR = [
        { name: { contains: term, mode: 'insensitive' } },
        { phone: { contains: term } },
        { email: { contains: term, mode: 'insensitive' } },
      ];
    }

    // Filter by latest call result (disposition of the most recent CallLog per lead).
    // Uses DISTINCT ON to get the latest disposition per lead, then narrows the
    // leads query to those whose latest disposition matches.
    if (callResult) {
      const rows = await prisma.$queryRaw<{ leadId: string; dispositionTag: string }[]>`
        SELECT DISTINCT ON ("leadId") "leadId", "dispositionTag"
        FROM "call_logs"
        ORDER BY "leadId", "calledAt" DESC
      `;
      const matchingIds = rows
        .filter((r) => r.dispositionTag === callResult)
        .map((r) => r.leadId);
      // Combine with any existing id filter; empty list → no rows.
      where.id = matchingIds.length ? { in: matchingIds } : { in: ['__none__'] };
    }

    // Filter by follow-up status (has at least one follow-up with that status).
    if (followUpStatus) {
      where.followUps = { some: { status: followUpStatus } };
    }

    const [leads, total] = await Promise.all([
      prisma.lead.findMany({
        where,
        skip,
        take: parseInt(limit),
        orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
        select: {
          id: true,
          // Mask phone for agents — show only last 4 digits
          phone: callerRole !== 'agent',
          email: true,
          name: true,
          status: true,
          priority: true,
          isDnd: true,
          lastCalledAt: true,
          campaignId: true,
          campaign: { select: { name: true } },
          assignedToId: true,
          createdAt: true,
          assignedTo: { select: { id: true, name: true } },
          callLogs: {
            take: 1,
            orderBy: { calledAt: 'desc' },
            select: { dispositionTag: true, calledAt: true, notes: true },
          },
        },
      }),
      prisma.lead.count({ where }),
    ]);

    // Apply phone masking for agents
    const formattedLeads = leads.map((l) => {
      const { callLogs, ...rest } = l as typeof l & { callLogs?: Array<{ dispositionTag: string; calledAt: Date; notes: string | null }> };
      const lastCallNotes = callLogs?.[0]?.notes || null;
      // Notes are stored as "Language: <lang> | <description>". Extract both parts.
      let lastCallLanguage: string | null = null;
      let lastCallDescription: string | null = null;
      if (lastCallNotes) {
        const m = lastCallNotes.match(/^Language:\s*([^|]+?)(?:\s*\|\s*(.*))?$/i);
        if (m) {
          lastCallLanguage = m[1].trim();
          lastCallDescription = (m[2] || '').trim() || null;
        } else {
          lastCallDescription = lastCallNotes;
        }
      }
      return {
        ...rest,
        phone: callerRole === 'agent'
          ? `****${(l as { phone?: string }).phone?.slice(-4) || '****'}`
          : (l as { phone?: string }).phone,
        lastCallResult: callLogs?.[0]?.dispositionTag || null,
        lastCallLanguage,
        lastCallDescription,
      };
    });

    res.json({ success: true, data: { leads: formattedLeads, total, page: parseInt(page), limit: parseInt(limit) } });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/leads/:id/call-target ───────────────────────────────────

router.get('/:id/call-target', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = param(req, 'id');
    const { role: callerRole, userId } = req.user!;

    if (!['super_admin', 'branch_admin', 'agent'].includes(callerRole)) {
      throw new AppError(403, 'FORBIDDEN', 'You cannot initiate calls from this role');
    }

    const lead = await prisma.lead.findFirst({
      where: { id, deletedAt: null },
      select: {
        id: true,
        name: true,
        phone: true,
        isDnd: true,
        assignedToId: true,
        branchId: true,
      },
    });

    if (!lead) throw new AppError(404, 'LEAD_NOT_FOUND', 'Lead not found');

    if (callerRole === 'agent' && lead.assignedToId !== userId) {
      throw new AppError(403, 'FORBIDDEN', 'This lead is not assigned to you');
    }

    if (callerRole !== 'super_admin') {
      assertBranchAccess(req.user!, lead.branchId);
    }

    if (lead.isDnd) {
      throw new AppError(400, 'DND_BLOCKED', 'This number is on the DND list');
    }

    res.json({
      success: true,
      data: {
        id: lead.id,
        name: lead.name,
        phone: lead.phone,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/leads/:id ─────────────────────────────────────────────────

router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = param(req, 'id');
    const { role: callerRole, userId } = req.user!;

    const lead = await prisma.lead.findFirst({
      where: { id, deletedAt: null },
      include: {
        campaign: { select: { id: true, name: true, type: true } },
        assignedTo: { select: { id: true, name: true } },
        callLogs: {
          orderBy: { calledAt: 'desc' },
          take: 10,
          include: { agent: { select: { id: true, name: true } } },
        },
        followUps: {
          where: { status: 'pending' },
          orderBy: { scheduledAt: 'asc' },
        },
        comments: {
          orderBy: { createdAt: 'desc' },
          include: { agent: { select: { id: true, name: true } } },
        },
      },
    });

    if (!lead) throw new AppError(404, 'LEAD_NOT_FOUND', 'Lead not found');
    if (callerRole === 'agent' && lead.assignedToId !== userId) {
      throw new AppError(403, 'FORBIDDEN', 'This lead is not assigned to you');
    }

    // Mask phone for agents
    const response = {
      ...lead,
      phone: callerRole === 'agent' ? `****${lead.phone.slice(-4)}` : lead.phone,
    };

    res.json({ success: true, data: response });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/leads/assign ─────────────────────────────────────────────
// Admin assigns leads to agents

const assignSchema = z.object({
  leadIds: z.array(z.string().uuid()).min(1).max(1000),
  agentId: z.string().uuid(),
});

router.post('/assign', requireRole(...ADMIN_ROLES, 'supervisor'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { leadIds, agentId } = assignSchema.parse(req.body);

    const agent = await prisma.user.findUnique({ where: { id: agentId } });
    if (!agent || agent.role !== 'agent') throw new AppError(400, 'INVALID_AGENT', 'Target user is not an agent');

    // Assign ALL selected leads — including already-assigned ones (re-assign)
    const result = await prisma.lead.updateMany({
      where: { id: { in: leadIds } },
      data: { assignedToId: agentId },
    });

    res.json({ success: true, data: { assigned: result.count, message: `Assigned ${result.count} leads to ${agent.name}` } });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/leads/assign-campaign ───────────────────────────────────────
// Admin assigns ALL unassigned leads in a campaign to an agent in one click

router.post('/assign-campaign', requireRole(...ADMIN_ROLES, 'supervisor'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { campaignId, agentId } = z.object({
      campaignId: z.string().uuid(),
      agentId: z.string().uuid(),
    }).parse(req.body);

    const agent = await prisma.user.findUnique({ where: { id: agentId } });
    if (!agent || agent.role !== 'agent') throw new AppError(400, 'INVALID_AGENT', 'Target user is not an agent');

    const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
    if (!campaign) throw new AppError(404, 'CAMPAIGN_NOT_FOUND', 'Campaign not found');

    const result = await prisma.lead.updateMany({
      where: { campaignId, assignedToId: null },
      data: { assignedToId: agentId },
    });

    res.json({
      success: true,
      data: { assigned: result.count, message: `Assigned ${result.count} unassigned leads in "${campaign.name}" to ${agent.name}` },
    });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/leads/reclaim ────────────────────────────────────────────
// Admin reclaims leads from agent (keeps in DB, unassigns)

router.post('/reclaim', requireRole(...ADMIN_ROLES, 'supervisor'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { leadIds } = z.object({ leadIds: z.array(z.string().uuid()).min(1) }).parse(req.body);

    const result = await prisma.lead.updateMany({
      where: { id: { in: leadIds } },
      data: { assignedToId: null },
    });

    res.json({ success: true, data: { reclaimed: result.count, message: `Reclaimed ${result.count} leads` } });
  } catch (err) {
    next(err);
  }
});

// ── PUT /api/leads/:id/status ──────────────────────────────────────────
// Update lead status (agent updates after call)

router.put('/:id/status', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = param(req, 'id');
    const { status } = z.object({
      status: z.enum(['uncontacted', 'contacted', 'lead', 'not_interested', 'dnd', 'invalid', 'callback']),
    }).parse(req.body);

    const lead = await prisma.lead.findFirst({ where: { id, deletedAt: null } });
    if (!lead) throw new AppError(404, 'LEAD_NOT_FOUND', 'Lead not found');

    if (req.user!.role === 'agent' && lead.assignedToId !== req.user!.userId) {
      throw new AppError(403, 'FORBIDDEN', 'This lead is not assigned to you');
    }

    // If marked as DND, add to blocklist
    const updates: Record<string, unknown> = { status };
    if (status === 'dnd') {
      updates.isDnd = true;
      await prisma.dndBlocklist.upsert({
        where: { phone: lead.phone },
        create: { phone: lead.phone, reason: 'Agent-marked DND' },
        update: {},
      });
    }

    const updated = await prisma.lead.update({ where: { id }, data: updates });
    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/leads/:id/comments ───────────────────────────────────────
// Add internal note to lead
router.post('/:id/comments', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = param(req, 'id');
    const { content } = z.object({ content: z.string().min(1).max(2000) }).parse(req.body);
    const agentId = req.user!.userId;

    const lead = await prisma.lead.findFirst({ where: { id, deletedAt: null } });
    if (!lead) throw new AppError(404, 'LEAD_NOT_FOUND', 'Lead not found');

    if (req.user!.role === 'agent' && lead.assignedToId !== agentId) {
      throw new AppError(403, 'FORBIDDEN', 'This lead is not assigned to you');
    }

    const comment = await prisma.leadComment.create({
      data: { leadId: id, agentId, content },
      include: { agent: { select: { id: true, name: true } } },
    });

    res.status(201).json({ success: true, data: comment });
  } catch (err) {
    next(err);
  }
});

// ── DELETE /api/leads ──────────────────────────────────────────────────
// Bulk soft-delete leads (admin only). Body: { leadIds: string[] }

router.delete('/', requireRole(...ADMIN_ROLES), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { leadIds } = z.object({ leadIds: z.array(z.string().uuid()).min(1).max(1000) }).parse(req.body);

    // Verify all leads belong to caller's branch (super_admin skips)
    if (!isSuperAdmin(req.user!.role)) {
      const branchId = getUserBranchId(req.user!);
      const alien = await prisma.lead.findFirst({
        where: { id: { in: leadIds }, branchId: { not: branchId }, deletedAt: null },
        select: { id: true },
      });
      if (alien) throw new AppError(403, 'FORBIDDEN', 'One or more leads do not belong to your branch');
    }

    const result = await prisma.lead.updateMany({
      where: { id: { in: leadIds }, deletedAt: null },
      data: { deletedAt: new Date() },
    });

    res.json({ success: true, data: { deleted: result.count, message: `${result.count} lead(s) deleted` } });
  } catch (err) {
    next(err);
  }
});

// ── DELETE /api/leads/:id ──────────────────────────────────────────────
// Soft-delete a single lead (admin only)

router.delete('/:id', requireRole(...ADMIN_ROLES), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = param(req, 'id');
    const lead = await prisma.lead.findFirst({ where: { id, deletedAt: null }, select: { branchId: true } });
    if (!lead) throw new AppError(404, 'LEAD_NOT_FOUND', 'Lead not found');
    if (!isSuperAdmin(req.user!.role)) assertBranchAccess(req.user!, lead.branchId);

    await prisma.lead.update({ where: { id }, data: { deletedAt: new Date() } });
    res.json({ success: true, data: { message: 'Lead deleted' } });
  } catch (err) {
    next(err);
  }
});

export default router;
