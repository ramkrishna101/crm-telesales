import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { usersService, campaignsService, leadsService, callsService } from '../../services/crm.service';
import AppLayout from '../../components/layout/AppLayout';
import DateRangeFilter, { computeRange, type DateRangeValue } from '../../components/ui/DateRangeFilter';
import { Users, FolderOpen, Phone, TrendingUp, UserCheck, Clock, AlertCircle, ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';

// ── Stat Card ─────────────────────────────────────────────────────────

function StatCard({
  icon, label, value, sub, colour, trend,
}: {
  icon: React.ReactNode; label: string; value: string | number;
  sub?: string; colour: string; trend?: number;
}) {
  return (
    <div className="stat-card" style={{ '--card-accent': colour } as React.CSSProperties}>
      <div className="stat-card__icon" style={{ background: colour + '22', color: colour }}>
        {icon}
      </div>
      <div className="stat-card__body">
        <div className="stat-card__value">{value}</div>
        <div className="stat-card__label">{label}</div>
        {sub && <div className="stat-card__sub">{sub}</div>}
      </div>
      {trend !== undefined && (
        <div className={`stat-card__trend ${trend >= 0 ? 'stat-card__trend--up' : 'stat-card__trend--down'}`}>
          {trend >= 0 ? '▲' : '▼'} {Math.abs(trend)}%
        </div>
      )}
    </div>
  );
}

// ── Campaign Row ──────────────────────────────────────────────────────

function CampaignRow({ c }: { c: Record<string, unknown> }) {
  const statusColour: Record<string, string> = {
    active: '#22c55e', paused: '#f59e0b', closed: '#94a3b8',
  };
  return (
    <div className="table-row">
      <div className="table-cell" style={{ flex: 2 }}>
        <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{c.name as string}</div>
        <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>{(c.team as Record<string, string> | null)?.name || 'No team'}</div>
      </div>
      <div className="table-cell">
        <span className="badge" style={{ background: statusColour[c.status as string] + '22', color: statusColour[c.status as string] }}>
          {c.status as string}
        </span>
      </div>
      <div className="table-cell">{(c._count as Record<string, number>)?.leads?.toLocaleString()}</div>
      <div className="table-cell">
        <span className="badge" style={{ background: c.priority === 'high' ? '#fff0f0' : '#f3f4f8', color: c.priority === 'high' ? '#dc2626' : '#6b7280' }}>
          {c.priority as string}
        </span>
      </div>
      <div className="table-cell">
        <Link to={`/admin/campaigns/${c.id as string}`} className="btn-icon">
          <ChevronRight size={16} />
        </Link>
      </div>
    </div>
  );
}

// ── Agent Row ─────────────────────────────────────────────────────────

function AgentRow({ u }: { u: Record<string, unknown> }) {
  const statusColour = u.status === 'active' ? '#22c55e' : '#94a3b8';
  return (
    <div className="table-row">
      <div className="table-cell" style={{ flex: 2, display: 'flex', gap: 10, alignItems: 'center' }}>
        <div className="avatar avatar--sm">{(u.name as string).charAt(0)}</div>
        <div>
          <div style={{ fontWeight: 500 }}>{u.name as string}</div>
          <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>{u.email as string}</div>
        </div>
      </div>
      <div className="table-cell">
        <span className="badge" style={{ background: statusColour + '22', color: statusColour }}>
          {u.status as string}
        </span>
      </div>
      <div className="table-cell" style={{ color: 'var(--text-secondary)' }}>
        {(u.team as Record<string, string> | null)?.name || '—'}
      </div>
    </div>
  );
}

// ── Admin Dashboard ───────────────────────────────────────────────────

export default function AdminDashboard() {
  // Date range filter — defaults to last 7 days to match prior behaviour.
  const [dateRange, setDateRange] = useState<DateRangeValue>(() => {
    const r = computeRange('last_7_days');
    return { preset: 'last_7_days', from: r.from, to: r.to };
  });
  const [campaignFilter, setCampaignFilter] = useState('');
  const dateParams = { from: dateRange.from, to: dateRange.to };
  const dashboardParams = {
    ...dateParams,
    ...(campaignFilter ? { campaignId: campaignFilter } : {}),
  };
  const rangeLabel =
    dateRange.preset === 'today' ? 'Today' :
    dateRange.preset === 'yesterday' ? 'Yesterday' :
    dateRange.preset === 'this_month' ? 'This month' :
    dateRange.preset === 'last_7_days' ? 'Last 7 days' :
    `${dateRange.from} → ${dateRange.to}`;

  const { data: usersData } = useQuery({
    queryKey: ['users', 'all'],
    queryFn: () => usersService.list({ limit: 100 }),
  });

  const { data: campaignsData } = useQuery({
    queryKey: ['campaigns', 'all'],
    queryFn: () => campaignsService.list({ limit: 100 }),
  });

  const { data: leadsData } = useQuery({
    queryKey: ['leads', 'dashboard', dateRange.from, dateRange.to, campaignFilter],
    queryFn: () => leadsService.list({ limit: 1, ...dashboardParams }),
  });

  const { data: callsSummary } = useQuery({
    queryKey: ['calls', 'summary', dateRange.from, dateRange.to, campaignFilter],
    queryFn: () => callsService.summary(dashboardParams),
  });

  const users = (usersData?.data?.data?.users || []) as Record<string, unknown>[];
  const campaigns = (campaignsData?.data?.data?.campaigns || []) as Record<string, unknown>[];
  const selectedCampaign = campaigns.find((c) => (c.id as string) === campaignFilter) || null;
  const campaignScope = selectedCampaign ? [selectedCampaign] : campaigns;
  const totalLeads = (leadsData?.data?.data?.total as number) || 0;
  const callData = callsSummary?.data?.data;
  const agents = users.filter((u) => u.role === 'agent');
  const activeCampaigns = campaignScope.filter((c) => c.status === 'active').length;
  const totalCalls = callData?.dailyTotals?.reduce((s: number, d: { count: number }) => s + d.count, 0) || 0;
  const connectedCalls = callData?.agentLeaderboard?.reduce((sum: number, agent: { connected: number }) => sum + agent.connected, 0) || 0;
  const callbackCount = callData?.tagBreakdown?.find((tag: { tag: string }) => tag.tag === 'Callback')?.count || 0;
  const connectRate = totalCalls ? Math.round((connectedCalls / totalCalls) * 100) : 0;
  const scopeLabel = selectedCampaign ? `${selectedCampaign.name as string} in ${rangeLabel.toLowerCase()}` : rangeLabel.toLowerCase();

  return (
    <AppLayout>
      <div className="page-container">
        <section className="dashboard-hero">
          <div>
            <p className="section-eyebrow">Operations overview</p>
            <h1 className="page-title">Admin Dashboard</h1>
            <p className="page-subtitle">Platform-wide throughput across users, campaigns, leads, and call outcomes.</p>
          </div>

          <div className="page-actions">
            <DateRangeFilter value={dateRange} onChange={setDateRange} />
            <select
              className="form-input"
              value={campaignFilter}
              onChange={(e) => setCampaignFilter(e.target.value)}
              style={{ minWidth: 220, height: 38 }}
            >
              <option value="">All Campaigns</option>
              {campaigns.map((campaign) => (
                <option key={campaign.id as string} value={campaign.id as string}>
                  {campaign.name as string}
                </option>
              ))}
            </select>
            <div className="ops-pill">
              {selectedCampaign ? `${selectedCampaign.name as string}` : `${activeCampaigns} live campaigns`}
            </div>
            <Link to="/admin/campaigns" className="btn btn-primary">
              + New Campaign
            </Link>
          </div>

          <div className="metric-ribbon">
            <div className="metric-ribbon__item">
              <span className="metric-ribbon__label">Active agents</span>
              <strong className="metric-ribbon__value">{agents.filter((u) => u.status === 'active').length}</strong>
              <span className="metric-ribbon__sub">currently dialing or available</span>
            </div>
            <div className="metric-ribbon__item">
              <span className="metric-ribbon__label">{rangeLabel} connect rate</span>
              <strong className="metric-ribbon__value">{connectRate}%</strong>
              <span className="metric-ribbon__sub">connected vs total calls</span>
            </div>
            <div className="metric-ribbon__item">
              <span className="metric-ribbon__label">Callbacks requested</span>
              <strong className="metric-ribbon__value">{callbackCount}</strong>
              <span className="metric-ribbon__sub">follow-up pressure to watch</span>
            </div>
            <div className="metric-ribbon__item">
              <span className="metric-ribbon__label">Lead inventory</span>
              <strong className="metric-ribbon__value">{totalLeads.toLocaleString()}</strong>
              <span className="metric-ribbon__sub">created in {scopeLabel}</span>
            </div>
          </div>
        </section>

        <div className="stats-grid">
          <StatCard
            icon={<Users size={22} />} label="Total Users"
            value={users.length} sub={`${agents.length} active agents`}
            colour="#6366f1" trend={12}
          />
          <StatCard
            icon={<FolderOpen size={22} />} label="Campaigns"
            value={selectedCampaign ? 1 : campaigns.length} sub={selectedCampaign ? 'selected campaign' : `${activeCampaigns} active`}
            colour="#22d3ee"
          />
          <StatCard
            icon={<UserCheck size={22} />} label="New Leads"
            value={totalLeads.toLocaleString()} sub={`created in ${scopeLabel}`}
            colour="#22c55e" trend={8}
          />
          <StatCard
            icon={<Phone size={22} />} label={`Calls (${rangeLabel.toLowerCase()})`}
            value={totalCalls.toLocaleString()} sub={selectedCampaign ? 'total calls for selected campaign' : 'total connected'}
            colour="#f59e0b"
          />
        </div>

        <div className="dashboard-grid">
          <div className="dashboard-stack">
            <div className="card">
              <div className="card-header card-header--dense">
                <div>
                  <div className="card-kicker">Call health</div>
                  <h2 className="card-title">Disposition Breakdown</h2>
                </div>
                <span className="card-subtitle">{rangeLabel}</span>
              </div>
              <div className="card-body">
                {callData?.tagBreakdown?.length ? (
                  callData.tagBreakdown.map((t: { tag: string; count: number }) => (
                    <div key={t.tag} className="disposition-row">
                      <span className="disposition-tag">{t.tag}</span>
                      <div className="disposition-bar-wrap">
                        <div
                          className="disposition-bar"
                          style={{ width: `${Math.min(100, (t.count / (totalCalls || 1)) * 100)}%` }}
                        />
                      </div>
                      <span className="disposition-count">{t.count}</span>
                    </div>
                  ))
                ) : (
                  <div className="empty-state">
                    <AlertCircle size={32} />
                    <p>No calls logged yet</p>
                  </div>
                )}
              </div>
            </div>

            <div className="card">
              <div className="card-header card-header--dense">
                <div>
                  <div className="card-kicker">Execution</div>
                  <h2 className="card-title">Campaign Pipeline</h2>
                </div>
                <Link to="/admin/campaigns" className="card-link">View all →</Link>
              </div>
              <div className="table-header">
                <div className="table-col" style={{ flex: 2 }}>Campaign</div>
                <div className="table-col">Status</div>
                <div className="table-col">Leads</div>
                <div className="table-col">Priority</div>
                <div className="table-col"></div>
              </div>
              {campaigns.map((c) => <CampaignRow key={c.id as string} c={c} />)}
              {campaigns.length === 0 && (
                <div className="empty-state">
                  <FolderOpen size={32} />
                  <p>No campaigns yet. <Link to="/admin/campaigns" style={{ color: 'var(--accent)' }}>Create one →</Link></p>
                </div>
              )}
            </div>
          </div>

          <div className="dashboard-stack">
            <div className="card">
              <div className="card-header card-header--dense">
                <div>
                  <div className="card-kicker">Coverage</div>
                  <h2 className="card-title">Agent Status</h2>
                </div>
                <Link to="/admin/users" className="card-link">View all →</Link>
              </div>
              <div className="table-header">
                <div className="table-col" style={{ flex: 2 }}>Agent</div>
                <div className="table-col">Status</div>
                <div className="table-col">Team</div>
              </div>
              {agents.slice(0, 8).map((u) => (
                <AgentRow key={u.id as string} u={u} />
              ))}
              {agents.length === 0 && (
                <div className="empty-state"><AlertCircle size={24} /><p>No agents found</p></div>
              )}
            </div>

            <div className="card">
              <div className="card-header card-header--dense">
                <div>
                  <div className="card-kicker">Watchlist</div>
                  <h2 className="card-title">Operations Signals</h2>
                </div>
              </div>
              <div className="card-body signal-list">
                <div className="signal-row">
                  <div className="signal-row__icon signal-row__icon--blue"><TrendingUp size={16} /></div>
                  <div className="signal-row__body">
                    <div className="signal-row__label">Connect performance</div>
                    <div className="signal-row__value">{connectRate}% of calls connected in the last 7 days.</div>
                  </div>
                </div>
                <div className="signal-row">
                  <div className="signal-row__icon signal-row__icon--amber"><Clock size={16} /></div>
                  <div className="signal-row__body">
                    <div className="signal-row__label">Callback queue</div>
                    <div className="signal-row__value">{callbackCount} leads requested another touchpoint.</div>
                  </div>
                </div>
                <div className="signal-row">
                  <div className="signal-row__icon signal-row__icon--green"><UserCheck size={16} /></div>
                  <div className="signal-row__body">
                    <div className="signal-row__label">Staffing</div>
                    <div className="signal-row__value">{agents.length} agents mapped across {users.filter((u) => u.role === 'supervisor').length} supervisors.</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
