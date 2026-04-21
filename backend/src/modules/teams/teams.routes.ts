import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { authenticate, requireRole } from '../../middleware/auth';
import { AppError } from '../../middleware/errorHandler';
import { param } from '../../lib/params';

const router = Router();
router.use(authenticate);

const createTeamSchema = z.object({
  name: z.string().min(2),
  supervisorId: z.string().uuid().optional().nullable(),
});

const updateTeamSchema = z.object({
  name: z.string().min(2).optional(),
  supervisorId: z.string().uuid().optional().nullable(),
});

// ── GET /api/teams ────────────────────────────────────────────────────

router.get('/', requireRole('admin', 'supervisor'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { role: callerRole, userId } = req.user!;
    const where = callerRole === 'admin' ? {} : { supervisorId: userId };

    const teams = await prisma.team.findMany({
      where,
      orderBy: { name: 'asc' },
      include: {
        supervisor: { select: { id: true, name: true, email: true } },
        _count: { select: { members: true } },
      },
    });
    res.json({ success: true, data: teams });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/teams/:id ────────────────────────────────────────────────

router.get('/:id', requireRole('admin', 'supervisor'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = param(req, 'id');
    const team = await prisma.team.findUnique({
      where: { id },
      include: {
        supervisor: { select: { id: true, name: true, email: true } },
        members: { select: { id: true, name: true, email: true, role: true, status: true } },
        _count: { select: { members: true, campaigns: true } },
      },
    });
    if (!team) throw new AppError(404, 'TEAM_NOT_FOUND', 'Team not found');
    if (req.user!.role === 'supervisor' && team.supervisorId !== req.user!.userId) {
      throw new AppError(403, 'FORBIDDEN', 'You can only view your own team');
    }
    res.json({ success: true, data: team });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/teams ───────────────────────────────────────────────────

router.post('/', requireRole('admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = createTeamSchema.parse(req.body);
    if (body.supervisorId) {
      const supervisor = await prisma.user.findUnique({ where: { id: body.supervisorId } });
      if (!supervisor || supervisor.role !== 'supervisor') {
        throw new AppError(400, 'INVALID_SUPERVISOR', 'Supervisor user not found or has wrong role');
      }
    }
    const team = await prisma.team.create({
      data: { name: body.name, supervisorId: body.supervisorId || null },
      include: { supervisor: { select: { id: true, name: true } } },
    });
    res.status(201).json({ success: true, data: team });
  } catch (err) {
    next(err);
  }
});

// ── PUT /api/teams/:id ────────────────────────────────────────────────

router.put('/:id', requireRole('admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = param(req, 'id');
    const body = updateTeamSchema.parse(req.body);
    const existing = await prisma.team.findUnique({ where: { id } });
    if (!existing) throw new AppError(404, 'TEAM_NOT_FOUND', 'Team not found');

    if (body.supervisorId) {
      const supervisor = await prisma.user.findUnique({ where: { id: body.supervisorId } });
      if (!supervisor || supervisor.role !== 'supervisor') {
        throw new AppError(400, 'INVALID_SUPERVISOR', 'Supervisor not found or wrong role');
      }
    }

    const team = await prisma.team.update({
      where: { id },
      data: {
        ...(body.name && { name: body.name }),
        ...(body.supervisorId !== undefined && { supervisorId: body.supervisorId }),
      },
      include: {
        supervisor: { select: { id: true, name: true } },
        _count: { select: { members: true } },
      },
    });
    res.json({ success: true, data: team });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/teams/:id/members ───────────────────────────────────────

router.post('/:id/members', requireRole('admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = param(req, 'id');
    const { agentIds } = z.object({ agentIds: z.array(z.string().uuid()).min(1) }).parse(req.body);
    const team = await prisma.team.findUnique({ where: { id } });
    if (!team) throw new AppError(404, 'TEAM_NOT_FOUND', 'Team not found');

    await prisma.user.updateMany({
      where: { id: { in: agentIds }, role: 'agent' },
      data: { teamId: id },
    });
    res.json({ success: true, data: { message: `Added ${agentIds.length} agents to team` } });
  } catch (err) {
    next(err);
  }
});

// ── DELETE /api/teams/:id/members ─────────────────────────────────────

router.delete('/:id/members', requireRole('admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = param(req, 'id');
    const { agentIds } = z.object({ agentIds: z.array(z.string().uuid()).min(1) }).parse(req.body);

    await prisma.user.updateMany({
      where: { id: { in: agentIds }, teamId: id },
      data: { teamId: null },
    });
    res.json({ success: true, data: { message: `Removed ${agentIds.length} agents from team` } });
  } catch (err) {
    next(err);
  }
});

// ── DELETE /api/teams/:id ─────────────────────────────────────────────

router.delete('/:id', requireRole('admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = param(req, 'id');
    await prisma.user.updateMany({ where: { teamId: id }, data: { teamId: null } });
    await prisma.team.delete({ where: { id } });
    res.json({ success: true, data: { message: 'Team deleted' } });
  } catch (err) {
    next(err);
  }
});

export default router;
