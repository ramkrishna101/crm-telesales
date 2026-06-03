import { useState } from 'react';
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
  type Plugin,
} from 'chart.js';
import { Pie } from 'react-chartjs-2';
import { useQuery } from '@tanstack/react-query';
import { usersService, campaignsService, leadsService, callsService } from '../../services/crm.service';
import AppLayout from '../../components/layout/AppLayout';
import DateRangeFilter, { computeRange, type DateRangeValue } from '../../components/ui/DateRangeFilter';
import Dropdown from '../../components/ui/Dropdown';
import { Users, FolderOpen, Phone, TrendingUp, UserCheck, Clock, AlertCircle, ChevronRight, Languages } from 'lucide-react';
import { Link } from 'react-router-dom';

ChartJS.register(ArcElement, Tooltip, Legend);

const LANGUAGE_CHART_COLOURS = [
  '#5f6bff',
  '#22c55e',
  '#f59e0b',
  '#22d3ee',
  '#ef4444',
  '#8b5cf6',
  '#ec4899',
  '#14b8a6',
  '#f97316',
  '#84cc16',
];

const languagePercentagePlugin: Plugin<'pie'> = {
  id: 'languagePercentagePlugin',
  afterDatasetsDraw(chart) {
    const dataset = chart.data.datasets[0];
    const values = (dataset?.data || []).map((value) => Number(value) || 0);
    const total = values.reduce((sum, value) => sum + value, 0);
    if (!total) return;

    const { ctx } = chart;
    const meta = chart.getDatasetMeta(0);
    const arcs = meta.data as ArcElement[];

    ctx.save();
    ctx.font = '600 12px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    arcs.forEach((arc, index) => {
      const value = values[index];
      if (!value) return;

      const percentage = Math.round((value / total) * 100);
      if (percentage < 8) return;

      const angle = arc.circumference;
      if (!angle || angle < 0.3) return;

      const radius = arc.innerRadius + (arc.outerRadius - arc.innerRadius) * 0.62;
      const x = arc.x + Math.cos(arc.startAngle + angle / 2) * radius;
      const y = arc.y + Math.sin(arc.startAngle + angle / 2) * radius;

      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = 'rgba(15, 23, 42, 0.18)';
      ctx.lineWidth = 3;
      ctx.strokeText(`${percentage}%`, x, y);
      ctx.fillText(`${percentage}%`, x, y);
    });

    ctx.restore();
  },
};

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
  // Date range filter — defaults to today for the shared dashboard behaviour.
  const [dateRange, setDateRange] = useState<DateRangeValue>(() => {
    const r = computeRange('today');
    return { preset: 'today', from: r.from, to: r.to };
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

  const totalLeads = (leadsData?.data?.data?.total as number) || 0;

  const { data: languageLeadsData } = useQuery({
    queryKey: ['leads', 'dashboard', 'languages', dateRange.from, dateRange.to, campaignFilter, totalLeads],
    queryFn: () => leadsService.list({ limit: Math.max(totalLeads, 1), ...dashboardParams }),
    enabled: totalLeads > 0,
  });

  const { data: callsSummary } = useQuery({
    queryKey: ['calls', 'summary', dateRange.from, dateRange.to, campaignFilter],
    queryFn: () => callsService.summary(dashboardParams),
  });

  const users = (usersData?.data?.data?.users || []) as Record<string, unknown>[];
  const campaigns = (campaignsData?.data?.data?.campaigns || []) as Record<string, unknown>[];
  const selectedCampaign = campaigns.find((c) => (c.id as string) === campaignFilter) || null;
  const campaignScope = selectedCampaign ? [selectedCampaign] : campaigns;
  const callData = callsSummary?.data?.data;
  const languageLeads = (languageLeadsData?.data?.data?.leads || []) as Array<{ lastCallLanguage?: string | null }>;
  const agents = users.filter((u) => u.role === 'agent');
  const activeCampaigns = campaignScope.filter((c) => c.status === 'active').length;
  const totalCalls = callData?.dailyTotals?.reduce((s: number, d: { count: number }) => s + d.count, 0) || 0;
  const connectedCalls = callData?.agentLeaderboard?.reduce((sum: number, agent: { connected: number }) => sum + agent.connected, 0) || 0;
  const callbackCount = callData?.tagBreakdown?.find((tag: { tag: string }) => tag.tag === 'Callback')?.count || 0;
  const connectRate = totalCalls ? Math.round((connectedCalls / totalCalls) * 100) : 0;
  const scopeLabel = selectedCampaign ? `${selectedCampaign.name as string} in ${rangeLabel.toLowerCase()}` : rangeLabel.toLowerCase();
  const languageCounts = languageLeads.reduce((totals: Record<string, number>, lead) => {
    const language = lead.lastCallLanguage?.trim();
    if (!language) return totals;
    totals[language] = (totals[language] || 0) + 1;
    return totals;
  }, {});
  const languageBreakdown = Object.entries(languageCounts)
    .map(([language, count]) => ({ language, count }))
    .sort((left, right) => right.count - left.count);
  const totalLanguageTaggedLeads = languageBreakdown.reduce((sum, entry) => sum + entry.count, 0);
  const languageChartData = {
    labels: languageBreakdown.map((entry) => entry.language),
    datasets: [
      {
        data: languageBreakdown.map((entry) => entry.count),
        backgroundColor: languageBreakdown.map((_, index) => LANGUAGE_CHART_COLOURS[index % LANGUAGE_CHART_COLOURS.length]),
        borderColor: '#ffffff',
        borderWidth: 2,
      },
    ],
  };
  const languageChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#1e293b',
        borderColor: '#334155',
        borderWidth: 1,
        titleColor: '#f8fafc',
        bodyColor: '#cbd5e1',
        callbacks: {
          label: (context: { label: string; parsed: number }) => {
            const percentage = totalLanguageTaggedLeads
              ? Math.round((context.parsed / totalLanguageTaggedLeads) * 100)
              : 0;
            return `${context.label}: ${context.parsed} (${percentage}%)`;
          },
        },
      },
    },
  };

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
            <div style={{ minWidth: 220 }}>
              <Dropdown
                value={campaignFilter}
                onChange={setCampaignFilter}
                placeholder="All Campaigns"
                height={38}
                options={[
                  { value: '', label: 'All Campaigns' },
                  ...campaigns.map((campaign) => ({
                    value: campaign.id as string,
                    label: campaign.name as string,
                  })),
                ]}
              />
            </div>
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
                  <div className="card-kicker">Language mix</div>
                  <h2 className="card-title">Language Breakdown</h2>
                </div>
                <span className="card-subtitle">{rangeLabel}</span>
              </div>
              <div className="card-body">
                {languageBreakdown.length ? (
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'minmax(180px, 240px) minmax(0, 1fr)',
                      gap: 20,
                      alignItems: 'center',
                    }}
                  >
                    <div style={{ height: 220, position: 'relative' }}>
                      <Pie data={languageChartData} options={languageChartOptions as never} plugins={[languagePercentagePlugin]} />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {languageBreakdown.map((entry, index) => (
                        <div
                          key={entry.language}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: 12,
                            padding: '10px 12px',
                            border: '1px solid var(--border)',
                            borderRadius: 12,
                            background: 'var(--bg-elevated)',
                          }}
                        >
                          <span style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                            <span
                              style={{
                                width: 10,
                                height: 10,
                                borderRadius: '50%',
                                background: LANGUAGE_CHART_COLOURS[index % LANGUAGE_CHART_COLOURS.length],
                                flexShrink: 0,
                              }}
                            />
                            <span style={{ color: 'var(--text-primary)', fontSize: '1rem', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {entry.language}
                            </span>
                          </span>
                          <span style={{ display: 'flex', alignItems: 'baseline', gap: 8, color: 'var(--text-secondary)', flexShrink: 0 }}>
                            <span style={{ fontSize: '0.98rem', fontWeight: 700 }}>{entry.count}</span>
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                              {Math.round((entry.count / totalLanguageTaggedLeads) * 100)}%
                            </span>
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="empty-state">
                    <Languages size={32} />
                    <p>No language data available</p>
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
