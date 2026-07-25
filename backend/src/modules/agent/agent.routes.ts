import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { getUserBranchId } from '../../lib/access';
import { authenticate, requireRole } from '../../middleware/auth';
import { AppError } from '../../middleware/errorHandler';
import { io } from '../../index';

const router = Router();
router.use(authenticate);

// ── GET /api/agent/dashboard ──────────────────────────────────────────
// Agent's workspace summary scoped to the selected date range

router.get('/dashboard', requireRole('agent'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const agentId = req.user!.userId;
    const branchId = getUserBranchId(req.user!);
    const query = z.object({
      from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    }).parse(req.query);
    const rangeStart = query.from ? parseDateAtStartOfDay(query.from) : startOfDay(new Date());
    const rangeEnd = query.to ? parseDateAtEndOfDay(query.to) : endOfDay(new Date());

    const [
      totalLeads,
      uniqueCallsInRange,
      newLeads,
      followUpStatusBreakdown,
      callsInRange,
      talkTimeInRange,
      followUpsInRange,
      activeBreak,
      breakTimeInRange,
      recentCalls,
      tagStats,
    ] = await Promise.all([
      prisma.lead.count({ where: { assignedToId: agentId, branchId, deletedAt: null } }),
      prisma.callLog.groupBy({
        by: ['leadId'],
        where: { agentId, calledAt: { gte: rangeStart, lte: rangeEnd } },
      }),
      prisma.lead.count({
        where: {
          assignedToId: agentId,
          branchId,
          deletedAt: null,
          status: 'uncontacted',
        },
      }),
      prisma.lead.groupBy({
        by: ['status'],
        where: { assignedToId: agentId, branchId, deletedAt: null },
        _count: { status: true },
      }),
      prisma.callLog.count({ where: { agentId, calledAt: { gte: rangeStart, lte: rangeEnd } } }),
      prisma.callLog.aggregate({
        where: { agentId, calledAt: { gte: rangeStart, lte: rangeEnd } },
        _sum: { durationSeconds: true },
      }),
      prisma.followUp.findMany({
        where: { agentId, scheduledAt: { gte: rangeStart, lte: rangeEnd }, status: 'pending' },
        include: { lead: { select: { id: true, name: true, phone: true } } },
        orderBy: { scheduledAt: 'asc' },
      }),
      prisma.breakLog.findFirst({ where: { agentId, endedAt: null } }),
      // Total break minutes in the selected range.
      prisma.$queryRaw<Array<{ mins: number }>>`
        SELECT COALESCE(SUM(
          EXTRACT(EPOCH FROM (COALESCE("endedAt", NOW()) - "startedAt")) / 60
        ), 0) as mins
        FROM break_logs WHERE "agentId" = ${agentId}
        AND "startedAt" >= ${rangeStart}
        AND "startedAt" <= ${rangeEnd}
      `,
      prisma.callLog.findMany({
        where: { agentId, calledAt: { gte: rangeStart, lte: rangeEnd } },
        orderBy: { calledAt: 'desc' },
        take: 5,
        include: { lead: { select: { id: true, name: true, phone: true, status: true, priority: true } } },
      }),
      // Calls by tag in the selected range.
      prisma.callLog.groupBy({
        by: ['dispositionTag'],
        where: { agentId, calledAt: { gte: rangeStart, lte: rangeEnd } },
        _count: { dispositionTag: true },
      }),
    ]);

    res.json({
      success: true,
      data: {
        stats: {
          totalLeads,
          uniqueCalls: uniqueCallsInRange.length,
          newLeads,
          callsToday: callsInRange,
          talkTimeSeconds: talkTimeInRange._sum.durationSeconds || 0,
          breakMinutesToday: Math.round(Number((breakTimeInRange[0] as { mins: number })?.mins || 0)),
          isOnBreak: !!activeBreak,
          breakStartedAt: activeBreak?.startedAt || null,
        },
        followUpsToday: followUpsInRange.map(f => ({ ...f, lead: maskPhone(f.lead) })),
        recentCalls: recentCalls.map(c => ({ ...c, lead: maskPhone(c.lead) })),
        followUpStatusBreakdown: followUpStatusBreakdown.map((entry) => ({
          status: entry.status,
          count: entry._count.status,
        })),
        tagStats: tagStats.map((t) => ({ tag: t.dispositionTag, count: t._count.dispositionTag })),
      },
    });
  } catch (err) {
    next(err);
  }
});

function startOfDay(value: Date) {
  const next = new Date(value);
  next.setHours(0, 0, 0, 0);
  return next;
}

function endOfDay(value: Date) {
  const next = new Date(value);
  next.setHours(23, 59, 59, 999);
  return next;
}

function parseDateAtStartOfDay(value: string) {
  const next = new Date(`${value}T00:00:00`);
  next.setHours(0, 0, 0, 0);
  return next;
}

function parseDateAtEndOfDay(value: string) {
  const next = new Date(`${value}T00:00:00`);
  next.setHours(23, 59, 59, 999);
  return next;
}

// ── GET /api/agent/next-lead ──────────────────────────────────────────
// Returns next lead from priority queue:
// 1. Overdue follow-ups first
// 2. High-priority uncontacted leads
// 3. Normal priority uncontacted leads

