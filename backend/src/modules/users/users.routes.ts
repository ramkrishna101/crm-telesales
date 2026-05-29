import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { prisma } from '../../lib/prisma';
import { authenticate, requireRole } from '../../middleware/auth';
import { AppError } from '../../middleware/errorHandler';
import { revokeAllRefreshTokens } from '../../lib/redis';
import { param } from '../../lib/params';
import { ADMIN_ROLES, assertBranchAccess, getUserBranchId, isSuperAdmin, resolveBranchId } from '../../lib/access';
import { resolveAssignedStringeePortalForUser, resolveStringeePortalAssignmentId, resolveStringeePortalSecrets } from '../../lib/stringeePortalConfig';
import { hasStringeeXPortalAdminConfig, resolveStringeeAccountIdByEmailForPortal } from '../../lib/stringeexPortalAdmin';

const router = Router();
router.use(authenticate);

// ── Schemas ───────────────────────────────────────────────────────────

const createUserSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email().max(255),
  stringeeEmail: z.string().email().max(255).optional().nullable(),
  stringeeAccountId: z.string().min(1).max(64).optional().nullable(),
  stringeePortalConfigId: z.string().uuid().optional().nullable(),
  password: z.string().min(8).max(128),
  role: z.enum(['branch_admin', 'supervisor', 'agent']),
  branchId: z.string().uuid().optional(),
  teamId: z.string().min(1).max(64).optional().nullable(),
}).refine(data => !(data.role === 'agent' && !data.teamId), {
  message: "Agents must be assigned to a team to ensure supervisor oversight",
  path: ["teamId"],
});

const updateUserSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  email: z.string().email().max(255).optional(),
  stringeeEmail: z.string().email().max(255).optional().nullable(),
  stringeeAccountId: z.string().min(1).max(64).optional().nullable(),
  stringeePortalConfigId: z.string().uuid().optional().nullable(),
  password: z.string().min(8).max(128).optional(),
  role: z.enum(['branch_admin', 'supervisor', 'agent']).optional(),
  teamId: z.string().min(1).max(64).optional().nullable(),
  status: z.enum(['active', 'inactive']).optional(),
}).refine(data => {
  if (data.role === 'agent' && data.teamId === null) return false;
  return true;
}, {
  message: "Agents cannot be unassigned from a team",
  path: ["teamId"],
});

// ── GET /api/users ────────────────────────────────────────────────────

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { role: callerRole, userId } = req.user!;

    if (callerRole === 'agent') throw new AppError(403, 'FORBIDDEN', 'Agents cannot list users');

    const where =
      callerRole === 'supervisor'
        ? { team: { supervisorId: userId } }
        : !isSuperAdmin(callerRole)
          ? { branchId: getUserBranchId(req.user!) }
          : {};

    const { page = '1', limit = '50', teamId, role, status } = req.query as Record<string, string>;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const filter: Record<string, unknown> = { ...where, deletedAt: null };
    if (teamId) filter.teamId = teamId;
    if (role) filter.role = role;
    if (status) filter.status = status;

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where: filter,
        skip,
        take: parseInt(limit),
        orderBy: { createdAt: 'desc' },
        select: {
          id: true, name: true, email: true, role: true,
          stringeeEmail: true, stringeeAccountId: true,
          stringeePortalConfigId: true,
          status: true, teamId: true, createdAt: true,
          branch: { select: { id: true, name: true } },
          team: { select: { id: true, name: true } },
          stringeePortalConfig: { select: { id: true, portalName: true } },
        },
      }),
      prisma.user.count({ where: filter }),
    ]);

    res.json({ success: true, data: { users, total, page: parseInt(page), limit: parseInt(limit) } });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/users/:id ────────────────────────────────────────────────

router.get('/:id', requireRole(...ADMIN_ROLES, 'supervisor'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = param(req, 'id');
    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true, name: true, email: true, role: true,
        stringeeEmail: true, stringeeAccountId: true,
        stringeePortalConfigId: true,
        branchId: true, status: true, teamId: true, createdAt: true, updatedAt: true,
        team: { select: { id: true, name: true } },
        stringeePortalConfig: { select: { id: true, portalName: true } },
      },
    });
    if (!user) throw new AppError(404, 'USER_NOT_FOUND', 'User not found');
    assertBranchAccess(req.user!, user.branchId);
    res.json({ success: true, data: user });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/users ───────────────────────────────────────────────────

