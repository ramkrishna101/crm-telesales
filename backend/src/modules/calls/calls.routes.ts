import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { Prisma } from '@prisma/client';
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
      // Auto-complete pending follow-ups for this lead
      prisma.followUp.updateMany({
        where: { leadId: body.leadId, agentId, status: 'pending' },
        data: { status: 'done' },
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
      page = '1', limit = '50', agentId, leadId, campaignId,
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
    if (leadId) where.leadId = leadId;
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
          lead: { select: { id: true, name: true, phone: true, campaignId: true, status: true, priority: true } },
        },
      }),
      prisma.callLog.count({ where }),
    ]);

    const maskedLogs = logs.map(l => ({
      ...l,
      lead: {
        ...l.lead,
        phoneMasked: `****${l.lead.phone.slice(-4)}`,
        phone: undefined
      }
    }));

    res.json({ success: true, data: { logs: maskedLogs, total, page: parseInt(page), limit: parseInt(limit) } });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/calls/summary ────────────────────────────────────────────
// Hourly heatmap + tag breakdown for analytics

router.get('/summary', requireRole('admin', 'supervisor'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { from, to, agentId, campaignId } = req.query as Record<string, string>;

    let dateFilter: Record<string, Date> | undefined;
    if (from && to) {
      // Parse dates assuming the input is meant to be in IST (+05:30)
      const gte = new Date(`${from}T00:00:00+05:30`);
      const lte = new Date(`${to}T23:59:59.999+05:30`);
      dateFilter = { gte, lte };
    } else {
      dateFilter = { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) };
    }

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

      // Heatmap: calls by hour of day (converted to IST)
      agentId
        ? prisma.$queryRaw<Array<{ hour: number; count: bigint }>>`
            SELECT EXTRACT(HOUR FROM "calledAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata') as hour, COUNT(*) as count
            FROM call_logs
            WHERE "calledAt" >= ${dateFilter.gte} AND "calledAt" <= ${dateFilter.lte ?? new Date()}
            AND "agentId" = ${agentId}
            GROUP BY EXTRACT(HOUR FROM "calledAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')
            ORDER BY hour
          `
        : prisma.$queryRaw<Array<{ hour: number; count: bigint }>>`
            SELECT EXTRACT(HOUR FROM "calledAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata') as hour, COUNT(*) as count
            FROM call_logs
            WHERE "calledAt" >= ${dateFilter.gte} AND "calledAt" <= ${dateFilter.lte ?? new Date()}
            GROUP BY EXTRACT(HOUR FROM "calledAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')
            ORDER BY hour
          `,

      // Daily call volume (converted to IST)
      prisma.$queryRaw<Array<{ date: string; count: bigint; avgDuration: number }>>`
        SELECT DATE("calledAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata') as date, COUNT(*) as count,
               ROUND(AVG("durationSeconds")) as "avgDuration"
        FROM call_logs
        WHERE "calledAt" >= ${dateFilter.gte}
        GROUP BY DATE("calledAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata') ORDER BY date
      `,

      // Agent leaderboard with disposition breakdown
      prisma.$queryRaw<Array<{ 
        agentId: string; name: string; calls: bigint; connected: bigint; avgDuration: number;
        interested: bigint; callback: bigint; notInterested: bigint; rnr: bigint; busy: bigint; dnd: bigint; invalid: bigint;
      }>>`
        SELECT 
          u.id as "agentId", 
          u.name, 
          COUNT(cl.id) as calls,
          COUNT(CASE WHEN cl."durationSeconds" > 0 THEN 1 END) as connected,
          SUM(CASE WHEN cl."dispositionTag" = 'Interested' THEN 1 ELSE 0 END) as interested,
          SUM(CASE WHEN cl."dispositionTag" = 'Callback' THEN 1 ELSE 0 END) as callback,
          SUM(CASE WHEN cl."dispositionTag" = 'Not Interested' THEN 1 ELSE 0 END) as "notInterested",
          SUM(CASE WHEN cl."dispositionTag" = 'RNR' THEN 1 ELSE 0 END) as rnr,
          SUM(CASE WHEN cl."dispositionTag" = 'Busy' THEN 1 ELSE 0 END) as busy,
          SUM(CASE WHEN cl."dispositionTag" = 'DND' THEN 1 ELSE 0 END) as dnd,
          SUM(CASE WHEN cl."dispositionTag" = 'Invalid Number' THEN 1 ELSE 0 END) as invalid,
          ROUND(AVG(cl."durationSeconds")) as "avgDuration"
        FROM users u JOIN call_logs cl ON cl."agentId" = u.id
        WHERE cl."calledAt" >= ${dateFilter.gte} ${dateFilter.lte ? Prisma.sql`AND cl."calledAt" <= ${dateFilter.lte}` : Prisma.empty}
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
          interested: Number(a.interested), callback: Number(a.callback), notInterested: Number(a.notInterested),
          rnr: Number(a.rnr), busy: Number(a.busy), dnd: Number(a.dnd), invalid: Number(a.invalid),
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
