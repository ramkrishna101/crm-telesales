import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Chart as ChartJS,
  ArcElement,
  CategoryScale,
  LinearScale,
  BarElement,
  Tooltip,
  Legend,
} from 'chart.js';
import { Bar, Doughnut } from 'react-chartjs-2';
import { agentService, callsService } from '../../services/crm.service';
import AppLayout from '../../components/layout/AppLayout';
import { useIsMobile } from '../../hooks/useIsMobile';
import DateRangeFilter, { computeRange, type DateRangeValue } from '../../components/ui/DateRangeFilter';
import toast from 'react-hot-toast';
import {
  Phone, Coffee, Clock,
  RefreshCw, AlertCircle, PhoneCall
} from 'lucide-react';

ChartJS.register(ArcElement, CategoryScale, LinearScale, BarElement, Tooltip, Legend);

const FOLLOW_UP_STATUS_META: Record<string, { label: string; colour: string }> = {
  uncontacted: { label: 'New Lead', colour: '#6366f1' },
  contacted: { label: 'Contacted', colour: '#0ea5e9' },
  lead: { label: 'Interested', colour: '#22c55e' },
  callback: { label: 'Callback', colour: '#f59e0b' },
  not_interested: { label: 'Not Interested', colour: '#ef4444' },
  dnd: { label: 'DND', colour: '#ec4899' },
  invalid: { label: 'Invalid', colour: '#94a3b8' },
};

const FOLLOW_UP_STATUS_ORDER = [
  'uncontacted',
  'contacted',
  'lead',
  'callback',
  'not_interested',
  'dnd',
  'invalid',
];

const CALL_RESULT_COLOURS = [
  '#22c55e',
  '#6366f1',
  '#f59e0b',
  '#0ea5e9',
  '#ef4444',
  '#14b8a6',
  '#ec4899',
  '#94a3b8',
];

interface Lead {
  id: string; name: string | null; phoneMasked: string; email: string | null;
  status: string; priority: string; isDnd: boolean;
  campaign?: { id: string; name: string; script?: string | null };
}
interface RecentCall {
  id: string; leadId: string; calledAt: string; dispositionTag: string;
  lead: Lead;
}
interface ReminderItem {
  id: string;
  leadId: string;
  scheduledAt: string;
  status: string;
  notes?: string;
  lead: Lead;
}
interface FollowUpStatusBreakdownItem {
  status: string;
  count: number;
}
interface TagStatItem {
  tag: string;
  count: number;
}

function formatTalkTime(value?: number | null) {
  const totalSeconds = Math.max(0, Number(value) || 0);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) return `${hours}h ${minutes.toString().padStart(2, '0')}m`;
  if (minutes > 0) return `${minutes}m ${seconds.toString().padStart(2, '0')}s`;
  return `${seconds}s`;
}

// ── Break Timer ───────────────────────────────────────────────────────

function BreakTimer({ startedAt }: { startedAt: string }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const start = new Date(startedAt).getTime();
    const tick = () => setElapsed(Math.floor((Date.now() - start) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startedAt]);
  const m = Math.floor(elapsed / 60).toString().padStart(2, '0');
  const s = (elapsed % 60).toString().padStart(2, '0');
  return <span>{m}:{s}</span>;
}

// ── Leads List Modal ─────────────────────────────────────────────────

