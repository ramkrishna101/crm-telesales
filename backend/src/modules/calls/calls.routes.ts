import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { authenticate, requireRole } from '../../middleware/auth';
import { AppError } from '../../middleware/errorHandler';
import { param } from '../../lib/params';
import { io } from '../../index';

const router = Router();
router.use(authenticate);

// ── Schemas ───────────────────────────────────────────────────────────

const logCallSchema = z.object({
  leadId: z.string().uuid(),
  dispositionTag: z.string().min(1),
  durationSeconds: z.number().int().min(0).default(0),
  notes: z.string().max(2000).optional(),
  telephonyRef: z.string().optional(),
});

// ── POST /api/calls ───────────────────────────────────────────────────
// Agent logs a completed call

router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = logCallSchema.parse(req.body);
    const agentId = req.user!.userId;

    // Verify the lead is assigned to this agent (or admin/supervisor can log too)
    const lead = await prisma.lead.findUnique({ where: { id: body.leadId } });
    if (!lead) throw new AppError(404, 'LEAD_NOT_FOUND', 'Lead not found');

    if (req.user!.role === 'agent' && lead.assignedToId !== agentId) {
      throw new AppError(403, 'FORBIDDEN', 'This lead is not assigned to you');
    }

    // Verify disposition tag exists
    const tagExists = await prisma.dispositionTag.findUnique({
      where: { name: body.dispositionTag },
    });
    if (!tagExists) throw new AppError(400, 'INVALID_TAG', `Disposition tag "${body.dispositionTag}" does not exist`);

    // Map tag → lead status
    const tagToStatus: Record<string, string> = {
      'RNR': 'contacted',
      'Busy': 'contacted',
      'Interested': 'lead',
      'Not Interested': 'not_interested',
      'Callback': 'callback',
      'DND': 'dnd',
      'Invalid Number': 'invalid',
    };

    const newStatus = tagToStatus[body.dispositionTag] || 'contacted';

    // Run call log + lead update atomically
    const [callLog] = await prisma.$transaction([
      prisma.callLog.create({
        data: {
          leadId: body.leadId,
          agentId,
          dispositionTag: body.dispositionTag,
          durationSeconds: body.durationSeconds,
          notes: body.notes,
          telephonyRef: body.telephonyRef,
        },
        include: {
          agent: { select: { id: true, name: true } },
          lead: { select: { id: true, name: true, phone: true, status: true } },
        },
      }),
      prisma.lead.update({
        where: { id: body.leadId },
        data: {
          status: newStatus as never,
          lastCalledAt: new Date(),
          ...(newStatus === 'dnd' && { isDnd: true }),
        },
      }),
    ]);

    // Add to DND blocklist if needed
    if (newStatus === 'dnd') {
      await prisma.dndBlocklist.upsert({
        where: { phone: lead.phone },
        create: { phone: lead.phone, reason: 'Agent-marked DND via call log' },
        update: {},
      });
    }

    res.status(201).json({ success: true, data: callLog });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/calls ────────────────────────────────────────────────────
// List call logs — scoped by role

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { role: callerRole, userId } = req.user!;
    const {
      page = '1', limit = '50', agentId, campaignId,
      from, to, tag,
    } = req.query as Record<string, string>;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const dateFilter = from && to
      ? { gte: new Date(from), lte: new Date(to) }
      : undefined;

    let where: Record<string, unknown> = {};

    if (callerRole === 'agent') {
      where.agentId = userId;
    } else if (callerRole === 'supervisor') {
      const myTeams = await prisma.team.findMany({
        where: { supervisorId: userId },
        select: { members: { select: { id: true } } },
      });
      const agentIds = myTeams.flatMap((t) => t.members.map((m) => m.id));
      where.agentId = { in: agentIds };
    }

    if (agentId && callerRole !== 'agent') where.agentId = agentId;
    if (tag) where.dispositionTag = tag;
    if (dateFilter) where.calledAt = dateFilter;
    if (campaignId) where.lead = { campaignId };

    const [logs, total] = await Promise.all([
      prisma.callLog.findMany({
        where,
        skip,
        take: parseInt(limit),
        orderBy: { calledAt: 'desc' },
        include: {
          agent: { select: { id: true, name: true } },
          lead: { select: { id: true, name: true, campaignId: true } },
        },
      }),
      prisma.callLog.count({ where }),
    ]);

    res.json({ success: true, data: { logs, total, page: parseInt(page), limit: parseInt(limit) } });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/calls/summary ────────────────────────────────────────────
