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
const createCampaignSchema = zod_1.z.object({
    name: zod_1.z.string().min(2),
    description: zod_1.z.string().optional(),
    type: zod_1.z.enum(['standard', 'vip']).default('standard'),
    priority: zod_1.z.enum(['normal', 'high']).default('normal'),
    teamId: zod_1.z.string().uuid().optional().nullable(),
    agentIds: zod_1.z.array(zod_1.z.string().uuid()).optional(),
});
const updateCampaignSchema = zod_1.z.object({
    name: zod_1.z.string().min(2).optional(),
    description: zod_1.z.string().optional(),
    status: zod_1.z.enum(['active', 'paused', 'closed']).optional(),
    priority: zod_1.z.enum(['normal', 'high']).optional(),
    teamId: zod_1.z.string().uuid().optional().nullable(),
    script: zod_1.z.string().optional(),
});
// ── GET /api/campaigns ────────────────────────────────────────────────
router.get('/', async (req, res, next) => {
    try {
        const { role: callerRole, userId } = req.user;
        const { page = '1', limit = '20', status, type, teamId } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);
        let where = {};
        if (callerRole === 'agent') {
            where = { agents: { some: { agentId: userId } } };
        }
        else if (callerRole === 'supervisor') {
            const teamIds = await getSupervisorTeamIds(userId);
            where = { teamId: { in: teamIds } };
        }
        if (status)
            where.status = status;
        if (type)
            where.type = type;
        if (teamId && callerRole === 'admin')
            where.teamId = teamId;
        const [campaigns, total] = await Promise.all([
            prisma_1.prisma.campaign.findMany({
                where,
                skip,
                take: parseInt(limit),
                orderBy: { createdAt: 'desc' },
                include: {
                    createdBy: { select: { id: true, name: true } },
                    team: { select: { id: true, name: true } },
                    _count: { select: { leads: true, agents: true } },
                },
            }),
            prisma_1.prisma.campaign.count({ where }),
        ]);
        res.json({ success: true, data: { campaigns, total, page: parseInt(page), limit: parseInt(limit) } });
    }
    catch (err) {
        next(err);
    }
});
// ── GET /api/campaigns/:id ────────────────────────────────────────────
router.get('/:id', async (req, res, next) => {
    try {
        const id = (0, params_1.param)(req, 'id');
        const { role: callerRole, userId } = req.user;
        const campaign = await prisma_1.prisma.campaign.findUnique({
            where: { id },
            include: {
                createdBy: { select: { id: true, name: true } },
                team: { select: { id: true, name: true } },
                agents: { include: { agent: { select: { id: true, name: true, email: true, status: true } } } },
                _count: { select: { leads: true } },
            },
        });
        if (!campaign)
            throw new errorHandler_1.AppError(404, 'CAMPAIGN_NOT_FOUND', 'Campaign not found');
        if (callerRole === 'agent') {
            const hasAccess = campaign.agents.some((ca) => ca.agentId === userId);
            if (!hasAccess)
                throw new errorHandler_1.AppError(403, 'FORBIDDEN', 'You are not assigned to this campaign');
        }
        const leadStats = await prisma_1.prisma.lead.groupBy({
            by: ['status'],
            where: { campaignId: id },
            _count: { status: true },
        });
        res.json({ success: true, data: { ...campaign, leadStats } });
    }
    catch (err) {
        next(err);
    }
});
// ── POST /api/campaigns ───────────────────────────────────────────────
router.post('/', (0, auth_1.requireRole)('admin'), async (req, res, next) => {
    try {
        const body = createCampaignSchema.parse(req.body);
        const campaign = await prisma_1.prisma.campaign.create({
            data: {
                name: body.name,
                description: body.description,
                type: body.type,
                priority: body.priority,
                teamId: body.teamId || null,
                createdById: req.user.userId,
                ...(body.agentIds?.length && {
                    agents: { createMany: { data: body.agentIds.map((agentId) => ({ agentId })) } },
                }),
            },
            include: {
                createdBy: { select: { id: true, name: true } },
                _count: { select: { leads: true, agents: true } },
            },
        });
        res.status(201).json({ success: true, data: campaign });
    }
    catch (err) {
        next(err);
    }
});
// ── PUT /api/campaigns/:id ────────────────────────────────────────────
router.put('/:id', (0, auth_1.requireRole)('admin', 'supervisor'), async (req, res, next) => {
    try {
        const id = (0, params_1.param)(req, 'id');
        const body = updateCampaignSchema.parse(req.body);
        const existing = await prisma_1.prisma.campaign.findUnique({ where: { id } });
        if (!existing)
            throw new errorHandler_1.AppError(404, 'CAMPAIGN_NOT_FOUND', 'Campaign not found');
        if (req.user.role === 'supervisor') {
            const teamIds = await getSupervisorTeamIds(req.user.userId);
            if (!existing.teamId || !teamIds.includes(existing.teamId)) {
                throw new errorHandler_1.AppError(403, 'FORBIDDEN', 'You can only edit your team campaigns');
            }
        }
        // Handle Team Reassignment Logic
        let newAgentsToAssign = [];
        const isChangingTeam = body.teamId !== undefined && body.teamId !== existing.teamId;
        if (isChangingTeam && body.teamId) {
            // Get all users in the new team
            const newTeamMembers = await prisma_1.prisma.user.findMany({
                where: { teamId: body.teamId },
                select: { id: true }
            });
            newAgentsToAssign = newTeamMembers.map(u => u.id);
        }
        const campaign = await prisma_1.prisma.$transaction(async (tx) => {
            // 1. Update the campaign itself
            const updated = await tx.campaign.update({
                where: { id },
                data: {
                    ...(body.name && { name: body.name }),
                    ...(body.description !== undefined && { description: body.description }),
                    ...(body.status && {
                        status: body.status,
                        ...(body.status === 'closed' && { closedAt: new Date() }),
                    }),
                    ...(body.priority && { priority: body.priority }),
                    ...(body.teamId !== undefined && { teamId: body.teamId }),
                    ...(body.script !== undefined && { script: body.script }),
                },
                include: {
                    createdBy: { select: { id: true, name: true } },
                    team: { select: { id: true, name: true } },
                    _count: { select: { leads: true, agents: true } },
                },
            });
            // 2. If team changed, handle access and lead reassignment
            if (isChangingTeam) {
                // Clear all existing agent access
                await tx.campaignAgent.deleteMany({ where: { campaignId: id } });
                // Grant access to new team
                if (newAgentsToAssign.length > 0) {
                    await tx.campaignAgent.createMany({
                        data: newAgentsToAssign.map(agentId => ({ campaignId: id, agentId }))
                    });
                }
                // Unassign all leads in this campaign so they go back to the pool
                // Alternatively, we could redistribute, but unassigning is safer
                await tx.lead.updateMany({
                    where: { campaignId: id },
                    data: { assignedToId: null }
                });
            }
            return updated;
        });
        res.json({ success: true, data: campaign });
    }
    catch (err) {
        next(err);
    }
});
// ── POST /api/campaigns/:id/agents ────────────────────────────────────
router.post('/:id/agents', (0, auth_1.requireRole)('admin'), async (req, res, next) => {
    try {
        const id = (0, params_1.param)(req, 'id');
        const { agentIds } = zod_1.z.object({ agentIds: zod_1.z.array(zod_1.z.string().uuid()).min(1) }).parse(req.body);
        const campaign = await prisma_1.prisma.campaign.findUnique({ where: { id } });
        if (!campaign)
            throw new errorHandler_1.AppError(404, 'CAMPAIGN_NOT_FOUND', 'Campaign not found');
        await prisma_1.prisma.$transaction(agentIds.map((agentId) => prisma_1.prisma.campaignAgent.upsert({
            where: { campaignId_agentId: { campaignId: id, agentId } },
            create: { campaignId: id, agentId },
            update: {},
        })));
        res.json({ success: true, data: { message: `Added ${agentIds.length} agents to campaign` } });
    }
    catch (err) {
        next(err);
    }
});
// ── DELETE /api/campaigns/:id/agents ─────────────────────────────────
router.delete('/:id/agents', (0, auth_1.requireRole)('admin'), async (req, res, next) => {
    try {
        const id = (0, params_1.param)(req, 'id');
        const { agentIds } = zod_1.z.object({ agentIds: zod_1.z.array(zod_1.z.string().uuid()).min(1) }).parse(req.body);
        await prisma_1.prisma.campaignAgent.deleteMany({ where: { campaignId: id, agentId: { in: agentIds } } });
        res.json({ success: true, data: { message: `Removed ${agentIds.length} agents from campaign` } });
    }
    catch (err) {
        next(err);
    }
});
// ── GET /api/campaigns/:id/stats ──────────────────────────────────────
router.get('/:id/stats', (0, auth_1.requireRole)('admin', 'supervisor'), async (req, res, next) => {
    try {
        const campaignId = (0, params_1.param)(req, 'id');
        const [totalLeads, leadsByStatus, totalCalls, callsByDay, agentPerformance] = await Promise.all([
            prisma_1.prisma.lead.count({ where: { campaignId } }),
            prisma_1.prisma.lead.groupBy({ by: ['status'], where: { campaignId }, _count: { status: true } }),
            prisma_1.prisma.callLog.count({ where: { lead: { campaignId } } }),
            prisma_1.prisma.$queryRaw `
        SELECT DATE(cl."calledAt") as date, COUNT(*) as count
        FROM call_logs cl JOIN leads l ON cl."leadId" = l.id
        WHERE l."campaignId" = ${campaignId}
          AND cl."calledAt" >= NOW() - INTERVAL '7 days'
        GROUP BY DATE(cl."calledAt") ORDER BY date ASC
      `,
            prisma_1.prisma.$queryRaw `
        SELECT u.id as "agentId", u.name, 
               COUNT(cl.id) as calls,
               COUNT(CASE WHEN cl."durationSeconds" > 0 THEN 1 END) as connected,
               SUM(CASE WHEN cl."dispositionTag" = 'Interested' THEN 1 ELSE 0 END) as interested,
               SUM(CASE WHEN cl."dispositionTag" = 'Not Interested' THEN 1 ELSE 0 END) as "notInterested",
               SUM(CASE WHEN cl."dispositionTag" = 'Callback' THEN 1 ELSE 0 END) as callback,
               SUM(CASE WHEN cl."dispositionTag" = 'DND' THEN 1 ELSE 0 END) as dnd,
               SUM(CASE WHEN cl."dispositionTag" = 'Invalid Number' THEN 1 ELSE 0 END) as invalid,
               SUM(CASE WHEN cl."dispositionTag" = 'Busy' THEN 1 ELSE 0 END) as busy,
               SUM(CASE WHEN cl."dispositionTag" = 'RNR' THEN 1 ELSE 0 END) as rnr
        FROM users u JOIN call_logs cl ON cl."agentId" = u.id
        JOIN leads l ON cl."leadId" = l.id
        WHERE l."campaignId" = ${campaignId}
        GROUP BY u.id, u.name ORDER BY calls DESC
      `,
        ]);
        const leadsMap = Object.fromEntries(leadsByStatus.map((s) => [s.status, s._count.status]));
        const totalContacted = totalLeads - (leadsMap['uncontacted'] || 0);
        const conversionRate = totalContacted > 0
            ? (((leadsMap['lead'] || 0) / totalContacted) * 100).toFixed(1) + '%'
            : '0%';
        res.json({
            success: true,
            data: {
                campaignId,
                totalLeads,
                totalContacted,
                leadsByStatus: leadsMap,
                totalCalls,
                conversionRate,
                callsByDay: callsByDay.map((r) => ({ date: r.date, count: Number(r.count) })),
                agentPerformance: agentPerformance.map((r) => ({
                    agentId: r.agentId, name: r.name,
                    calls: Number(r.calls), connected: Number(r.connected),
                    interested: Number(r.interested || 0),
                    notInterested: Number(r.notInterested || 0),
                    callback: Number(r.callback || 0),
                    dnd: Number(r.dnd || 0),
                    invalid: Number(r.invalid || 0),
                    busy: Number(r.busy || 0),
                    rnr: Number(r.rnr || 0)
                })),
            },
        });
    }
    catch (err) {
        next(err);
    }
});
async function getSupervisorTeamIds(supervisorId) {
    const teams = await prisma_1.prisma.team.findMany({ where: { supervisorId }, select: { id: true } });
    return teams.map((t) => t.id);
}
exports.default = router;
//# sourceMappingURL=campaigns.routes.js.map