router.get('/next-lead', requireRole('agent'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const agentId = req.user!.userId;
    const { campaignId, excludeLeadId } = req.query as Record<string, string>;

    // 1. Check for overdue follow-up lead
    const overdueFollowUp = await prisma.followUp.findFirst({
      where: {
        agentId,
        status: 'pending',
        scheduledAt: { lte: new Date() },
        ...(excludeLeadId ? { leadId: { not: excludeLeadId } } : {}),
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

    // 2. New leads first (high priority, then normal), then callback queue.
    const baseWhere = {
      assignedToId: agentId,
      isDnd: false,
      ...(excludeLeadId ? { id: { not: excludeLeadId } } : {}),
      ...(campaignId ? { campaignId } : {}),
    };

    const highPriorityNewLead = await prisma.lead.findFirst({
      where: { ...baseWhere, priority: 'high', status: 'uncontacted' },
      orderBy: [{ lastCalledAt: { sort: 'asc', nulls: 'first' } }, { createdAt: 'asc' }],
      include: { campaign: { select: { id: true, name: true, script: true } } },
    });

    if (highPriorityNewLead) {
      return res.json({ success: true, data: { type: 'lead', priority: 'high', lead: maskPhone(highPriorityNewLead) } });
    }

    const normalNewLead = await prisma.lead.findFirst({
      where: { ...baseWhere, status: 'uncontacted' },
      orderBy: [{ lastCalledAt: { sort: 'asc', nulls: 'first' } }, { createdAt: 'asc' }],
      include: { campaign: { select: { id: true, name: true, script: true } } },
    });

    if (normalNewLead) {
      return res.json({ success: true, data: { type: 'lead', priority: 'normal', lead: maskPhone(normalNewLead) } });
    }

    const highPriorityCallback = await prisma.lead.findFirst({
      where: { ...baseWhere, priority: 'high', status: 'callback' },
      orderBy: [{ lastCalledAt: { sort: 'asc', nulls: 'first' } }, { createdAt: 'asc' }],
      include: { campaign: { select: { id: true, name: true, script: true } } },
    });

    if (highPriorityCallback) {
      return res.json({ success: true, data: { type: 'lead', priority: 'high', lead: maskPhone(highPriorityCallback) } });
    }

    const normalCallback = await prisma.lead.findFirst({
      where: { ...baseWhere, status: 'callback' },
      orderBy: [{ lastCalledAt: { sort: 'asc', nulls: 'first' } }, { createdAt: 'asc' }],
      include: { campaign: { select: { id: true, name: true, script: true } } },
    });

    if (normalCallback) {
      return res.json({ success: true, data: { type: 'lead', priority: 'normal', lead: maskPhone(normalCallback) } });
    }

    return res.json({ success: true, data: null, message: 'No more leads available' });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/agent/break/start ───────────────────────────────────────

router.post('/break/start', requireRole('agent'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const agentId = req.user!.userId;

    const activeBreak = await prisma.breakLog.findFirst({ where: { agentId, endedAt: null } });
    if (activeBreak) throw new AppError(400, 'ALREADY_ON_BREAK', 'You are already on a break');

    await prisma.user.update({ where: { id: agentId }, data: { status: 'on_break', breakStartedAt: new Date() } });
    const breakLog = await prisma.breakLog.create({ data: { agentId } });

    res.json({ success: true, data: { breakId: breakLog.id, startedAt: breakLog.startedAt } });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/agent/break/end ─────────────────────────────────────────

router.post('/break/end', requireRole('agent'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const agentId = req.user!.userId;

    const activeBreak = await prisma.breakLog.findFirst({ where: { agentId, endedAt: null } });
    if (!activeBreak) throw new AppError(400, 'NOT_ON_BREAK', 'You are not currently on a break');

    const endedAt = new Date();
    const durationMins = Math.round((endedAt.getTime() - activeBreak.startedAt.getTime()) / 60000);

    await prisma.$transaction([
      prisma.breakLog.update({ where: { id: activeBreak.id }, data: { endedAt } }),
      prisma.user.update({ where: { id: agentId }, data: { status: 'active', breakStartedAt: null } }),
    ]);

    res.json({ success: true, data: { breakId: activeBreak.id, startedAt: activeBreak.startedAt, endedAt, durationMins } });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/agent/call/initiate ─────────────────────────────────────
// Click-to-Call stub — replaced with real provider in Phase 3

router.post('/call/initiate', requireRole('agent'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { leadId } = z.object({ leadId: z.string().uuid() }).parse(req.body);
    const agentId = req.user!.userId;

    const lead = await prisma.lead.findUnique({ where: { id: leadId } });
    if (!lead) throw new AppError(404, 'LEAD_NOT_FOUND', 'Lead not found');
    if (lead.assignedToId !== agentId) throw new AppError(403, 'FORBIDDEN', 'Lead not assigned to you');
    if (lead.isDnd) throw new AppError(400, 'DND_BLOCKED', 'This number is on the DND list');

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
    throw new AppError(501, 'NOT_IMPLEMENTED', `Telephony provider "${provider}" not yet integrated`);
  } catch (err) {
    next(err);
  }
});

// ── GET /api/agent/break-history ──────────────────────────────────────

router.get('/break-history', requireRole('agent'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const agentId = req.user!.userId;
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const breaks = await prisma.breakLog.findMany({
      where: { agentId, startedAt: { gte: todayStart } },
      orderBy: { startedAt: 'desc' },
    });

    const totalMins = breaks.reduce((sum, b) => {
      const end = b.endedAt || new Date();
      return sum + Math.round((end.getTime() - b.startedAt.getTime()) / 60000);
    }, 0);

    res.json({ success: true, data: { breaks, totalMinsToday: totalMins } });
  } catch (err) {
    next(err);
  }
});

// ── Helpers ───────────────────────────────────────────────────────────

function maskPhone<T extends { phone: string }>(lead: T): any {
  const { phone, ...rest } = lead;
  return { ...rest, phoneMasked: `****${phone.slice(-4)}` };
}

export default router;
