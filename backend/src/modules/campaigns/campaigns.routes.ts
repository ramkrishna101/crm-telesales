import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { authenticate, requireRole } from '../../middleware/auth';
import { AppError } from '../../middleware/errorHandler';
import { param } from '../../lib/params';

const router = Router();
router.use(authenticate);

const createCampaignSchema = z.object({
  name: z.string().min(2),
  description: z.string().optional(),
  type: z.enum(['standard', 'vip']).default('standard'),
  priority: z.enum(['normal', 'high']).default('normal'),
  teamId: z.string().uuid().optional().nullable(),
  agentIds: z.array(z.string().uuid()).optional(),
});

const updateCampaignSchema = z.object({
  name: z.string().min(2).optional(),
  description: z.string().optional(),
  status: z.enum(['active', 'paused', 'closed']).optional(),
  priority: z.enum(['normal', 'high']).optional(),
  teamId: z.string().uuid().optional().nullable(),
  script: z.string().optional(),
});

// ── GET /api/campaigns ────────────────────────────────────────────────

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { role: callerRole, userId } = req.user!;
    const { page = '1', limit = '20', status, type, teamId } = req.query as Record<string, string>;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    let where: Record<string, unknown> = {};

    if (callerRole === 'agent') {
      where = { agents: { some: { agentId: userId } } };
    } else if (callerRole === 'supervisor') {
      const teamIds = await getSupervisorTeamIds(userId);
      where = { teamId: { in: teamIds } };
    }

    if (status) where.status = status;
    if (type) where.type = type;
    if (teamId && callerRole === 'admin') where.teamId = teamId;

    const [campaigns, total] = await Promise.all([
      prisma.campaign.findMany({
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
      prisma.campaign.count({ where }),
    ]);

    res.json({ success: true, data: { campaigns, total, page: parseInt(page), limit: parseInt(limit) } });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/campaigns/:id ────────────────────────────────────────────

router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = param(req, 'id');
    const { role: callerRole, userId } = req.user!;

    const campaign = await prisma.campaign.findUnique({
      where: { id },
      include: {
        createdBy: { select: { id: true, name: true } },
        team: { select: { id: true, name: true } },
        agents: { include: { agent: { select: { id: true, name: true, email: true, status: true } } } },
        _count: { select: { leads: true } },
      },
    });
    if (!campaign) throw new AppError(404, 'CAMPAIGN_NOT_FOUND', 'Campaign not found');

    if (callerRole === 'agent') {
      const hasAccess = campaign.agents.some((ca) => ca.agentId === userId);
      if (!hasAccess) throw new AppError(403, 'FORBIDDEN', 'You are not assigned to this campaign');
    }

    const leadStats = await prisma.lead.groupBy({
      by: ['status'],
      where: { campaignId: id },
      _count: { status: true },
    });

    res.json({ success: true, data: { ...campaign, leadStats } });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/campaigns ───────────────────────────────────────────────

router.post('/', requireRole('admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = createCampaignSchema.parse(req.body);

    const campaign = await prisma.campaign.create({
      data: {
        name: body.name,
        description: body.description,
        type: body.type,
        priority: body.priority,
        teamId: body.teamId || null,
        createdById: req.user!.userId,
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
  } catch (err) {
    next(err);
  }
});

// ── PUT /api/campaigns/:id ────────────────────────────────────────────

router.put('/:id', requireRole('admin', 'supervisor'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = param(req, 'id');
    const body = updateCampaignSchema.parse(req.body);

    const existing = await prisma.campaign.findUnique({ where: { id } });
    if (!existing) throw new AppError(404, 'CAMPAIGN_NOT_FOUND', 'Campaign not found');

    if (req.user!.role === 'supervisor') {
      const teamIds = await getSupervisorTeamIds(req.user!.userId);
      if (!existing.teamId || !teamIds.includes(existing.teamId)) {
        throw new AppError(403, 'FORBIDDEN', 'You can only edit your team campaigns');
      }
    }

    const campaign = await prisma.campaign.update({
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
    res.json({ success: true, data: campaign });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/campaigns/:id/agents ────────────────────────────────────

router.post('/:id/agents', requireRole('admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = param(req, 'id');
    const { agentIds } = z.object({ agentIds: z.array(z.string().uuid()).min(1) }).parse(req.body);

    const campaign = await prisma.campaign.findUnique({ where: { id } });
    if (!campaign) throw new AppError(404, 'CAMPAIGN_NOT_FOUND', 'Campaign not found');

    await prisma.$transaction(
      agentIds.map((agentId) =>
        prisma.campaignAgent.upsert({
          where: { campaignId_agentId: { campaignId: id, agentId } },
          create: { campaignId: id, agentId },
          update: {},
        }),
      ),
    );
    res.json({ success: true, data: { message: `Added ${agentIds.length} agents to campaign` } });
  } catch (err) {
    next(err);
  }
});

// ── DELETE /api/campaigns/:id/agents ─────────────────────────────────

router.delete('/:id/agents', requireRole('admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = param(req, 'id');
    const { agentIds } = z.object({ agentIds: z.array(z.string().uuid()).min(1) }).parse(req.body);
    await prisma.campaignAgent.deleteMany({ where: { campaignId: id, agentId: { in: agentIds } } });
    res.json({ success: true, data: { message: `Removed ${agentIds.length} agents from campaign` } });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/campaigns/:id/stats ──────────────────────────────────────

router.get('/:id/stats', requireRole('admin', 'supervisor'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const campaignId = param(req, 'id');

    const [totalLeads, leadsByStatus, totalCalls, callsByDay, agentPerformance] = await Promise.all([
      prisma.lead.count({ where: { campaignId } }),
      prisma.lead.groupBy({ by: ['status'], where: { campaignId }, _count: { status: true } }),
      prisma.callLog.count({ where: { lead: { campaignId } } }),
      prisma.$queryRaw<Array<{ date: string; count: bigint }>>`
        SELECT DATE(cl."calledAt") as date, COUNT(*) as count
        FROM call_logs cl JOIN leads l ON cl."leadId" = l.id
        WHERE l."campaignId" = ${campaignId}
          AND cl."calledAt" >= NOW() - INTERVAL '7 days'
        GROUP BY DATE(cl."calledAt") ORDER BY date ASC
      `,
      prisma.$queryRaw<Array<{ agentId: string; name: string; calls: bigint; connected: bigint }>>`
        SELECT u.id as "agentId", u.name, COUNT(cl.id) as calls,
               COUNT(CASE WHEN cl."durationSeconds" > 0 THEN 1 END) as connected
        FROM users u JOIN call_logs cl ON cl."agentId" = u.id
        JOIN leads l ON cl."leadId" = l.id
        WHERE l."campaignId" = ${campaignId}
        GROUP BY u.id, u.name ORDER BY calls DESC
      `,
    ]);

    const leadsMap = Object.fromEntries(leadsByStatus.map((s) => [s.status, s._count.status]));
    res.json({
      success: true,
      data: {
        campaignId, totalLeads, leadsByStatus: leadsMap, totalCalls,
        conversionRate: totalLeads > 0 ? (((leadsMap['lead'] || 0) / totalLeads) * 100).toFixed(1) + '%' : '0%',
        callsByDay: callsByDay.map((r) => ({ date: r.date, count: Number(r.count) })),
        agentPerformance: agentPerformance.map((r) => ({
          agentId: r.agentId, name: r.name,
          calls: Number(r.calls), connected: Number(r.connected),
        })),
      },
    });
  } catch (err) {
    next(err);
  }
});

async function getSupervisorTeamIds(supervisorId: string): Promise<string[]> {
  const teams = await prisma.team.findMany({ where: { supervisorId }, select: { id: true } });
  return teams.map((t) => t.id);
}

export default router;