router.post('/', requireRole(...ADMIN_ROLES), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = createUserSchema.parse(req.body);
    const branchId = resolveBranchId(req.user!, body.branchId);
    const exists = await prisma.user.findUnique({ where: { email: body.email } });
    if (exists) throw new AppError(409, 'EMAIL_TAKEN', 'Email is already registered');
    if (body.stringeeEmail) {
      const stringeeEmailTaken = await prisma.user.findFirst({ where: { stringeeEmail: body.stringeeEmail, deletedAt: null }, select: { name: true } });
      if (stringeeEmailTaken) throw new AppError(409, 'STRINGEE_EMAIL_TAKEN', `Stringee email is already linked to ${stringeeEmailTaken.name} — clear it from them first`);
    }

    if (body.teamId) {
      const team = await prisma.team.findUnique({ where: { id: body.teamId }, select: { branchId: true } });
      if (!team) throw new AppError(404, 'TEAM_NOT_FOUND', 'Team not found');
      if (team.branchId !== branchId) {
        throw new AppError(400, 'TEAM_BRANCH_MISMATCH', 'Team belongs to a different branch');
      }
    }

    const passwordHash = await bcrypt.hash(body.password, 12);
    const stringeePortalConfigId = await resolveStringeePortalAssignmentId(branchId, body.stringeePortalConfigId);

    let resolvedAccountId = body.stringeeAccountId?.trim() || null;
    if (!resolvedAccountId && body.stringeeEmail && stringeePortalConfigId) {
      try {
        const portal = await prisma.stringeePortalConfig.findUnique({
          where: { id: stringeePortalConfigId },
          select: {
            id: true,
            branchId: true,
            portalName: true,
            tenant: true,
            apiSidEnc: true,
            apiSecretEnc: true,
            adminEmailEnc: true,
            adminPasswordEnc: true,
            createdAt: true,
            updatedAt: true,
          },
        });
        if (portal) {
          const portalSecrets = resolveStringeePortalSecrets(portal);
          const resolvedPortal = {
            portalConfigId: portal.id,
            tenant: portal.tenant,
            adminEmail: portalSecrets.adminEmail,
            adminPassword: portalSecrets.adminPassword,
          };
          if (hasStringeeXPortalAdminConfig(resolvedPortal)) {
            resolvedAccountId = await resolveStringeeAccountIdByEmailForPortal(body.stringeeEmail, resolvedPortal);
          }
        }
      } catch (err) {
        console.warn('[stringeex] auto-resolve on create failed:', (err as Error).message);
      }
    }

    const user = await prisma.user.create({
      data: {
        name: body.name,
        email: body.email,
        stringeeEmail: body.stringeeEmail || null,
        stringeeAccountId: resolvedAccountId,
        stringeePortalConfigId,
        passwordHash,
        role: body.role,
        branchId,
        teamId: body.teamId || null,
      },
      select: {
        id: true,
        name: true,
        email: true,
        stringeeEmail: true,
        stringeeAccountId: true,
        stringeePortalConfigId: true,
        role: true,
        branchId: true,
        status: true,
        teamId: true,
        createdAt: true,
        stringeePortalConfig: { select: { id: true, portalName: true } },
      },
    });
    res.status(201).json({ success: true, data: user });
  } catch (err) {
    next(err);
  }
});

// ── PUT /api/users/:id ────────────────────────────────────────────────

