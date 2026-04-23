"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const prisma_1 = require("../../lib/prisma");
const auth_1 = require("../../middleware/auth");
const errorHandler_1 = require("../../middleware/errorHandler");
const params_1 = require("../../lib/params");
const index_1 = require("../../index");
const router = (0, express_1.Router)();
router.use(auth_1.authenticate);
// ── Schemas ───────────────────────────────────────────────────────────
const createFollowUpSchema = zod_1.z.object({
    leadId: zod_1.z.string().uuid(),
    scheduledAt: zod_1.z.string().datetime(),
    notes: zod_1.z.string().max(1000).optional(),
});
const updateFollowUpSchema = zod_1.z.object({
    scheduledAt: zod_1.z.string().datetime().optional(),
    status: zod_1.z.enum(['pending', 'done', 'missed', 'rescheduled']).optional(),
    notes: zod_1.z.string().max(1000).optional(),
});
// ── GET /api/follow-ups ───────────────────────────────────────────────
router.get('/', async (req, res, next) => {
    try {
        const { role: callerRole, userId } = req.user;
        const { status = 'pending', from, to, page = '1', limit = '50' } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);
        let where = {};
        if (callerRole === 'agent') {
            where.agentId = userId;
        }
        else if (callerRole === 'supervisor') {
            const teams = await prisma_1.prisma.team.findMany({
                where: { supervisorId: userId },
                select: { members: { select: { id: true } } },
            });
            const agentIds = teams.flatMap((t) => t.members.map((m) => m.id));
            where.agentId = { in: agentIds };
        }
        if (status)
            where.status = status;
        if (from && to)
            where.scheduledAt = { gte: new Date(from), lte: new Date(to) };
        const [followUps, total] = await Promise.all([
            prisma_1.prisma.followUp.findMany({
                where,
                skip,
                take: parseInt(limit),
                orderBy: { scheduledAt: 'asc' },
                include: {
                    lead: { select: { id: true, name: true, phone: true, campaignId: true } },
                    agent: { select: { id: true, name: true } },
                },
            }),
            prisma_1.prisma.followUp.count({ where }),
        ]);
        res.json({ success: true, data: { followUps, total, page: parseInt(page), limit: parseInt(limit) } });
    }
    catch (err) {
        next(err);
    }
});
// ── POST /api/follow-ups ──────────────────────────────────────────────
router.post('/', async (req, res, next) => {
    try {
        const body = createFollowUpSchema.parse(req.body);
        const agentId = req.user.userId;
        const lead = await prisma_1.prisma.lead.findUnique({ where: { id: body.leadId } });
        if (!lead)
            throw new errorHandler_1.AppError(404, 'LEAD_NOT_FOUND', 'Lead not found');
        if (req.user.role === 'agent' && lead.assignedToId !== agentId) {
            throw new errorHandler_1.AppError(403, 'FORBIDDEN', 'Lead not assigned to you');
        }
        const scheduledAt = new Date(body.scheduledAt);
        if (scheduledAt <= new Date()) {
            throw new errorHandler_1.AppError(400, 'PAST_DATE', 'Follow-up must be scheduled in the future');
        }
        const followUp = await prisma_1.prisma.followUp.create({
            data: { leadId: body.leadId, agentId, scheduledAt, notes: body.notes },
            include: {
                lead: { select: { id: true, name: true, phone: true } },
            },
        });
        // Real-time notification to the agent
        index_1.io.to(`user:${agentId}`).emit('follow_up:created', {
            followUpId: followUp.id,
            leadName: followUp.lead.name,
            scheduledAt: followUp.scheduledAt,
        });
        res.status(201).json({ success: true, data: followUp });
    }
    catch (err) {
        next(err);
    }
});
// ── PUT /api/follow-ups/:id ───────────────────────────────────────────
router.put('/:id', async (req, res, next) => {
    try {
        const id = (0, params_1.param)(req, 'id');
        const body = updateFollowUpSchema.parse(req.body);
        const { userId, role: callerRole } = req.user;
        const followUp = await prisma_1.prisma.followUp.findUnique({ where: { id } });
        if (!followUp)
            throw new errorHandler_1.AppError(404, 'FOLLOW_UP_NOT_FOUND', 'Follow-up not found');
        if (callerRole === 'agent' && followUp.agentId !== userId) {
            throw new errorHandler_1.AppError(403, 'FORBIDDEN', 'Access denied');
        }
        const updated = await prisma_1.prisma.followUp.update({
            where: { id },
            data: {
                ...(body.scheduledAt && { scheduledAt: new Date(body.scheduledAt) }),
                ...(body.status && {
                    status: body.status,
                    ...(body.status === 'done' || body.status === 'missed' ? { completedAt: new Date() } : {}),
                }),
                ...(body.notes !== undefined && { notes: body.notes }),
            },
            include: {
                lead: { select: { id: true, name: true } },
            },
        });
        res.json({ success: true, data: updated });
    }
    catch (err) {
        next(err);
    }
});
// ── DELETE /api/follow-ups/:id ────────────────────────────────────────
router.delete('/:id', async (req, res, next) => {
    try {
        const id = (0, params_1.param)(req, 'id');
        const followUp = await prisma_1.prisma.followUp.findUnique({ where: { id } });
        if (!followUp)
            throw new errorHandler_1.AppError(404, 'FOLLOW_UP_NOT_FOUND', 'Follow-up not found');
        if (req.user.role === 'agent' && followUp.agentId !== req.user.userId) {
            throw new errorHandler_1.AppError(403, 'FORBIDDEN', 'Access denied');
        }
        await prisma_1.prisma.followUp.delete({ where: { id } });
        res.json({ success: true, data: { message: 'Follow-up deleted' } });
    }
    catch (err) {
        next(err);
    }
});
exports.default = router;
//# sourceMappingURL=followUps.routes.js.map