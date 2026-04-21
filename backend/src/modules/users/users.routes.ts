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
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6),
  role: z.enum(['admin', 'supervisor', 'agent']),
  teamId: z.string().uuid().optional().nullable(),
});

const updateUserSchema = z.object({
  name: z.string().min(2).optional(),
  email: z.string().email().optional(),
  password: z.string().min(6).optional(),
  role: z.enum(['admin', 'supervisor', 'agent']).optional(),
  teamId: z.string().uuid().optional().nullable(),
  status: z.enum(['active', 'inactive']).optional(),
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
    const { from, to } = req.query as Record<string, string>;
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

export default router;
