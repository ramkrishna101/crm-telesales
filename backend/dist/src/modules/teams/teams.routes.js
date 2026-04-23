"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const prisma_1 = require("../../lib/prisma");
const auth_1 = require("../../middleware/auth");
const errorHandler_1 = require("../../middleware/errorHandler");
const params_1 = require("../../lib/params");
const router = (0, express_1.Router)();
router.use(auth_1.authenticate);
const createTeamSchema = zod_1.z.object({
    name: zod_1.z.string().min(2),
    supervisorId: zod_1.z.string().uuid().optional().nullable(),
});
const updateTeamSchema = zod_1.z.object({
    name: zod_1.z.string().min(2).optional(),
    supervisorId: zod_1.z.string().uuid().optional().nullable(),
});
// ── GET /api/teams ────────────────────────────────────────────────────
router.get('/', (0, auth_1.requireRole)('admin', 'supervisor'), async (req, res, next) => {
    try {
        const { role: callerRole, userId } = req.user;
        const where = callerRole === 'admin' ? {} : { supervisorId: userId };
        const teams = await prisma_1.prisma.team.findMany({
            where,
            orderBy: { name: 'asc' },
            include: {
                supervisor: { select: { id: true, name: true, email: true } },
                members: { select: { id: true, name: true, email: true, status: true, role: true } },
                _count: { select: { members: true } },
            },
        });
        res.json({ success: true, data: teams });
    }
    catch (err) {
        next(err);
    }
});
// ── GET /api/teams/:id ────────────────────────────────────────────────
router.get('/:id', (0, auth_1.requireRole)('admin', 'supervisor'), async (req, res, next) => {
    try {
        const id = (0, params_1.param)(req, 'id');
        const team = await prisma_1.prisma.team.findUnique({
            where: { id },
            include: {
                supervisor: { select: { id: true, name: true, email: true } },
                members: { select: { id: true, name: true, email: true, role: true, status: true } },
                _count: { select: { members: true, campaigns: true } },
            },
        });
        if (!team)
            throw new errorHandler_1.AppError(404, 'TEAM_NOT_FOUND', 'Team not found');
        if (req.user.role === 'supervisor' && team.supervisorId !== req.user.userId) {
            throw new errorHandler_1.AppError(403, 'FORBIDDEN', 'You can only view your own team');
        }
        res.json({ success: true, data: team });
    }
    catch (err) {
        next(err);
    }
});
// ── POST /api/teams ───────────────────────────────────────────────────
router.post('/', (0, auth_1.requireRole)('admin'), async (req, res, next) => {
    try {
        const body = createTeamSchema.parse(req.body);
        if (body.supervisorId) {
            const supervisor = await prisma_1.prisma.user.findUnique({ where: { id: body.supervisorId } });
            if (!supervisor || supervisor.role !== 'supervisor') {
                throw new errorHandler_1.AppError(400, 'INVALID_SUPERVISOR', 'Supervisor user not found or has wrong role');
            }
        }
        const team = await prisma_1.prisma.team.create({
            data: { name: body.name, supervisorId: body.supervisorId || null },
            include: { supervisor: { select: { id: true, name: true } } },
        });
        res.status(201).json({ success: true, data: team });
    }
    catch (err) {
        next(err);
    }
});
// ── PUT /api/teams/:id ────────────────────────────────────────────────
router.put('/:id', (0, auth_1.requireRole)('admin'), async (req, res, next) => {
    try {
        const id = (0, params_1.param)(req, 'id');
        const body = updateTeamSchema.parse(req.body);
        const existing = await prisma_1.prisma.team.findUnique({ where: { id } });
        if (!existing)
            throw new errorHandler_1.AppError(404, 'TEAM_NOT_FOUND', 'Team not found');
        if (body.supervisorId) {
            const supervisor = await prisma_1.prisma.user.findUnique({ where: { id: body.supervisorId } });
            if (!supervisor || supervisor.role !== 'supervisor') {
                throw new errorHandler_1.AppError(400, 'INVALID_SUPERVISOR', 'Supervisor not found or wrong role');
            }
        }
        const team = await prisma_1.prisma.team.update({
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
    }
    catch (err) {
        next(err);
    }
});
// ── POST /api/teams/:id/members ───────────────────────────────────────
router.post('/:id/members', (0, auth_1.requireRole)('admin'), async (req, res, next) => {
    try {
        const id = (0, params_1.param)(req, 'id');
        const { agentIds } = zod_1.z.object({ agentIds: zod_1.z.array(zod_1.z.string().uuid()).min(1) }).parse(req.body);
        const team = await prisma_1.prisma.team.findUnique({ where: { id } });
        if (!team)
            throw new errorHandler_1.AppError(404, 'TEAM_NOT_FOUND', 'Team not found');
        await prisma_1.prisma.user.updateMany({
            where: { id: { in: agentIds }, role: 'agent' },
            data: { teamId: id },
        });
        res.json({ success: true, data: { message: `Added ${agentIds.length} agents to team` } });
    }
    catch (err) {
        next(err);
    }
});
// ── DELETE /api/teams/:id/members ─────────────────────────────────────
router.delete('/:id/members', (0, auth_1.requireRole)('admin'), async (req, res, next) => {
    try {
        const id = (0, params_1.param)(req, 'id');
        const { agentIds } = zod_1.z.object({ agentIds: zod_1.z.array(zod_1.z.string().uuid()).min(1) }).parse(req.body);
        await prisma_1.prisma.user.updateMany({
            where: { id: { in: agentIds }, teamId: id },
            data: { teamId: null },
        });
        res.json({ success: true, data: { message: `Removed ${agentIds.length} agents from team` } });
    }
    catch (err) {
        next(err);
    }
});
// ── DELETE /api/teams/:id ─────────────────────────────────────────────
router.delete('/:id', (0, auth_1.requireRole)('admin'), async (req, res, next) => {
    try {
        const id = (0, params_1.param)(req, 'id');
        await prisma_1.prisma.user.updateMany({ where: { teamId: id }, data: { teamId: null } });
        await prisma_1.prisma.team.delete({ where: { id } });
        res.json({ success: true, data: { message: 'Team deleted' } });
    }
    catch (err) {
        next(err);
    }
});
exports.default = router;
//# sourceMappingURL=teams.routes.js.map