import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { callsService } from '../../services/crm.service';
import AppLayout from '../../components/layout/AppLayout';
import { AlertCircle } from 'lucide-react';
import DateRangeFilter, { computeRange, type DateRangeValue } from '../../components/ui/DateRangeFilter';
import Dropdown from '../../components/ui/Dropdown';

type AgentPerformanceRow = {
  agentId: string;
  name: string;
  calls: number;
  connected: number;
  avgDuration: number;
  interested: number;
  callback: number;
  notInterested: number;
  rnr: number;
  busy: number;
  dnd: number;
  invalid: number;
};

type AgentTalkTimeRow = {
  agentId: string;
  name: string;
  totalCalls: number;
  connectedCalls: number;
  cleanCalls: number;
  uniqueCallCount: number;
  talkSeconds: number;
  totalDurationSeconds: number;
  averageGapSeconds: number;
};

type CallsSummary = {
  agentLeaderboard: AgentPerformanceRow[];
  agentTalkTimeReport: AgentTalkTimeRow[];
};

function formatDuration(totalSeconds: number) {
  const safeSeconds = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;
  return [hours, minutes, seconds].map((value) => String(value).padStart(2, '0')).join(':');
}

// ── Analytics Page ────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const [dateRange, setDateRange] = useState<DateRangeValue>(() => {
    const range = computeRange('today');
    return { preset: 'today', from: range.from, to: range.to };
  });
  const [reportType, setReportType] = useState<'agent_performance' | 'agent_talk_time'>('agent_performance');

  const { data: summaryData } = useQuery({
    queryKey: ['calls-summary', dateRange.from, dateRange.to],
    queryFn: () => callsService.summary({ from: dateRange.from, to: dateRange.to }),
  });

  const summary = summaryData?.data?.data as CallsSummary | undefined;
  const agentPerformanceRows = summary?.agentLeaderboard || [];
  const agentTalkTimeRows = summary?.agentTalkTimeReport || [];

  const rangeLabel = dateRange.preset === 'custom'
    ? `${dateRange.from} to ${dateRange.to}`
    : dateRange.preset === 'all_time'
      ? 'All Time'
      : undefined;

  return (
    <AppLayout>
      <div className="page-container">
        {/* Header */}
        <div className="page-header">
          <div>
            <h1 className="page-title">Analytics</h1>
            <p className="page-subtitle">Agent performance insights</p>
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ minWidth: 220 }}>
              <Dropdown
                value={reportType}
                onChange={(value) => setReportType(value as 'agent_performance' | 'agent_talk_time')}
                placeholder="Select Report"
                height={38}
                options={[
                  { value: 'agent_performance', label: 'Agent Performance' },
                  { value: 'agent_talk_time', label: 'Agent Talk Time Report' },
                ]}
              />
            </div>
            <DateRangeFilter value={dateRange} onChange={setDateRange} />
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h2 className="card-title">{reportType === 'agent_performance' ? 'Agent Performance' : 'Agent Talk Time Report'}</h2>
            <span className="card-subtitle">{rangeLabel || 'Selected range'}</span>
          </div>
          {reportType === 'agent_performance' ? (
            agentPerformanceRows.length === 0 ? (
              <div className="empty-state"><AlertCircle size={28} /><p>No call data available</p></div>
            ) : (
              <div className="table-responsive">
                <div className="table-header" style={{ minWidth: 900 }}>
                  <div className="table-col" style={{ flex: 0.3, minWidth: 40 }}>#</div>
                  <div className="table-col" style={{ flex: 1.5, minWidth: 150 }}>Agent</div>
                  <div className="table-col" style={{ flex: 1, minWidth: 100 }}>Total Calls</div>
                  <div className="table-col" style={{ flex: 1, minWidth: 100 }}>Connected</div>
                  <div className="table-col" style={{ flex: 1, minWidth: 100 }}>Interested</div>
                  <div className="table-col" style={{ flex: 1, minWidth: 100 }}>Callback</div>
                  <div className="table-col" style={{ flex: 1, minWidth: 100 }}>RNR/Busy</div>
                  <div className="table-col" style={{ flex: 1, minWidth: 100 }}>Not Int/DND</div>
                  <div className="table-col" style={{ flex: 1, minWidth: 100 }}>Conv. Rate</div>
                </div>
                {agentPerformanceRows.map((a, i) => {
                  const convRate = a.connected > 0 ? Math.round((a.interested / a.connected) * 100) : 0;
                  return (
                    <div key={a.agentId} className="table-row" style={{ minWidth: 900 }}>
                      <div className="table-cell" style={{ flex: 0.3, minWidth: 40, fontWeight: 700, color: i < 3 ? ['#f59e0b', '#94a3b8', '#b45309'][i] : 'var(--text-muted)' }}>
                        {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}
                      </div>
                      <div className="table-cell" style={{ flex: 1.5, minWidth: 150, display: 'flex', gap: 10, alignItems: 'center' }}>
                        <div className="avatar avatar--sm">{a.name.charAt(0)}</div>
                        <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: 500, color: 'var(--text-primary)' }}>
                          {a.name}
                          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 400 }}>Avg: {formatDuration(a.avgDuration)}</div>
                        </div>
                      </div>
                      <div className="table-cell" style={{ flex: 1, minWidth: 100, fontWeight: 600 }}>{a.calls}</div>
                      <div className="table-cell" style={{ flex: 1, minWidth: 100 }}>{a.connected}</div>
                      <div className="table-cell" style={{ flex: 1, minWidth: 100, color: '#22c55e', fontWeight: 600 }}>{a.interested}</div>
                      <div className="table-cell" style={{ flex: 1, minWidth: 100, color: '#eab308' }}>{a.callback}</div>
                      <div className="table-cell" style={{ flex: 1, minWidth: 100 }}>{a.rnr + a.busy}</div>
                      <div className="table-cell" style={{ flex: 1, minWidth: 100 }}>{a.notInterested + a.dnd}</div>
                      <div className="table-cell" style={{ flex: 1, minWidth: 100 }}>
                        <span className="badge" style={{ background: convRate > 15 ? '#14532d' : '#1e293b', color: convRate > 15 ? '#22c55e' : '#a8a29e' }}>
                          {convRate}%
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          ) : agentTalkTimeRows.length === 0 ? (
            <div className="empty-state"><AlertCircle size={28} /><p>No call data available</p></div>
          ) : (
            <div className="table-responsive">
              <div className="table-header" style={{ minWidth: 1100 }}>
                <div className="table-col" style={{ flex: 0.3, minWidth: 40 }}>#</div>
                <div className="table-col" style={{ flex: 1.5, minWidth: 150 }}>Agent</div>
                <div className="table-col" style={{ flex: 1.1, minWidth: 120 }}>Talk Time</div>
                <div className="table-col" style={{ flex: 1, minWidth: 100 }}>Total Calls</div>
                <div className="table-col" style={{ flex: 1, minWidth: 120 }}>Connected Calls</div>
                <div className="table-col" style={{ flex: 1, minWidth: 120 }}>Clean Calls</div>
                <div className="table-col" style={{ flex: 1, minWidth: 120 }}>Unique Call Count</div>
                <div className="table-col" style={{ flex: 1.1, minWidth: 120 }}>Total Duration</div>
                <div className="table-col" style={{ flex: 1.2, minWidth: 140 }}>Avg Gap Between Calls</div>
              </div>
              {agentTalkTimeRows.map((row, i) => {
                return (
                  <div key={row.agentId} className="table-row" style={{ minWidth: 1100 }}>
                    <div className="table-cell" style={{ flex: 0.3, minWidth: 40, fontWeight: 700, color: i < 3 ? ['#f59e0b', '#94a3b8', '#b45309'][i] : 'var(--text-muted)' }}>
                      {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}
                    </div>
                    <div className="table-cell" style={{ flex: 1.5, minWidth: 150, display: 'flex', gap: 10, alignItems: 'center' }}>
                      <div className="avatar avatar--sm">{row.name.charAt(0)}</div>
                      <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: 500, color: 'var(--text-primary)' }}>
                        {row.name}
                      </div>
                    </div>
                    <div className="table-cell" style={{ flex: 1.1, minWidth: 120, fontWeight: 600 }}>{formatDuration(row.talkSeconds)}</div>
                    <div className="table-cell" style={{ flex: 1, minWidth: 100 }}>{row.totalCalls}</div>
                    <div className="table-cell" style={{ flex: 1, minWidth: 120 }}>{row.connectedCalls}</div>
                    <div className="table-cell" style={{ flex: 1, minWidth: 120 }}>{row.cleanCalls}</div>
                    <div className="table-cell" style={{ flex: 1, minWidth: 120 }}>{row.uniqueCallCount}</div>
                    <div className="table-cell" style={{ flex: 1.1, minWidth: 120 }}>{formatDuration(row.totalDurationSeconds)}</div>
                    <div className="table-cell" style={{ flex: 1.2, minWidth: 140 }}>{formatDuration(row.averageGapSeconds)}</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