router.put('/:id', requireRole(...ADMIN_ROLES), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = param(req, 'id');
    const body = updateUserSchema.parse(req.body);
    const existing = await prisma.user.findUnique({ where: { id } });
    if (!existing) throw new AppError(404, 'USER_NOT_FOUND', 'User not found');
    assertBranchAccess(req.user!, existing.branchId);

    if (body.email && body.email !== existing.email) {
      const taken = await prisma.user.findUnique({ where: { email: body.email } });
      if (taken) throw new AppError(409, 'EMAIL_TAKEN', 'Email is already registered');
    }
    if (body.stringeeEmail !== undefined && body.stringeeEmail !== existing.stringeeEmail) {
      if (body.stringeeEmail) {
        const stringeeEmailTaken = await prisma.user.findFirst({ where: { stringeeEmail: body.stringeeEmail, deletedAt: null } });
        if (stringeeEmailTaken && stringeeEmailTaken.id !== existing.id) {
          throw new AppError(409, 'STRINGEE_EMAIL_TAKEN', `Stringee email is already linked to ${stringeeEmailTaken.name} — clear it from them first`);
        }
      }
    }

    const updateData: Record<string, unknown> = {};
    if (body.name) updateData.name = body.name;
    if (body.email) updateData.email = body.email;
    if (body.stringeeEmail !== undefined) {
      updateData.stringeeEmail = body.stringeeEmail || null;
    }
    const effectiveStringeeEmail = body.stringeeEmail !== undefined
      ? body.stringeeEmail || null
      : existing.stringeeEmail;
    const nextPortalConfigId = body.stringeePortalConfigId !== undefined
      ? await resolveStringeePortalAssignmentId(existing.branchId || '', body.stringeePortalConfigId)
      : existing.stringeePortalConfigId;
    const portalChanged = nextPortalConfigId !== existing.stringeePortalConfigId;
    if (body.stringeePortalConfigId !== undefined) {
      updateData.stringeePortalConfigId = nextPortalConfigId;
    }
    if (body.stringeeAccountId !== undefined) {
      const explicitId = body.stringeeAccountId?.trim() || null;
      const emailChanged =
        body.stringeeEmail !== undefined &&
        (body.stringeeEmail || null) !== existing.stringeeEmail &&
        body.stringeeEmail;
      if (!explicitId && (emailChanged || portalChanged) && effectiveStringeeEmail && nextPortalConfigId) {
        try {
          const portal = await prisma.stringeePortalConfig.findUnique({
            where: { id: nextPortalConfigId },
            select: {
              id: true,
              branchId: true,
              portalName: true,
              tenant: true,
              apiSidEnc: true,
              apiSecretEnc: true,
              adminEmailEnc: true,
              adminPasswordEnc: true,
              createdAt: true,
              updatedAt: true,
            },
          });
          if (portal) {
            const portalSecrets = resolveStringeePortalSecrets(portal);
            const resolvedPortal = {
              portalConfigId: portal.id,
              tenant: portal.tenant,
              adminEmail: portalSecrets.adminEmail,
              adminPassword: portalSecrets.adminPassword,
            };
            if (hasStringeeXPortalAdminConfig(resolvedPortal)) {
              updateData.stringeeAccountId = await resolveStringeeAccountIdByEmailForPortal(body.stringeeEmail as string, resolvedPortal);
            }
          }
        } catch (err) {
          console.warn('[stringeex] auto-resolve on update failed:', (err as Error).message);
          updateData.stringeeAccountId = null;
        }
      } else if (!explicitId && portalChanged) {
        updateData.stringeeAccountId = null;
      } else {
        updateData.stringeeAccountId = explicitId;
      }
    }
    if (body.role) updateData.role = body.role;
    if (body.teamId !== undefined) updateData.teamId = body.teamId;
    if (body.status) {
      updateData.status = body.status;
      if (body.status === 'inactive') await revokeAllRefreshTokens(id);
    }
    if (body.password) updateData.passwordHash = await bcrypt.hash(body.password, 12);

    const user = await prisma.user.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        name: true,
        email: true,
        stringeeEmail: true,
        stringeeAccountId: true,
        stringeePortalConfigId: true,
        role: true,
        status: true,
        teamId: true,
        updatedAt: true,
        stringeePortalConfig: { select: { id: true, portalName: true } },
      },
    });
    res.json({ success: true, data: user });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/users/:id/reset-password ────────────────────────────────
// Admin can reset anyone's password.
// Supervisor can reset passwords for agents in their team.

