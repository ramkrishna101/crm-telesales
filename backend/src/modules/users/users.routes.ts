import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { prisma } from '../../lib/prisma';
import { authenticate, requireRole } from '../../middleware/auth';
import { AppError } from '../../middleware/errorHandler';
import { revokeAllRefreshTokens } from '../../lib/redis';
import { param } from '../../lib/params';

const router = Router();
router.use(authenticate);

// ── Schemas ───────────────────────────────────────────────────────────

const createUserSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email().max(255),
  password: z.string().min(8).max(128),
  role: z.enum(['admin', 'supervisor', 'agent']),
  teamId: z.string().uuid().optional().nullable(),
}).refine(data => !(data.role === 'agent' && !data.teamId), {
  message: "Agents must be assigned to a team to ensure supervisor oversight",
  path: ["teamId"],
});

const updateUserSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  email: z.string().email().max(255).optional(),
  password: z.string().min(8).max(128).optional(),
  role: z.enum(['admin', 'supervisor', 'agent']).optional(),
  teamId: z.string().uuid().optional().nullable(),
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
        : {};

    const { page = '1', limit = '50', teamId, role, status } = req.query as Record<string, string>;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const filter: Record<string, unknown> = { ...where };
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
          status: true, teamId: true, createdAt: true,
          team: { select: { id: true, name: true } },
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

router.get('/:id', requireRole('admin', 'supervisor'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = param(req, 'id');
    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true, name: true, email: true, role: true,
        status: true, teamId: true, createdAt: true, updatedAt: true,
        team: { select: { id: true, name: true } },
      },
    });
    if (!user) throw new AppError(404, 'USER_NOT_FOUND', 'User not found');
    res.json({ success: true, data: user });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/users ───────────────────────────────────────────────────

router.post('/', requireRole('admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = createUserSchema.parse(req.body);
    const exists = await prisma.user.findUnique({ where: { email: body.email } });
    if (exists) throw new AppError(409, 'EMAIL_TAKEN', 'Email is already registered');

    const passwordHash = await bcrypt.hash(body.password, 12);
    const user = await prisma.user.create({
      data: { name: body.name, email: body.email, passwordHash, role: body.role, teamId: body.teamId || null },
      select: { id: true, name: true, email: true, role: true, status: true, teamId: true, createdAt: true },
    });
    res.status(201).json({ success: true, data: user });
  } catch (err) {
    next(err);
  }
});

// ── PUT /api/users/:id ────────────────────────────────────────────────

router.put('/:id', requireRole('admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = param(req, 'id');
    const body = updateUserSchema.parse(req.body);
    const existing = await prisma.user.findUnique({ where: { id } });
    if (!existing) throw new AppError(404, 'USER_NOT_FOUND', 'User not found');

    if (body.email && body.email !== existing.email) {
      const taken = await prisma.user.findUnique({ where: { email: body.email } });
      if (taken) throw new AppError(409, 'EMAIL_TAKEN', 'Email is already registered');
    }

    const updateData: Record<string, unknown> = {};
    if (body.name) updateData.name = body.name;
    if (body.email) updateData.email = body.email;
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
      select: { id: true, name: true, email: true, role: true, status: true, teamId: true, updatedAt: true },
    });
    res.json({ success: true, data: user });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/users/:id/reset-password ────────────────────────────────
// Admin can reset anyone's password.
// Supervisor can reset passwords for agents in their team.

router.post('/:id/reset-password', requireRole('admin', 'supervisor'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = param(req, 'id');
    const { password } = z.object({ password: z.string().min(8).max(128) }).parse(req.body);
    const { role: callerRole, userId: callerId } = req.user!;

    const targetUser = await prisma.user.findUnique({ where: { id }, include: { team: true } });
    if (!targetUser) throw new AppError(404, 'USER_NOT_FOUND', 'User not found');

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

// ── DELETE /api/users/:id (soft deactivate) ───────────────────────────

router.delete('/:id', requireRole('admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = param(req, 'id');
    if (id === req.user!.userId) throw new AppError(400, 'CANNOT_SELF_DELETE', 'Cannot deactivate your own account');

    await prisma.user.update({ where: { id }, data: { status: 'inactive' } });
    await revokeAllRefreshTokens(id);
    res.json({ success: true, data: { message: 'User deactivated' } });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/users/:id/stats ──────────────────────────────────────────

router.get('/:id/stats', requireRole('admin', 'supervisor'), async (req: Request, res: Response, next: NextFunction) => {
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
router.get('/:id/breaks', requireRole('admin', 'supervisor'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const agentId = param(req, 'id');
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
