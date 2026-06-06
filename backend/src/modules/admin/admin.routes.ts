import { Router, Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { authenticate, requireRole } from '../../middleware/auth';
import { ADMIN_ROLES, getUserBranchId, isSuperAdmin } from '../../lib/access';

const router = Router();

router.use(authenticate);
router.use(requireRole(...ADMIN_ROLES));

type DateRange = { start: Date; end: Date };

function resolveCurrentRange(from?: string, to?: string): DateRange {
  if (from === '' && to === '') {
    return {
      start: new Date(0),
      end: new Date(),
    };
  }

  if (from && to) {
    return {
      start: new Date(`${from}T00:00:00+05:30`),
      end: new Date(`${to}T23:59:59.999+05:30`),
    };
  }

  const now = new Date();
  return {
    start: new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000),
    end: now,
  };
}

function resolvePreviousRange(current: DateRange): DateRange {
  const spanMs = current.end.getTime() - current.start.getTime() + 1;
  const end = new Date(current.start.getTime() - 1);
  const start = new Date(end.getTime() - spanMs + 1);
  return { start, end };
}

function toDelta(current: number, previous: number) {
  if (!previous) {
    return current > 0 ? 100 : 0;
  }

  return Math.round(((current - previous) / previous) * 100);
}

router.get('/dashboard', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { from, to, campaignId } = req.query as Record<string, string>;
    const currentRange = resolveCurrentRange(from, to);
    const previousRange = resolvePreviousRange(currentRange);
    const branchId = isSuperAdmin(req.user!.role) ? undefined : getUserBranchId(req.user!);

    const leadScope = {
      deletedAt: null,
      ...(branchId ? { branchId } : {}),
      ...(campaignId ? { campaignId } : {}),
    };

    const currentLeadInventoryScope = { ...leadScope, createdAt: { lte: currentRange.end } };
    const previousLeadInventoryScope = { ...leadScope, createdAt: { lte: previousRange.end } };
    const currentLeadScope = { ...leadScope, createdAt: { gte: currentRange.start, lte: currentRange.end } };
    const previousLeadScope = { ...leadScope, createdAt: { gte: previousRange.start, lte: previousRange.end } };

    const currentCallWhere = {
      calledAt: { gte: currentRange.start, lte: currentRange.end },
      lead: leadScope,
    };
    const previousCallWhere = {
      calledAt: { gte: previousRange.start, lte: previousRange.end },
      lead: leadScope,
    };

    const currentFollowUpWhere = {
      status: 'pending' as const,
      scheduledAt: { gte: currentRange.start, lte: currentRange.end },
      lead: leadScope,
    };
    const previousFollowUpWhere = {
      status: 'pending' as const,
      scheduledAt: { gte: previousRange.start, lte: previousRange.end },
      lead: leadScope,
    };

    const [
      currentLeadCount,
      previousLeadCount,
      currentCallCount,
      previousCallCount,
      currentConnectedCalls,
      previousConnectedCalls,
      currentCallbacksDue,
      previousCallbacksDue,
      activeCampaigns,
      currentActiveAgents,
      previousActiveAgents,
      leadStatusGroups,
      callOutcomeGroups,
      dailyTrend,
      agentLeaderboard,
      campaignPerformance,
      lowActivityAgents,
      staleLeads,
    ] = await Promise.all([
      prisma.lead.count({ where: currentLeadInventoryScope }),
      prisma.lead.count({ where: previousLeadInventoryScope }),
      prisma.callLog.count({ where: currentCallWhere }),
      prisma.callLog.count({ where: previousCallWhere }),
      prisma.callLog.count({ where: { ...currentCallWhere, durationSeconds: { gt: 0 } } }),
      prisma.callLog.count({ where: { ...previousCallWhere, durationSeconds: { gt: 0 } } }),
      prisma.followUp.count({ where: currentFollowUpWhere }),
      prisma.followUp.count({ where: previousFollowUpWhere }),
      prisma.campaign.count({ where: { status: 'active', ...(branchId ? { branchId } : {}), ...(campaignId ? { id: campaignId } : {}) } }),
      prisma.callLog.groupBy({ by: ['agentId'], where: currentCallWhere, _count: { agentId: true } }),
      prisma.callLog.groupBy({ by: ['agentId'], where: previousCallWhere, _count: { agentId: true } }),
      prisma.lead.groupBy({ by: ['status'], where: currentLeadScope, _count: { status: true } }),
      prisma.callLog.groupBy({ by: ['dispositionTag'], where: currentCallWhere, _count: { dispositionTag: true }, orderBy: { _count: { dispositionTag: 'desc' } } }),
      prisma.$queryRaw<Array<{ date: string; total: bigint; connected: bigint; callback: bigint; busy: bigint; noAnswer: bigint; talkSeconds: bigint }>>`
        SELECT
          DATE(cl."calledAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata') as date,
          COUNT(*) as total,
          COUNT(CASE WHEN cl."durationSeconds" > 0 THEN 1 END) as connected,
          SUM(CASE WHEN cl."dispositionTag" = 'Callback' THEN 1 ELSE 0 END) as callback,
          SUM(CASE WHEN cl."dispositionTag" = 'Busy' THEN 1 ELSE 0 END) as busy,
          SUM(CASE WHEN cl."dispositionTag" IN ('RNR', 'No Answer') THEN 1 ELSE 0 END) as "noAnswer",
          COALESCE(SUM(cl."durationSeconds"), 0) as "talkSeconds"
        FROM call_logs cl
        JOIN leads l ON cl."leadId" = l.id
        WHERE cl."calledAt" >= ${currentRange.start}
          AND cl."calledAt" <= ${currentRange.end}
          ${branchId ? Prisma.sql`AND l."branchId" = ${branchId}` : Prisma.empty}
          ${campaignId ? Prisma.sql`AND l."campaignId" = ${campaignId}` : Prisma.empty}
        GROUP BY DATE(cl."calledAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')
        ORDER BY date
      `,
      prisma.$queryRaw<Array<{ agentId: string; name: string; calls: bigint; connected: bigint; callbacks: bigint; talkSeconds: bigint }>>`
        SELECT
          u.id as "agentId",
          u.name,
          COUNT(cl.id) as calls,
          COUNT(CASE WHEN cl."durationSeconds" > 0 THEN 1 END) as connected,
          SUM(CASE WHEN cl."dispositionTag" = 'Callback' THEN 1 ELSE 0 END) as callbacks,
          COALESCE(SUM(cl."durationSeconds"), 0) as "talkSeconds"
        FROM users u
        JOIN call_logs cl ON cl."agentId" = u.id
        JOIN leads l ON cl."leadId" = l.id
        WHERE cl."calledAt" >= ${currentRange.start}
          AND cl."calledAt" <= ${currentRange.end}
          ${branchId ? Prisma.sql`AND l."branchId" = ${branchId}` : Prisma.empty}
          ${campaignId ? Prisma.sql`AND l."campaignId" = ${campaignId}` : Prisma.empty}
        GROUP BY u.id, u.name
        ORDER BY calls DESC
        LIMIT 8
      `,
      prisma.$queryRaw<Array<{ campaignId: string; name: string; leads: bigint; calls: bigint; connected: bigint }>>`
        SELECT
          c.id as "campaignId",
          c.name,
          COUNT(DISTINCT l.id) as leads,
          COUNT(cl.id) as calls,
          COUNT(CASE WHEN cl."durationSeconds" > 0 THEN 1 END) as connected
        FROM campaigns c
        LEFT JOIN leads l ON l."campaignId" = c.id AND l."deletedAt" IS NULL
        LEFT JOIN call_logs cl ON cl."leadId" = l.id
          AND cl."calledAt" >= ${currentRange.start}
          AND cl."calledAt" <= ${currentRange.end}
        WHERE c."deletedAt" IS NULL
          ${branchId ? Prisma.sql`AND c."branchId" = ${branchId}` : Prisma.empty}
          ${campaignId ? Prisma.sql`AND c.id = ${campaignId}` : Prisma.empty}
        GROUP BY c.id, c.name
        ORDER BY calls DESC, leads DESC
        LIMIT 8
      `,
      prisma.$queryRaw<Array<{ agentId: string; name: string; calls: bigint }>>`
        SELECT
          u.id as "agentId",
          u.name,
          COUNT(cl.id) as calls
        FROM users u
        LEFT JOIN call_logs cl ON cl."agentId" = u.id
          AND cl."calledAt" >= ${currentRange.start}
          AND cl."calledAt" <= ${currentRange.end}
        LEFT JOIN leads l ON cl."leadId" = l.id
        WHERE u.role = 'agent'
          AND u."deletedAt" IS NULL
          ${branchId ? Prisma.sql`AND u."branchId" = ${branchId}` : Prisma.empty}
          ${campaignId ? Prisma.sql`AND (l."campaignId" = ${campaignId} OR cl.id IS NULL)` : Prisma.empty}
        GROUP BY u.id, u.name
        ORDER BY calls ASC, u.name ASC
        LIMIT 5
      `,
      prisma.lead.count({
        where: {
          ...leadScope,
          status: 'uncontacted',
          createdAt: { lt: new Date(Date.now() - 48 * 60 * 60 * 1000) },
        },
      }),
    ]);

    const connectRate = currentCallCount ? Math.round((currentConnectedCalls / currentCallCount) * 100) : 0;
    const previousConnectRate = previousCallCount ? Math.round((previousConnectedCalls / previousCallCount) * 100) : 0;

    res.json({
      success: true,
      data: {
        kpis: {
          totalLeads: {
            current: currentLeadCount,
            previous: previousLeadCount,
            delta: toDelta(currentLeadCount, previousLeadCount),
          },
          totalCalls: {
            current: currentCallCount,
            previous: previousCallCount,
            delta: toDelta(currentCallCount, previousCallCount),
          },
          connectRate: {
            current: connectRate,
            previous: previousConnectRate,
            delta: connectRate - previousConnectRate,
          },
          activeAgents: {
            current: currentActiveAgents.length,
            previous: previousActiveAgents.length,
            delta: toDelta(currentActiveAgents.length, previousActiveAgents.length),
          },
          callbacksDue: {
            current: currentCallbacksDue,
            previous: previousCallbacksDue,
            delta: toDelta(currentCallbacksDue, previousCallbacksDue),
          },
          activeCampaigns: {
            current: activeCampaigns,
            previous: activeCampaigns,
            delta: 0,
          },
        },
        funnel: [
          { key: 'uncontacted', label: 'New Lead', count: leadStatusGroups.find((item) => item.status === 'uncontacted')?._count.status || 0 },
          { key: 'contacted', label: 'Contacted', count: leadStatusGroups.find((item) => item.status === 'contacted')?._count.status || 0 },
          { key: 'lead', label: 'Interested', count: leadStatusGroups.find((item) => item.status === 'lead')?._count.status || 0 },
          { key: 'callback', label: 'Callback', count: leadStatusGroups.find((item) => item.status === 'callback')?._count.status || 0 },
          { key: 'not_interested', label: 'Not Interested', count: leadStatusGroups.find((item) => item.status === 'not_interested')?._count.status || 0 },
          { key: 'dnd', label: 'DND', count: leadStatusGroups.find((item) => item.status === 'dnd')?._count.status || 0 },
          { key: 'invalid', label: 'Invalid', count: leadStatusGroups.find((item) => item.status === 'invalid')?._count.status || 0 },
        ],
        callTrend: dailyTrend.map((row) => ({
          date: row.date,
          total: Number(row.total),
          connected: Number(row.connected),
          callback: Number(row.callback),
          busy: Number(row.busy),
          noAnswer: Number(row.noAnswer),
          talkMinutes: Math.round(Number(row.talkSeconds) / 60),
        })),
        callOutcomes: callOutcomeGroups.map((row) => ({
          label: row.dispositionTag,
          count: row._count.dispositionTag,
        })),
        agentPerformance: agentLeaderboard.map((row) => ({
          agentId: row.agentId,
          name: row.name,
          calls: Number(row.calls),
          connected: Number(row.connected),
          connectRate: Number(row.calls) ? Math.round((Number(row.connected) / Number(row.calls)) * 100) : 0,
          callbacks: Number(row.callbacks),
          talkMinutes: Math.round(Number(row.talkSeconds) / 60),
        })),
        campaignPerformance: campaignPerformance.map((row) => ({
          campaignId: row.campaignId,
          name: row.name,
          leads: Number(row.leads),
          calls: Number(row.calls),
          connected: Number(row.connected),
          connectRate: Number(row.calls) ? Math.round((Number(row.connected) / Number(row.calls)) * 100) : 0,
        })),
        watchlist: {
          lowActivityAgents: lowActivityAgents.map((row) => ({
            agentId: row.agentId,
            name: row.name,
            calls: Number(row.calls),
          })),
          staleLeadCount: staleLeads,
          callbackBacklog: currentCallbacksDue,
        },
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;