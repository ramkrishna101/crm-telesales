import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { authenticate, requireRole } from '../../middleware/auth';
import { ADMIN_ROLES, assertBranchAccess, resolveBranchId } from '../../lib/access';
import { AppError } from '../../middleware/errorHandler';
import { encryptStringeePortalInput, toStringeePortalSummary } from '../../lib/stringeePortalConfig';
import { param } from '../../lib/params';
import { encryptCredential } from '../../lib/stringee';

const router = Router();
router.use(authenticate);
router.use(requireRole(...ADMIN_ROLES));

const createPortalSchema = z.object({
  branchId: z.string().uuid().optional(),
  portalName: z.string().min(2).max(120),
  apiSid: z.string().min(1).max(255),
  apiSecret: z.string().min(1).max(255),
  tenant: z.string().min(1).max(120),
  adminEmail: z.string().email().max(255),
  adminPassword: z.string().min(1).max(255),
});

const updatePortalSchema = z.object({
  portalName: z.string().min(2).max(120).optional(),
  apiSid: z.string().min(1).max(255).optional(),
  apiSecret: z.string().min(1).max(255).optional(),
  tenant: z.string().min(1).max(120).optional(),
  adminEmail: z.string().email().max(255).optional(),
  adminPassword: z.string().min(1).max(255).optional(),
});

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const branchId = resolveBranchId(req.user!, (req.query.branchId as string | undefined) || undefined);
    const configs = await prisma.stringeePortalConfig.findMany({
      where: { branchId },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        branchId: true,
        portalName: true,
        tenant: true,
        adminEmailEnc: true,
        apiSidEnc: true,
        apiSecretEnc: true,
        adminPasswordEnc: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    res.json({ success: true, data: configs.map(toStringeePortalSummary) });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = param(req, 'id');
    const config = await prisma.stringeePortalConfig.findUnique({
      where: { id },
      select: {
        id: true,
        branchId: true,
        portalName: true,
        tenant: true,
        adminEmailEnc: true,
        apiSidEnc: true,
        apiSecretEnc: true,
        adminPasswordEnc: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!config) throw new AppError(404, 'STRINGEE_PORTAL_NOT_FOUND', 'Stringee portal configuration not found');
    assertBranchAccess(req.user!, config.branchId);
    res.json({ success: true, data: toStringeePortalSummary(config) });
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = createPortalSchema.parse(req.body);
    const branchId = resolveBranchId(req.user!, body.branchId);

    const existing = await prisma.stringeePortalConfig.findFirst({
      where: { branchId, portalName: body.portalName.trim() },
      select: { id: true },
    });
    if (existing) {
      throw new AppError(409, 'STRINGEE_PORTAL_EXISTS', 'A Stringee portal with this name already exists for the branch');
    }

    const config = await prisma.stringeePortalConfig.create({
      data: {
        branchId,
        ...encryptStringeePortalInput(body),
      },
      select: {
        id: true,
        branchId: true,
        portalName: true,
        tenant: true,
        adminEmailEnc: true,
        apiSidEnc: true,
        apiSecretEnc: true,
        adminPasswordEnc: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    res.status(201).json({ success: true, data: toStringeePortalSummary(config) });
  } catch (err) {
    next(err);
  }
});

router.put('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = param(req, 'id');
    const body = updatePortalSchema.parse(req.body);
    const existing = await prisma.stringeePortalConfig.findUnique({
      where: { id },
      select: { id: true, branchId: true, portalName: true },
    });

    if (!existing) throw new AppError(404, 'STRINGEE_PORTAL_NOT_FOUND', 'Stringee portal configuration not found');
    assertBranchAccess(req.user!, existing.branchId);

    const nextPortalName = body.portalName?.trim();
    if (nextPortalName && nextPortalName !== existing.portalName) {
      const nameTaken = await prisma.stringeePortalConfig.findFirst({
        where: { branchId: existing.branchId, portalName: nextPortalName, id: { not: existing.id } },
        select: { id: true },
      });
      if (nameTaken) {
        throw new AppError(409, 'STRINGEE_PORTAL_EXISTS', 'A Stringee portal with this name already exists for the branch');
      }
    }

    const updateData: Record<string, unknown> = {};
    if (nextPortalName) updateData.portalName = nextPortalName;
    if (body.tenant) updateData.tenant = body.tenant.trim();
    if (body.apiSid) updateData.apiSidEnc = encryptCredential(body.apiSid.trim());
    if (body.apiSecret) updateData.apiSecretEnc = encryptCredential(body.apiSecret.trim());
    if (body.adminEmail) updateData.adminEmailEnc = encryptCredential(body.adminEmail.trim());
    if (body.adminPassword) updateData.adminPasswordEnc = encryptCredential(body.adminPassword);

    const config = await prisma.stringeePortalConfig.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        branchId: true,
        portalName: true,
        tenant: true,
        adminEmailEnc: true,
        apiSidEnc: true,
        apiSecretEnc: true,
        adminPasswordEnc: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    res.json({ success: true, data: toStringeePortalSummary(config) });
  } catch (err) {
    next(err);
  }
});

export default router;