router.post('/:id/reset-password', requireRole(...ADMIN_ROLES, 'supervisor'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = param(req, 'id');
    const { password } = z.object({ password: z.string().min(8).max(128) }).parse(req.body);
    const { role: callerRole, userId: callerId } = req.user!;

    const targetUser = await prisma.user.findUnique({ where: { id }, include: { team: true } });
    if (!targetUser) throw new AppError(404, 'USER_NOT_FOUND', 'User not found');
    assertBranchAccess(req.user!, targetUser.branchId);

    // Access Control:
    if (callerRole === 'supervisor') {
      if (targetUser.role !== 'agent') throw new AppError(403, 'FORBIDDEN', 'Supervisors can only reset passwords for agents');
      if (targetUser.team?.supervisorId !== callerId) throw new AppError(403, 'FORBIDDEN', 'This agent is not in your team');
    }

    const passwordHash = await bcrypt.hash(password, 12);
    await prisma.user.update({
      where: { id },
      data: { passwordHash }
    });

    // Security: Kill all sessions for this user
    await revokeAllRefreshTokens(id);

    res.json({ success: true, data: { message: `Password reset successfully for ${targetUser.name}` } });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/users/:id/sync-stringee ─────────────────────────────────
// Re-fetch the agent's account_id from the StringeeX tenant portal and
// store it on the user. Requires STRINGEEX_ADMIN_* env vars.

router.post('/:id/sync-stringee', requireRole(...ADMIN_ROLES), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = param(req, 'id');
    const target = await prisma.user.findUnique({
      where: { id },
      select: { id: true, branchId: true, stringeeEmail: true },
    });
    if (!target) throw new AppError(404, 'USER_NOT_FOUND', 'User not found');
    assertBranchAccess(req.user!, target.branchId);
    if (!target.stringeeEmail) {
      throw new AppError(400, 'STRINGEE_EMAIL_REQUIRED', 'Set the user\u2019s Stringee email before syncing');
    }

    let accountId: string | null = null;
    try {
      const portal = await resolveAssignedStringeePortalForUser(target.id);
      accountId = await resolveStringeeAccountIdByEmailForPortal(target.stringeeEmail, {
        portalConfigId: portal.id,
        tenant: portal.tenant,
        adminEmail: portal.adminEmail,
        adminPassword: portal.adminPassword,
      });
    } catch (err: any) {
      if (err instanceof AppError) throw err;
      throw new AppError(502, 'STRINGEEX_SYNC_FAILED', err.message || 'StringeeX lookup failed');
    }

    if (!accountId) {
      throw new AppError(
        404,
        'STRINGEEX_AGENT_NOT_FOUND',
        `No StringeeX agent found with email ${target.stringeeEmail}`,
      );
    }

    const user = await prisma.user.update({
      where: { id },
      data: { stringeeAccountId: accountId },
      select: { id: true, stringeeEmail: true, stringeeAccountId: true, stringeePortalConfigId: true, stringeePortalConfig: { select: { id: true, portalName: true } } },
    });
    res.json({ success: true, data: user });
  } catch (err) {
    next(err);
  }
});

// ── DELETE /api/users/:id (soft deactivate) ───────────────────────────