function DispositionLeadsModal({
  tag, from, to, onClose,
}: { tag: string; from: string; to: string; onClose: () => void; }) {
  const { data, isLoading } = useQuery({
    queryKey: ['calls', 'tag-details', tag, from, to],
    queryFn: () => {
      return callsService.list({ tag, from, to });
    },
  });

  const logs = data?.data?.data?.logs || [];

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: 600, width: '90%' }}>
        <div className="modal-header">
          <h3 className="modal-title">Leads: {tag}</h3>
          <button className="btn-icon" onClick={onClose} style={{ fontSize: '1.5rem', lineHeight: 1 }}>&times;</button>
        </div>
        <div className="modal-body" style={{ maxHeight: '60vh', overflowY: 'auto', padding: 0 }}>
          {isLoading ? (
            <div className="empty-state">Loading...</div>
          ) : logs.length === 0 ? (
            <div className="empty-state">No calls found with this disposition today.</div>
          ) : (
            logs.map((log: any) => (
              <div key={log.id} className="followup-row" style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{log.lead.name || 'Unknown'}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    {log.lead.phoneMasked} · {new Date(log.calledAt).toLocaleTimeString()}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

// ── Agent Dashboard ───────────────────────────────────────────────────

export default function AgentWorkspace() {
  const qc = useQueryClient();
  const isMobile = useIsMobile();
  const [selectedTagForList, setSelectedTagForList] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<DateRangeValue>(() => {
    const range = computeRange('today');
    return { preset: 'today', from: range.from, to: range.to };
  });
  const dateParams = { from: dateRange.from, to: dateRange.to };
  const rangeLabel =
    dateRange.preset === 'today' ? 'Today' :
    dateRange.preset === 'yesterday' ? 'Yesterday' :
    dateRange.preset === 'this_month' ? 'This month' :
    dateRange.preset === 'last_7_days' ? 'Last 7 days' :
    `${dateRange.from} → ${dateRange.to}`;

  const { data: dashData, refetch: refetchDash } = useQuery({
    queryKey: ['agent-dashboard', dateRange.from, dateRange.to],
    queryFn: () => agentService.dashboard(dateParams),
    refetchInterval: 30_000,
  });

  const breakStartMutation = useMutation({
    mutationFn: () => agentService.breakStart(),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['agent-dashboard'] }); toast.success('Break started'); },
  });

  const breakEndMutation = useMutation({
    mutationFn: () => agentService.breakEnd(),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['agent-dashboard'] });
      toast.success(`Break ended — ${res.data.data.durationMins} min`);
    },
  });

  const stats = dashData?.data?.data?.stats;
  const recentCalls: RecentCall[] = dashData?.data?.data?.recentCalls || [];
  const upcomingReminders: ReminderItem[] = dashData?.data?.data?.followUpsToday || [];
  const tagStats: TagStatItem[] = dashData?.data?.data?.tagStats || [];
  const followUpStatusBreakdownRaw: FollowUpStatusBreakdownItem[] = dashData?.data?.data?.followUpStatusBreakdown || [];
  const followUpStatusBreakdown = FOLLOW_UP_STATUS_ORDER
    .map((status) => {
      const matchingEntry = followUpStatusBreakdownRaw.find((entry) => entry.status === status);
      if (!matchingEntry || matchingEntry.count <= 0) return null;

      return {
        status,
        label: FOLLOW_UP_STATUS_META[status]?.label || status.replace(/_/g, ' '),
        count: matchingEntry.count,
        colour: FOLLOW_UP_STATUS_META[status]?.colour || '#94a3b8',
      };
    })
    .filter((entry): entry is { status: string; label: string; count: number; colour: string } => Boolean(entry));
  const followUpStatusChartData = {
    labels: followUpStatusBreakdown.map((entry) => entry.label),
    datasets: [
      {
        data: followUpStatusBreakdown.map((entry) => entry.count),
        backgroundColor: followUpStatusBreakdown.map((entry) => entry.colour),
        borderColor: '#ffffff',
        borderWidth: 4,
        hoverOffset: 6,
      },
    ],
  };
  const followUpStatusChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '62%',
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (context: { label: string; parsed: number }) => `${context.label}: ${context.parsed}`,
        },
      },
    },
  };
  const callResultChartData = {
    labels: tagStats.map((entry) => entry.tag),
    datasets: [
      {
        label: 'Calls',
        data: tagStats.map((entry) => entry.count),
        backgroundColor: tagStats.map((_, index) => CALL_RESULT_COLOURS[index % CALL_RESULT_COLOURS.length] + 'cc'),
        borderColor: tagStats.map((_, index) => CALL_RESULT_COLOURS[index % CALL_RESULT_COLOURS.length]),
        borderWidth: 1,
        borderRadius: 10,
        maxBarThickness: 42,
      },
    ],
  };
  const callResultChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (context: { parsed: { y: number } }) => `Calls: ${context.parsed.y}`,
        },
      },
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { color: '#64748b', font: { size: 11 } },
      },
      y: {
        beginAtZero: true,
        grid: { color: 'rgba(148, 163, 184, 0.16)' },
        ticks: {
          precision: 0,
          color: '#64748b',
          font: { size: 11 },
        },
      },
    },
  };

  if (isMobile) {
    return (
      <AppLayout>
        <div className="agent-mobile-stack">
          <section className="agent-mobile-summary-card">
            <div>
              <div className="section-eyebrow">{rangeLabel} summary</div>
              <h1 className="agent-mobile-section-title">Dashboard</h1>
              <p className="page-subtitle" style={{ marginTop: 6 }}>
                {stats?.isOnBreak
                  ? <span style={{ color: '#f59e0b' }}>On Break - <BreakTimer startedAt={stats.breakStartedAt} /></span>
                  : <span style={{ color: '#22c55e' }}>Your activity for {rangeLabel.toLowerCase()}</span>}
              </p>
            </div>

            <DateRangeFilter value={dateRange} onChange={setDateRange} />

            <div className="agent-mobile-stats-grid">
              {[
                { label: 'Unique Calls', value: stats?.uniqueCalls || 0 },
                { label: 'Total Calls', value: stats?.callsToday || 0 },
                { label: 'Talk Time', value: formatTalkTime(stats?.talkTimeSeconds) },
                { label: 'Break', value: `${stats?.breakMinutesToday || 0}m` },
              ].map(({ label, value }) => (
                <div key={label} className="agent-mobile-stat-tile">
                  <div className="agent-mobile-stat-value">{value}</div>
                  <div className="agent-mobile-stat-label">{label}</div>
                </div>
              ))}
            </div>

            <div className="agent-mobile-inline-actions">
              {stats?.isOnBreak ? (
                <button className="btn btn-primary" onClick={() => breakEndMutation.mutate()}>
                  <Coffee size={16} /> End Break
                </button>
              ) : (
                <button className="btn btn-secondary" onClick={() => breakStartMutation.mutate()}>
                  <Coffee size={16} /> Take Break
                </button>
              )}
              <button className="btn btn-secondary" onClick={() => void refetchDash()}>
                <RefreshCw size={14} /> Refresh
              </button>
            </div>
          </section>

          <section className="card card--mobile">
            <div className="card-header card-header--dense">
              <div>
                <div className="card-kicker">Recent calls</div>
                <h2 className="card-title">Activity</h2>
              </div>
            </div>
            {recentCalls.length === 0 ? (
              <div className="empty-state"><RefreshCw size={24} style={{ opacity: 0.4 }} /><p>No recent activity</p></div>
            ) : (
              <div className="agent-mobile-list">
                {recentCalls.slice(0, 4).map((rc) => (
                  <div key={rc.id} className="agent-mobile-list-row">
                    <div>
                      <div className="agent-mobile-list-title">{rc.lead.name || 'Unknown'}</div>
                      <div className="agent-mobile-list-subtitle">{rc.dispositionTag} · {new Date(rc.calledAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="card card--mobile">
            <div className="card-header card-header--dense">
              <div>
                <div className="card-kicker">Reminder desk</div>
                <h2 className="card-title">Upcoming Reminder</h2>
              </div>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{rangeLabel} pending reminders</p>
            </div>
            {upcomingReminders.length === 0 ? (
              <div className="empty-state"><p>No reminders in this range.</p></div>
            ) : (
              <div className="agent-mobile-list">
                {upcomingReminders.slice(0, 4).map((reminder) => {
                  const scheduledAt = new Date(reminder.scheduledAt);
                  const isOverdue = scheduledAt.getTime() <= Date.now();

                  return (
                    <div key={reminder.id} className="agent-mobile-list-row">
                      <div>
                        <div className="agent-mobile-list-title">{reminder.lead.name || 'Unknown'}</div>
                        <div className="agent-mobile-list-subtitle">{reminder.lead.phoneMasked}</div>
                        {reminder.notes ? (
                          <div className="agent-mobile-list-subtitle" style={{ marginTop: 4 }}>{reminder.notes}</div>
                        ) : null}
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{ fontSize: '0.8rem', fontWeight: 600, color: isOverdue ? '#ef4444' : 'var(--text-primary)' }}>
                          {scheduledAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                        <div className="agent-mobile-list-subtitle" style={{ color: isOverdue ? '#ef4444' : 'var(--text-muted)' }}>
                          {isOverdue ? 'Overdue' : scheduledAt.toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <section className="card card--mobile">
            <div className="card-header card-header--dense">
              <div>
                <div className="card-kicker">Queue health</div>
                <h2 className="card-title">Follow-up Status</h2>
              </div>
            </div>
            {followUpStatusBreakdown.length === 0 ? (
              <div className="empty-state"><p>No follow-up status data yet.</p></div>
            ) : (
              <div style={{ display: 'grid', gap: 18 }}>
                <div style={{ height: 220, padding: '0 8px' }}>
                  <Doughnut data={followUpStatusChartData} options={followUpStatusChartOptions as never} />
                </div>
                <div style={{ display: 'grid', gap: 10 }}>
                  {followUpStatusBreakdown.map((entry) => (
                    <div key={entry.status} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                        <span style={{ width: 10, height: 10, borderRadius: '50%', background: entry.colour, flexShrink: 0 }} />
                        <span style={{ fontSize: '0.85rem', color: 'var(--text-primary)' }}>{entry.label}</span>
                      </div>
                      <strong style={{ fontSize: '0.9rem', color: 'var(--text-primary)' }}>{entry.count}</strong>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>

          <section className="card card--mobile">
            <div className="card-header card-header--dense">
              <div>
                <div className="card-kicker">Call outcomes</div>
                <h2 className="card-title">Call Result</h2>
              </div>
            </div>
            {tagStats.length === 0 ? (
              <div className="empty-state"><p>No call result data in this range.</p></div>
            ) : (
              <div style={{ display: 'grid', gap: 18 }}>
                <div style={{ height: 240 }}>
                  <Bar data={callResultChartData} options={callResultChartOptions as never} />
                </div>
                <div style={{ display: 'grid', gap: 10 }}>
                  {tagStats.map((entry, index) => (
                    <button
                      key={entry.tag}
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => setSelectedTagForList(entry.tag)}
                      style={{ justifyContent: 'space-between', paddingInline: 14 }}
                    >
                      <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ width: 10, height: 10, borderRadius: '50%', background: CALL_RESULT_COLOURS[index % CALL_RESULT_COLOURS.length], flexShrink: 0 }} />
                        <span>{entry.tag}</span>
                      </span>
                      <strong>{entry.count}</strong>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </section>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="page-container">
        <section className="dashboard-hero">
          <div>
            <p className="section-eyebrow">Agent command desk</p>
            <h1 className="page-title">Agent Dashboard</h1>
            <p className="page-subtitle">
              {stats?.isOnBreak
                ? <span style={{ color: '#f59e0b' }}>On Break — <BreakTimer startedAt={stats.breakStartedAt} /></span>
                : <span style={{ color: '#22c55e' }}>Summary of your activity for {rangeLabel.toLowerCase()}</span>
              }
            </p>
          </div>

          <div className="page-actions">
            <DateRangeFilter value={dateRange} onChange={setDateRange} />
            {stats?.isOnBreak
              ? <button className="btn btn-primary" onClick={() => breakEndMutation.mutate()}>
                  <Coffee size={16} /> End Break
                </button>
              : <button className="btn btn-secondary" onClick={() => breakStartMutation.mutate()}>
                  <Coffee size={16} /> Take Break
                </button>
            }
            <button className="btn btn-secondary" onClick={() => void refetchDash()}>
              <RefreshCw size={14} /> Refresh desk
            </button>
          </div>

          <div className="metric-ribbon">
            <div className="metric-ribbon__item">
              <span className="metric-ribbon__label">My leads</span>
              <strong className="metric-ribbon__value">{stats?.totalLeads || 0}</strong>
              <span className="metric-ribbon__sub">assigned to your queue</span>
            </div>
            <div className="metric-ribbon__item">
              <span className="metric-ribbon__label">New Leads</span>
              <strong className="metric-ribbon__value">{stats?.newLeads || 0}</strong>
              <span className="metric-ribbon__sub">not yet contacted</span>
            </div>
            <div className="metric-ribbon__item">
              <span className="metric-ribbon__label">Total Calls</span>
              <strong className="metric-ribbon__value">{stats?.callsToday || 0}</strong>
              <span className="metric-ribbon__sub">logged in the selected range</span>
            </div>
            <div className="metric-ribbon__item">
              <span className="metric-ribbon__label">Break time</span>
              <strong className="metric-ribbon__value">{stats?.breakMinutesToday || 0}m</strong>
              <span className="metric-ribbon__sub">used in the selected range</span>
            </div>
          </div>
        </section>

        <div className="stats-grid">
          {[
            { label: 'Unique Calls', value: stats?.uniqueCalls || 0, icon: <Phone size={20} />, colour: '#6366f1' },
            { label: 'Total Calls', value: stats?.callsToday || 0, icon: <PhoneCall size={20} />, colour: '#22c55e' },
            { label: 'Talk Time', value: formatTalkTime(stats?.talkTimeSeconds), icon: <Clock size={20} />, colour: '#14b8a6' },
            { label: 'Break Mins', value: `${stats?.breakMinutesToday || 0}m`, icon: <Clock size={20} />, colour: '#22d3ee' },
          ].map(({ label, value, icon, colour }) => (
            <div key={label} className="stat-card" style={{ '--card-accent': colour } as React.CSSProperties}>
              <div className="stat-card__icon" style={{ background: colour + '22', color: colour }}>{icon}</div>
              <div className="stat-card__body">
                <div className="stat-card__value">{value}</div>
                <div className="stat-card__label">{label}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="dashboard-grid dashboard-grid--agent">
          <div className="dashboard-stack">
            <div className="card">
              <div className="card-header card-header--dense">
                <div>
                  <div className="card-kicker">Queue health</div>
                  <h2 className="card-title">Follow-up Status</h2>
                </div>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Current assigned queue mix</p>
              </div>
              {followUpStatusBreakdown.length === 0 ? (
                <div className="empty-state"><p>No follow-up status data yet.</p></div>
              ) : (
                <div className="card-body" style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 280px) minmax(0, 1fr)', gap: 24, alignItems: 'center' }}>
                  <div style={{ height: 260 }}>
                    <Doughnut data={followUpStatusChartData} options={followUpStatusChartOptions as never} />
                  </div>
                  <div style={{ display: 'grid', gap: 12 }}>
                    {followUpStatusBreakdown.map((entry) => (
                      <div key={entry.status} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '12px 14px', borderRadius: 16, background: `${entry.colour}14` }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <span style={{ width: 12, height: 12, borderRadius: '50%', background: entry.colour, flexShrink: 0 }} />
                          <div>
                            <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)' }}>{entry.label}</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Assigned leads in this status</div>
                          </div>
                        </div>
                        <strong style={{ fontSize: '1rem', color: 'var(--text-primary)' }}>{entry.count}</strong>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="card">
              <div className="card-header card-header--dense">
                <div>
                  <div className="card-kicker">Call outcomes</div>
                  <h2 className="card-title">Call Result</h2>
                </div>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Selected range result mix</p>
              </div>
              {tagStats.length === 0 ? (
                <div className="empty-state"><p>No call result data in this range.</p></div>
              ) : (
                <div className="card-body" style={{ display: 'grid', gap: 18 }}>
                  <div style={{ height: 280 }}>
                    <Bar data={callResultChartData} options={callResultChartOptions as never} />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
                    {tagStats.map((entry, index) => (
                      <button
                        key={entry.tag}
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => setSelectedTagForList(entry.tag)}
                        style={{ justifyContent: 'space-between', paddingInline: 14 }}
                      >
                        <span style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                          <span style={{ width: 10, height: 10, borderRadius: '50%', background: CALL_RESULT_COLOURS[index % CALL_RESULT_COLOURS.length], flexShrink: 0 }} />
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.tag}</span>
                        </span>
                        <strong>{entry.count}</strong>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="dashboard-stack">
            <div className="card">
              <div className="card-header card-header--dense">
                <div>
                  <div className="card-kicker">Reminder desk</div>
                  <h2 className="card-title">Upcoming Reminder</h2>
                </div>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{rangeLabel} pending reminders</p>
              </div>
              {upcomingReminders.length === 0 ? (
                <div className="empty-state"><p>No reminders in this range.</p></div>
              ) : (
                upcomingReminders.slice(0, 6).map((reminder) => {
                  const scheduledAt = new Date(reminder.scheduledAt);
                  const isOverdue = scheduledAt.getTime() <= Date.now();

                  return (
                    <div key={reminder.id} className="followup-row">
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--text-primary)' }}>{reminder.lead.name || 'Unknown'}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{reminder.lead.phoneMasked}</div>
                        {reminder.notes ? (
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{reminder.notes}</div>
                        ) : null}
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{ fontSize: '0.8rem', fontWeight: 600, color: isOverdue ? '#ef4444' : 'var(--text-primary)' }}>
                          {scheduledAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                        <div style={{ fontSize: '0.72rem', color: isOverdue ? '#ef4444' : 'var(--text-muted)' }}>
                          {isOverdue ? 'Overdue' : scheduledAt.toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Disposition Detail Modal */}
        {selectedTagForList && (
          <DispositionLeadsModal
            tag={selectedTagForList}
            from={dateRange.from}
            to={dateRange.to}
            onClose={() => setSelectedTagForList(null)}
          />
        )}
      </div>
    </AppLayout>
  );
}
