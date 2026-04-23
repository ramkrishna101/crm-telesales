"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const prisma_1 = require("../../lib/prisma");
const auth_1 = require("../../middleware/auth");
const errorHandler_1 = require("../../middleware/errorHandler");
const redis_1 = require("../../lib/redis");
const params_1 = require("../../lib/params");
const router = (0, express_1.Router)();
router.use(auth_1.authenticate);
// ── Schemas ───────────────────────────────────────────────────────────
const createUserSchema = zod_1.z.object({
    name: zod_1.z.string().min(2),
    email: zod_1.z.string().email(),
    password: zod_1.z.string().min(6),
    role: zod_1.z.enum(['admin', 'supervisor', 'agent']),
    teamId: zod_1.z.string().uuid().optional().nullable(),
}).refine(data => !(data.role === 'agent' && !data.teamId), {
    message: "Agents must be assigned to a team to ensure supervisor oversight",
    path: ["teamId"],
});
const updateUserSchema = zod_1.z.object({
    name: zod_1.z.string().min(2).optional(),
    email: zod_1.z.string().email().optional(),
    password: zod_1.z.string().min(6).optional(),
    role: zod_1.z.enum(['admin', 'supervisor', 'agent']).optional(),
    teamId: zod_1.z.string().uuid().optional().nullable(),
    status: zod_1.z.enum(['active', 'inactive']).optional(),
}).refine(data => {
    if (data.role === 'agent' && data.teamId === null)
        return false;
    return true;
}, {
    message: "Agents cannot be unassigned from a team",
    path: ["teamId"],
});
// ── GET /api/users ────────────────────────────────────────────────────
router.get('/', async (req, res, next) => {
    try {
        const { role: callerRole, userId } = req.user;
        if (callerRole === 'agent')
            throw new errorHandler_1.AppError(403, 'FORBIDDEN', 'Agents cannot list users');
        const where = callerRole === 'supervisor'
            ? { team: { supervisorId: userId } }
            : {};
        const { page = '1', limit = '50', teamId, role, status } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);
        const filter = { ...where };
        if (teamId)
            filter.teamId = teamId;
        if (role)
            filter.role = role;
        if (status)
            filter.status = status;
        const [users, total] = await Promise.all([
            prisma_1.prisma.user.findMany({
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
            prisma_1.prisma.user.count({ where: filter }),
        ]);
        res.json({ success: true, data: { users, total, page: parseInt(page), limit: parseInt(limit) } });
    }
    catch (err) {
        next(err);
    }
});
// ── GET /api/users/:id ────────────────────────────────────────────────
router.get('/:id', (0, auth_1.requireRole)('admin', 'supervisor'), async (req, res, next) => {
    try {
        const id = (0, params_1.param)(req, 'id');
        const user = await prisma_1.prisma.user.findUnique({
            where: { id },
            select: {
                id: true, name: true, email: true, role: true,
                status: true, teamId: true, createdAt: true, updatedAt: true,
                team: { select: { id: true, name: true } },
            },
        });
        if (!user)
            throw new errorHandler_1.AppError(404, 'USER_NOT_FOUND', 'User not found');
        res.json({ success: true, data: user });
    }
    catch (err) {
        next(err);
    }
});
// ── POST /api/users ───────────────────────────────────────────────────
router.post('/', (0, auth_1.requireRole)('admin'), async (req, res, next) => {
    try {
        const body = createUserSchema.parse(req.body);
        const exists = await prisma_1.prisma.user.findUnique({ where: { email: body.email } });
        if (exists)
            throw new errorHandler_1.AppError(409, 'EMAIL_TAKEN', 'Email is already registered');
        const passwordHash = await bcryptjs_1.default.hash(body.password, 12);
        const user = await prisma_1.prisma.user.create({
            data: { name: body.name, email: body.email, passwordHash, role: body.role, teamId: body.teamId || null },
            select: { id: true, name: true, email: true, role: true, status: true, teamId: true, createdAt: true },
        });
        res.status(201).json({ success: true, data: user });
    }
    catch (err) {
        next(err);
    }
});
// ── PUT /api/users/:id ────────────────────────────────────────────────
router.put('/:id', (0, auth_1.requireRole)('admin'), async (req, res, next) => {
    try {
        const id = (0, params_1.param)(req, 'id');
        const body = updateUserSchema.parse(req.body);
        const existing = await prisma_1.prisma.user.findUnique({ where: { id } });
        if (!existing)
            throw new errorHandler_1.AppError(404, 'USER_NOT_FOUND', 'User not found');
        if (body.email && body.email !== existing.email) {
            const taken = await prisma_1.prisma.user.findUnique({ where: { email: body.email } });
            if (taken)
                throw new errorHandler_1.AppError(409, 'EMAIL_TAKEN', 'Email is already registered');
        }
        const updateData = {};
        if (body.name)
            updateData.name = body.name;
        if (body.email)
            updateData.email = body.email;
        if (body.role)
            updateData.role = body.role;
        if (body.teamId !== undefined)
            updateData.teamId = body.teamId;
        if (body.status) {
            updateData.status = body.status;
            if (body.status === 'inactive')
                await (0, redis_1.revokeAllRefreshTokens)(id);
        }
        if (body.password)
            updateData.passwordHash = await bcryptjs_1.default.hash(body.password, 12);
        const user = await prisma_1.prisma.user.update({
            where: { id },
            data: updateData,
            select: { id: true, name: true, email: true, role: true, status: true, teamId: true, updatedAt: true },
        });
        res.json({ success: true, data: user });
    }
    catch (err) {
        next(err);
    }
});
// ── POST /api/users/:id/reset-password ────────────────────────────────
// Admin can reset anyone's password.
// Supervisor can reset passwords for agents in their team.
router.post('/:id/reset-password', (0, auth_1.requireRole)('admin', 'supervisor'), async (req, res, next) => {
    try {
        const id = (0, params_1.param)(req, 'id');
        const { password } = zod_1.z.object({ password: zod_1.z.string().min(6) }).parse(req.body);
        const { role: callerRole, userId: callerId } = req.user;
        const targetUser = await prisma_1.prisma.user.findUnique({ where: { id }, include: { team: true } });
        if (!targetUser)
            throw new errorHandler_1.AppError(404, 'USER_NOT_FOUND', 'User not found');
        // Access Control:
        if (callerRole === 'supervisor') {
            if (targetUser.role !== 'agent')
                throw new errorHandler_1.AppError(403, 'FORBIDDEN', 'Supervisors can only reset passwords for agents');
            if (targetUser.team?.supervisorId !== callerId)
                throw new errorHandler_1.AppError(403, 'FORBIDDEN', 'This agent is not in your team');
        }
        const passwordHash = await bcryptjs_1.default.hash(password, 12);
        await prisma_1.prisma.user.update({
            where: { id },
            data: { passwordHash }
        });
        // Security: Kill all sessions for this user
        await (0, redis_1.revokeAllRefreshTokens)(id);
        res.json({ success: true, data: { message: `Password reset successfully for ${targetUser.name}` } });
    }
    catch (err) {
        next(err);
    }
});
// ── DELETE /api/users/:id (soft deactivate) ───────────────────────────
router.delete('/:id', (0, auth_1.requireRole)('admin'), async (req, res, next) => {
    try {
        const id = (0, params_1.param)(req, 'id');
        if (id === req.user.userId)
            throw new errorHandler_1.AppError(400, 'CANNOT_SELF_DELETE', 'Cannot deactivate your own account');
        await prisma_1.prisma.user.update({ where: { id }, data: { status: 'inactive' } });
        await (0, redis_1.revokeAllRefreshTokens)(id);
        res.json({ success: true, data: { message: 'User deactivated' } });
    }
    catch (err) {
        next(err);
    }
});
// ── GET /api/users/:id/stats ──────────────────────────────────────────
router.get('/:id/stats', (0, auth_1.requireRole)('admin', 'supervisor'), async (req, res, next) => {
    try {
        const agentId = (0, params_1.param)(req, 'id');
        const { from, to } = req.query;
        const dateFilter = from && to ? { gte: new Date(from), lte: new Date(to) } : undefined;
        const [totalCalls, totalLeads, followUpsCount] = await Promise.all([
            prisma_1.prisma.callLog.count({ where: { agentId, ...(dateFilter ? { calledAt: dateFilter } : {}) } }),
            prisma_1.prisma.lead.count({ where: { assignedToId: agentId } }),
            prisma_1.prisma.followUp.count({ where: { agentId, ...(dateFilter ? { scheduledAt: dateFilter } : {}) } }),
        ]);
        res.json({ success: true, data: { agentId, totalCalls, totalLeads, followUpsCount } });
    }
    catch (err) {
        next(err);
    }
});
// ── POST /api/users/me/break/start ──────────────────────────────────────
router.post('/me/break/start', async (req, res, next) => {
    try {
        const userId = req.user.userId;
        const user = await prisma_1.prisma.user.findUnique({ where: { id: userId } });
        if (user?.status === 'on_break')
            throw new errorHandler_1.AppError(400, 'ALREADY_ON_BREAK', 'You are already on break');
        await prisma_1.prisma.$transaction([
            prisma_1.prisma.user.update({
                where: { id: userId },
                data: { status: 'on_break', breakStartedAt: new Date() }
            }),
            prisma_1.prisma.breakLog.create({
                data: { agentId: userId, startedAt: new Date() }
            })
        ]);
        res.json({ success: true, data: { message: 'Break started', status: 'on_break' } });
    }
    catch (err) {
        next(err);
    }
});
// ── POST /api/users/me/break/end ────────────────────────────────────────
router.post('/me/break/end', async (req, res, next) => {
    try {
        const userId = req.user.userId;
        const user = await prisma_1.prisma.user.findUnique({ where: { id: userId } });
        if (user?.status !== 'on_break')
            throw new errorHandler_1.AppError(400, 'NOT_ON_BREAK', 'You are not on break');
        const openBreak = await prisma_1.prisma.breakLog.findFirst({
            where: { agentId: userId, endedAt: null },
            orderBy: { startedAt: 'desc' }
        });
        await prisma_1.prisma.$transaction([
            prisma_1.prisma.user.update({
                where: { id: userId },
                data: { status: 'active', breakStartedAt: null }
            }),
            ...(openBreak ? [prisma_1.prisma.breakLog.update({
                    where: { id: openBreak.id },
                    data: { endedAt: new Date() }
                })] : [])
        ]);
        res.json({ success: true, data: { message: 'Break ended', status: 'active' } });
    }
    catch (err) {
        next(err);
    }
});
// ── GET /api/users/:id/breaks ──────────────────────────────────────────
router.get('/:id/breaks', (0, auth_1.requireRole)('admin', 'supervisor'), async (req, res, next) => {
    try {
        const agentId = (0, params_1.param)(req, 'id');
        const { from, to } = req.query;
        const dateFilter = from && to ? { gte: new Date(from), lte: new Date(to) } : undefined;
        const breaks = await prisma_1.prisma.breakLog.findMany({
            where: { agentId, ...(dateFilter ? { startedAt: dateFilter } : {}) },
            orderBy: { startedAt: 'desc' },
            take: 100
        });
        res.json({ success: true, data: breaks });
    }
    catch (err) {
        next(err);
    }
});
exports.default = router;
//# sourceMappingURL=users.routes.js.map