"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const prisma_1 = require("../../lib/prisma");
const auth_1 = require("../../middleware/auth");
const errorHandler_1 = require("../../middleware/errorHandler");
const router = (0, express_1.Router)();
router.use(auth_1.authenticate);
// ── GET /api/agent/dashboard ──────────────────────────────────────────
// Agent's workspace summary: stats + today's follow-ups + pending leads count
router.get('/dashboard', (0, auth_1.requireRole)('agent'), async (req, res, next) => {
    try {
        const agentId = req.user.userId;
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const todayEnd = new Date();
        todayEnd.setHours(23, 59, 59, 999);
        const [totalLeads, pendingLeads, callsToday, followUpsToday, activeBreak, breakTimeToday, recentCalls, tagStats,] = await Promise.all([
            prisma_1.prisma.lead.count({ where: { assignedToId: agentId } }),
            prisma_1.prisma.lead.count({ where: { assignedToId: agentId, status: { in: ['uncontacted', 'callback'] } } }),
            prisma_1.prisma.callLog.count({ where: { agentId, calledAt: { gte: todayStart } } }),
            prisma_1.prisma.followUp.findMany({
                where: { agentId, scheduledAt: { gte: todayStart, lte: todayEnd }, status: 'pending' },
                include: { lead: { select: { id: true, name: true, phone: true } } },
                orderBy: { scheduledAt: 'asc' },
            }),
            prisma_1.prisma.breakLog.findFirst({ where: { agentId, endedAt: null } }),
            // Total break minutes today
            prisma_1.prisma.$queryRaw `
        SELECT COALESCE(SUM(
          EXTRACT(EPOCH FROM (COALESCE("endedAt", NOW()) - "startedAt")) / 60
        ), 0) as mins
        FROM break_logs WHERE "agentId" = ${agentId}
        AND "startedAt" >= ${todayStart}
      `,
            prisma_1.prisma.callLog.findMany({
                where: { agentId, calledAt: { gte: todayStart } },
                orderBy: { calledAt: 'desc' },
                take: 5,
                include: { lead: { select: { id: true, name: true, phone: true, status: true, priority: true } } },
            }),
            // Calls by tag today
            prisma_1.prisma.callLog.groupBy({
                by: ['dispositionTag'],
                where: { agentId, calledAt: { gte: todayStart } },
                _count: { dispositionTag: true },
            }),
        ]);
        res.json({
            success: true,
            data: {
                stats: {
                    totalLeads,
                    pendingLeads,
                    callsToday,
                    breakMinutesToday: Math.round(Number(breakTimeToday[0]?.mins || 0)),
                    isOnBreak: !!activeBreak,
                    breakStartedAt: activeBreak?.startedAt || null,
                },
                followUpsToday: followUpsToday.map(f => ({ ...f, lead: maskPhone(f.lead) })),
                recentCalls: recentCalls.map(c => ({ ...c, lead: maskPhone(c.lead) })),
                tagStats: tagStats.map((t) => ({ tag: t.dispositionTag, count: t._count.dispositionTag })),
            },
        });
    }
    catch (err) {
        next(err);
    }
});
// ── GET /api/agent/next-lead ──────────────────────────────────────────
// Returns next lead from priority queue:
// 1. Overdue follow-ups first
// 2. High-priority uncontacted leads
// 3. Normal priority uncontacted leads
router.get('/next-lead', (0, auth_1.requireRole)('agent'), async (req, res, next) => {
    try {
        const agentId = req.user.userId;
        const { campaignId } = req.query;
        // 1. Check for overdue follow-up lead
        const overdueFollowUp = await prisma_1.prisma.followUp.findFirst({
            where: {
                agentId,
                status: 'pending',
                scheduledAt: { lte: new Date() },
            },
            orderBy: { scheduledAt: 'asc' },
            include: {
                lead: {
                    include: { campaign: { select: { id: true, name: true, script: true } } },
                },
            },
        });
        if (overdueFollowUp && overdueFollowUp.lead.assignedToId === agentId) {
            return res.json({
                success: true,
                data: {
                    type: 'follow_up',
                    followUpId: overdueFollowUp.id,
                    lead: maskPhone(overdueFollowUp.lead),
                    overdueBy: Math.round((Date.now() - overdueFollowUp.scheduledAt.getTime()) / 60000) + ' mins',
                },
            });
        }
        // 2. Next high-priority lead
        const baseWhere = {
            assignedToId: agentId,
            status: { in: ['uncontacted', 'callback'] },
            isDnd: false,
            ...(campaignId ? { campaignId } : {}),
        };
        const highPriority = await prisma_1.prisma.lead.findFirst({
            where: { ...baseWhere, priority: 'high' },
            orderBy: { lastCalledAt: 'asc' },
            include: { campaign: { select: { id: true, name: true, script: true } } },
        });
        if (highPriority) {
            return res.json({ success: true, data: { type: 'lead', priority: 'high', lead: maskPhone(highPriority) } });
        }
        // 3. Normal priority lead
        const normalLead = await prisma_1.prisma.lead.findFirst({
            where: baseWhere,
            orderBy: { createdAt: 'asc' },
            include: { campaign: { select: { id: true, name: true, script: true } } },
        });
        if (normalLead) {
            return res.json({ success: true, data: { type: 'lead', priority: 'normal', lead: maskPhone(normalLead) } });
        }
        return res.json({ success: true, data: null, message: 'No more leads available' });
    }
    catch (err) {
        next(err);
    }
});
// ── POST /api/agent/break/start ───────────────────────────────────────
router.post('/break/start', (0, auth_1.requireRole)('agent'), async (req, res, next) => {
    try {
        const agentId = req.user.userId;
        const activeBreak = await prisma_1.prisma.breakLog.findFirst({ where: { agentId, endedAt: null } });
        if (activeBreak)
            throw new errorHandler_1.AppError(400, 'ALREADY_ON_BREAK', 'You are already on a break');
        await prisma_1.prisma.user.update({ where: { id: agentId }, data: { status: 'on_break', breakStartedAt: new Date() } });
        const breakLog = await prisma_1.prisma.breakLog.create({ data: { agentId } });
        res.json({ success: true, data: { breakId: breakLog.id, startedAt: breakLog.startedAt } });
    }
    catch (err) {
        next(err);
    }
});
// ── POST /api/agent/break/end ─────────────────────────────────────────
router.post('/break/end', (0, auth_1.requireRole)('agent'), async (req, res, next) => {
    try {
        const agentId = req.user.userId;
        const activeBreak = await prisma_1.prisma.breakLog.findFirst({ where: { agentId, endedAt: null } });
        if (!activeBreak)
            throw new errorHandler_1.AppError(400, 'NOT_ON_BREAK', 'You are not currently on a break');
        const endedAt = new Date();
        const durationMins = Math.round((endedAt.getTime() - activeBreak.startedAt.getTime()) / 60000);
        await prisma_1.prisma.$transaction([
            prisma_1.prisma.breakLog.update({ where: { id: activeBreak.id }, data: { endedAt } }),
            prisma_1.prisma.user.update({ where: { id: agentId }, data: { status: 'active', breakStartedAt: null } }),
        ]);
        res.json({ success: true, data: { breakId: activeBreak.id, startedAt: activeBreak.startedAt, endedAt, durationMins } });
    }
    catch (err) {
        next(err);
    }
});
// ── POST /api/agent/call/initiate ─────────────────────────────────────
// Click-to-Call stub — replaced with real provider in Phase 3
router.post('/call/initiate', (0, auth_1.requireRole)('agent'), async (req, res, next) => {
    try {
        const { leadId } = zod_1.z.object({ leadId: zod_1.z.string().uuid() }).parse(req.body);
        const agentId = req.user.userId;
        const lead = await prisma_1.prisma.lead.findUnique({ where: { id: leadId } });
        if (!lead)
            throw new errorHandler_1.AppError(404, 'LEAD_NOT_FOUND', 'Lead not found');
        if (lead.assignedToId !== agentId)
            throw new errorHandler_1.AppError(403, 'FORBIDDEN', 'Lead not assigned to you');
        if (lead.isDnd)
            throw new errorHandler_1.AppError(400, 'DND_BLOCKED', 'This number is on the DND list');
        const provider = process.env.TELEPHONY_PROVIDER || 'stub';
        if (provider === 'stub') {
            // Dev stub — simulate call initiation
            return res.json({
                success: true,
                data: {
                    provider: 'stub',
                    callRef: `STUB-${Date.now()}`,
                    phone: lead.phone,
                    message: 'Stub call initiated (integrate real provider in production)',
                },
            });
        }
        // Real provider will be implemented here in Phase 3
        throw new errorHandler_1.AppError(501, 'NOT_IMPLEMENTED', `Telephony provider "${provider}" not yet integrated`);
    }
    catch (err) {
        next(err);
    }
});
// ── GET /api/agent/break-history ──────────────────────────────────────
router.get('/break-history', (0, auth_1.requireRole)('agent'), async (req, res, next) => {
    try {
        const agentId = req.user.userId;
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const breaks = await prisma_1.prisma.breakLog.findMany({
            where: { agentId, startedAt: { gte: todayStart } },
            orderBy: { startedAt: 'desc' },
        });
        const totalMins = breaks.reduce((sum, b) => {
            const end = b.endedAt || new Date();
            return sum + Math.round((end.getTime() - b.startedAt.getTime()) / 60000);
        }, 0);
        res.json({ success: true, data: { breaks, totalMinsToday: totalMins } });
    }
    catch (err) {
        next(err);
    }
});
// ── Helpers ───────────────────────────────────────────────────────────
function maskPhone(lead) {
    const { phone, ...rest } = lead;
    return { ...rest, phoneMasked: `****${phone.slice(-4)}` };
}
exports.default = router;
//# sourceMappingURL=agent.routes.js.map