router.delete('/:id', requireRole(...ADMIN_ROLES), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = param(req, 'id');
    if (id === req.user!.userId) throw new AppError(400, 'CANNOT_SELF_DELETE', 'Cannot delete your own account');

    const existing = await prisma.user.findFirst({ where: { id, deletedAt: null }, select: { branchId: true, email: true } });
    if (!existing) throw new AppError(404, 'USER_NOT_FOUND', 'User not found');
    assertBranchAccess(req.user!, existing.branchId);

    // Soft delete: mark deletedAt, mark inactive, and free up the unique email
    // by suffixing it so a future user can re-use the same address.
    const tombstone = `${existing.email}__deleted_${Date.now()}`;
    await prisma.user.update({
      where: { id },
      data: { deletedAt: new Date(), status: 'inactive', email: tombstone },
    });
    await revokeAllRefreshTokens(id);
    res.json({ success: true, data: { message: 'User deleted' } });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/users/:id/stats ──────────────────────────────────────────

router.get('/:id/stats', requireRole(...ADMIN_ROLES, 'supervisor'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const agentId = param(req, 'id');
    const { role: callerRole, userId: callerId } = req.user!;
    const { from, to } = req.query as Record<string, string>;

    // Supervisors may only query stats for agents in their own team (IDOR prevention)
    if (callerRole === 'supervisor') {
      const targetUser = await prisma.user.findUnique({ where: { id: agentId }, select: { team: { select: { supervisorId: true } } } });
      if (!targetUser) throw new AppError(404, 'USER_NOT_FOUND', 'User not found');
      if (targetUser.team?.supervisorId !== callerId) {
        throw new AppError(403, 'FORBIDDEN', 'You can only view stats for agents in your team');
      }
    } else {
      const targetUser = await prisma.user.findUnique({ where: { id: agentId }, select: { branchId: true } });
      if (!targetUser) throw new AppError(404, 'USER_NOT_FOUND', 'User not found');
      assertBranchAccess(req.user!, targetUser.branchId);
    }

    const dateFilter = from && to ? { gte: new Date(from), lte: new Date(to) } : undefined;

    const [totalCalls, totalLeads, followUpsCount] = await Promise.all([
      prisma.callLog.count({ where: { agentId, ...(dateFilter ? { calledAt: dateFilter } : {}) } }),
      prisma.lead.count({ where: { assignedToId: agentId } }),
      prisma.followUp.count({ where: { agentId, ...(dateFilter ? { scheduledAt: dateFilter } : {}) } }),
    ]);

    res.json({ success: true, data: { agentId, totalCalls, totalLeads, followUpsCount } });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/users/me/break/start ──────────────────────────────────────
router.post('/me/break/start', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (user?.status === 'on_break') throw new AppError(400, 'ALREADY_ON_BREAK', 'You are already on break');

    await prisma.$transaction([
      prisma.user.update({
        where: { id: userId },
        data: { status: 'on_break', breakStartedAt: new Date() }
      }),
      prisma.breakLog.create({
        data: { agentId: userId, startedAt: new Date() }
      })
    ]);
    res.json({ success: true, data: { message: 'Break started', status: 'on_break' } });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/users/me/break/end ────────────────────────────────────────
router.post('/me/break/end', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (user?.status !== 'on_break') throw new AppError(400, 'NOT_ON_BREAK', 'You are not on break');

    const openBreak = await prisma.breakLog.findFirst({
      where: { agentId: userId, endedAt: null },
      orderBy: { startedAt: 'desc' }
    });

    await prisma.$transaction([
      prisma.user.update({
        where: { id: userId },
        data: { status: 'active', breakStartedAt: null }
      }),
      ...(openBreak ? [prisma.breakLog.update({
        where: { id: openBreak.id },
        data: { endedAt: new Date() }
      })] : [])
    ]);

    res.json({ success: true, data: { message: 'Break ended', status: 'active' } });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/users/:id/breaks ──────────────────────────────────────────
router.get('/:id/breaks', requireRole(...ADMIN_ROLES, 'supervisor'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const agentId = param(req, 'id');
    const targetUser = await prisma.user.findUnique({ where: { id: agentId }, select: { branchId: true, team: { select: { supervisorId: true } } } });
    if (!targetUser) throw new AppError(404, 'USER_NOT_FOUND', 'User not found');
    if (req.user!.role === 'supervisor' && targetUser.team?.supervisorId !== req.user!.userId) {
      throw new AppError(403, 'FORBIDDEN', 'You can only view breaks for agents in your team');
    }
    assertBranchAccess(req.user!, targetUser.branchId);
    const { from, to } = req.query as Record<string, string>;
    const dateFilter = from && to ? { gte: new Date(from), lte: new Date(to) } : undefined;

    const breaks = await prisma.breakLog.findMany({
      where: { agentId, ...(dateFilter ? { startedAt: dateFilter } : {}) },
      orderBy: { startedAt: 'desc' },
      take: 100
    });

    res.json({ success: true, data: breaks });
  } catch (err) {
    next(err);
  }
});

export default router;