// Hourly heatmap + tag breakdown for analytics

router.get('/summary', requireRole('admin', 'supervisor'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { from, to, agentId, campaignId } = req.query as Record<string, string>;

    const dateFilter = from && to ? { gte: new Date(from), lte: new Date(to) } : {
      gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
    };

    const whereClause = {
      calledAt: dateFilter,
      ...(agentId ? { agentId } : {}),
      ...(campaignId ? { lead: { campaignId } } : {}),
    };

    const [tagBreakdown, hourlyHeatmap, dailyTotals, agentLeaderboard] = await Promise.all([
      // Calls by disposition tag
      prisma.callLog.groupBy({
        by: ['dispositionTag'],
        where: whereClause,
        _count: { dispositionTag: true },
        orderBy: { _count: { dispositionTag: 'desc' } },
      }),

      // Heatmap: calls by hour of day
      prisma.$queryRaw<Array<{ hour: number; count: bigint }>>`
        SELECT EXTRACT(HOUR FROM "calledAt") as hour, COUNT(*) as count
        FROM call_logs
        WHERE "calledAt" >= ${dateFilter.gte} AND "calledAt" <= ${dateFilter.lte ?? new Date()}
        ${agentId ? prisma.$queryRaw`AND "agentId" = ${agentId}` : prisma.$queryRaw``}
        GROUP BY EXTRACT(HOUR FROM "calledAt")
        ORDER BY hour
      `,

      // Daily call volume
      prisma.$queryRaw<Array<{ date: string; count: bigint; avgDuration: number }>>`
        SELECT DATE("calledAt") as date, COUNT(*) as count,
               ROUND(AVG("durationSeconds")) as "avgDuration"
        FROM call_logs
        WHERE "calledAt" >= ${dateFilter.gte}
        GROUP BY DATE("calledAt") ORDER BY date
      `,

      // Agent leaderboard
      prisma.$queryRaw<Array<{ agentId: string; name: string; calls: bigint; connected: bigint; avgDuration: number }>>`
        SELECT u.id as "agentId", u.name, COUNT(cl.id) as calls,
               COUNT(CASE WHEN cl."durationSeconds" > 0 THEN 1 END) as connected,
               ROUND(AVG(cl."durationSeconds")) as "avgDuration"
        FROM users u JOIN call_logs cl ON cl."agentId" = u.id
        WHERE cl."calledAt" >= ${dateFilter.gte}
        GROUP BY u.id, u.name ORDER BY calls DESC LIMIT 20
      `,
    ]);

    res.json({
      success: true,
      data: {
        tagBreakdown: tagBreakdown.map((t) => ({ tag: t.dispositionTag, count: t._count.dispositionTag })),
        hourlyHeatmap: hourlyHeatmap.map((h) => ({ hour: Number(h.hour), count: Number(h.count) })),
        dailyTotals: dailyTotals.map((d) => ({
          date: d.date, count: Number(d.count), avgDuration: Number(d.avgDuration),
        })),
        agentLeaderboard: agentLeaderboard.map((a) => ({
          agentId: a.agentId, name: a.name,
          calls: Number(a.calls), connected: Number(a.connected), avgDuration: Number(a.avgDuration),
        })),
      },
    });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/calls/:id ────────────────────────────────────────────────

router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = param(req, 'id');
    const log = await prisma.callLog.findUnique({
      where: { id },
      include: {
        agent: { select: { id: true, name: true } },
        lead: { select: { id: true, name: true, phone: true, campaignId: true } },
      },
    });
    if (!log) throw new AppError(404, 'LOG_NOT_FOUND', 'Call log not found');
    if (req.user!.role === 'agent' && log.agentId !== req.user!.userId) {
      throw new AppError(403, 'FORBIDDEN', 'Access denied');
    }
    res.json({ success: true, data: log });
  } catch (err) {
    next(err);
  }
});

export default router;
