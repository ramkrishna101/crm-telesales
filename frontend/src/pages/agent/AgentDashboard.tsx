import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { agentService, callsService, followUpsService } from '../../services/crm.service';
import AppLayout from '../../components/layout/AppLayout';
import { useIsMobile } from '../../hooks/useIsMobile';
import DateRangeFilter, { computeRange, type DateRangeValue } from '../../components/ui/DateRangeFilter';
import toast from 'react-hot-toast';
import {
  Phone, Coffee, Clock, CheckCircle,
  RefreshCw, Calendar, AlertCircle, PhoneCall
} from 'lucide-react';

interface Lead {
  id: string; name: string | null; phoneMasked: string; email: string | null;
  status: string; priority: string; isDnd: boolean;
  campaign?: { id: string; name: string; script?: string | null };
}
interface FollowUp {
  id: string; leadId: string; scheduledAt: string; status: string; notes?: string;
  lead: Lead;
}
interface RecentCall {
  id: string; leadId: string; calledAt: string; dispositionTag: string;
  lead: Lead;
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

  const followUpDoneMutation = useMutation({
    mutationFn: (id: string) => followUpsService.update(id, { status: 'done' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['agent-dashboard'] }); toast.success('Follow-up done'); },
  });

  const stats = dashData?.data?.data?.stats;
  const followUps: FollowUp[] = dashData?.data?.data?.followUpsToday || [];
  const recentCalls: RecentCall[] = dashData?.data?.data?.recentCalls || [];

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
                { label: 'My Leads', value: stats?.totalLeads || 0 },
                { label: 'Pending', value: stats?.pendingLeads || 0 },
                { label: rangeLabel === 'Today' ? 'Calls' : `${rangeLabel} Calls`, value: stats?.callsToday || 0 },
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
                <div className="card-kicker">{rangeLabel}</div>
                <h2 className="card-title">Follow-ups</h2>
              </div>
              <span className="badge" style={{ background: '#1e293b', color: '#a78bfa' }}>{followUps.length} pending</span>
            </div>
            {followUps.length === 0 ? (
              <div className="empty-state"><Calendar size={24} style={{ opacity: 0.4 }} /><p>No follow-ups scheduled</p></div>
            ) : (
              <div className="agent-mobile-list">
                {followUps.slice(0, 4).map((fu) => {
                  const isOverdue = new Date(fu.scheduledAt) <= new Date();
                  return (
                    <div key={fu.id} className="agent-mobile-list-row">
                      <div>
                        <div className="agent-mobile-list-title">{fu.lead.name || 'Unknown'}</div>
                        <div className="agent-mobile-list-subtitle" style={{ color: isOverdue ? '#ef4444' : 'var(--text-muted)' }}>
                          {isOverdue ? 'Overdue' : 'Scheduled'} · {new Date(fu.scheduledAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                      <div className="agent-mobile-row-actions">
                        <button className="btn-icon" onClick={() => followUpDoneMutation.mutate(fu.id)}>
                          <CheckCircle size={15} style={{ color: '#22c55e' }} />
                        </button>
                      </div>
                    </div>
                  );
                })}
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
              <span className="metric-ribbon__label">Pending</span>
              <strong className="metric-ribbon__value">{stats?.pendingLeads || 0}</strong>
              <span className="metric-ribbon__sub">not yet contacted</span>
            </div>
            <div className="metric-ribbon__item">
              <span className="metric-ribbon__label">{rangeLabel} calls</span>
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
            { label: 'My Leads', value: stats?.totalLeads || 0, icon: <Phone size={20} />, colour: '#6366f1' },
            { label: 'Pending', value: stats?.pendingLeads || 0, icon: <AlertCircle size={20} />, colour: '#f59e0b' },
            { label: `${rangeLabel} Calls`, value: stats?.callsToday || 0, icon: <PhoneCall size={20} />, colour: '#22c55e' },
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
                  <div className="card-kicker">Call feed</div>
                  <h2 className="card-title">Recent Activity</h2>
                </div>
              </div>
              {recentCalls.length === 0 ? (
                <div className="empty-state"><RefreshCw size={28} style={{ opacity: 0.4 }} /><p>No recent activity</p></div>
              ) : (
                recentCalls.map((rc) => (
                  <div key={rc.id} className="followup-row">
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--text-primary)' }}>{rc.lead.name || 'Unknown'}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        {rc.dispositionTag} · {new Date(rc.calledAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="card">
              <div className="card-header card-header--dense">
                <div>
                  <div className="card-kicker">Callback queue</div>
                  <h2 className="card-title">{rangeLabel} Follow-ups</h2>
                </div>
                <span className="badge" style={{ background: '#1e293b', color: '#a78bfa' }}>
                  {followUps.length} pending
                </span>
              </div>
              {followUps.length === 0 ? (
                <div className="empty-state"><Calendar size={28} style={{ opacity: 0.4 }} /><p>No follow-ups scheduled</p></div>
              ) : (
                followUps.map((fu) => {
                  const isOverdue = new Date(fu.scheduledAt) <= new Date();
                  return (
                    <div key={fu.id} className="followup-row">
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--text-primary)' }}>{fu.lead.name || 'Unknown'}</div>
                        <div style={{ fontSize: '0.75rem', color: isOverdue ? '#ef4444' : 'var(--text-muted)' }}>
                          {isOverdue ? '⚠ Overdue — ' : '⏰ '}
                          {new Date(fu.scheduledAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button className="btn-icon" title="Mark done" onClick={() => followUpDoneMutation.mutate(fu.id)}>
                          <CheckCircle size={15} style={{ color: '#22c55e' }} />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Range Tag Stats */}
        {dashData?.data?.data?.tagStats?.length > 0 && (
          <div className="card">
            <div className="card-header card-header--dense">
              <div>
                <div className="card-kicker">Outcome mix</div>
                <h2 className="card-title">{rangeLabel} Dispositions</h2>
              </div>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Click a row to inspect leads</p>
            </div>
            <div className="card-body">
              {(dashData?.data?.data?.tagStats as { tag: string; count: number }[] || []).map((t) => (
                <div
                  key={t.tag}
                  className="disposition-row clickable-row"
                  onClick={() => setSelectedTagForList(t.tag)}
                  style={{ cursor: 'pointer' }}
                >
                  <span className="disposition-tag">{t.tag}</span>
                  <div className="disposition-bar-wrap">
                    <div className="disposition-bar" style={{ width: `${Math.min(100, (t.count / (stats?.callsToday || 1)) * 100)}%` }} />
                  </div>
                  <span className="disposition-count">{t.count}</span>
                </div>
              ))}
            </div>
          </div>
        )}

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
