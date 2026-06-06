import { useState } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  ArcElement,
  Tooltip,
  Legend,
} from 'chart.js';
import { Bar, Doughnut } from 'react-chartjs-2';
import { useQuery } from '@tanstack/react-query';
import { Activity, AlertCircle, Clock, FolderOpen, Phone, TrendingUp, UserCheck, Users } from 'lucide-react';
import AppLayout from '../../components/layout/AppLayout';
import DateRangeFilter, { computeRange, type DateRangeValue } from '../../components/ui/DateRangeFilter';
import Dropdown from '../../components/ui/Dropdown';
import { adminService, campaignsService } from '../../services/crm.service';

ChartJS.register(CategoryScale, LinearScale, BarElement, PointElement, LineElement, ArcElement, Tooltip, Legend);

type KpiMetric = { current: number; previous: number; delta: number };
type FunnelStage = { key: string; label: string; count: number };
type CallTrendPoint = { date: string; total: number; connected: number; callback: number; busy: number; noAnswer: number; talkMinutes: number };
type OutcomeItem = { label: string; count: number };
type AgentItem = { agentId: string; name: string; calls: number; connected: number; connectRate: number; callbacks: number; talkMinutes: number };
type CampaignItem = { campaignId: string; name: string; leads: number; calls: number; connected: number; connectRate: number };
type Watchlist = { lowActivityAgents: Array<{ agentId: string; name: string; calls: number }>; staleLeadCount: number; callbackBacklog: number };
type DashboardSummary = {
  kpis: {
    totalLeads: KpiMetric;
    totalCalls: KpiMetric;
    connectRate: KpiMetric;
    activeAgents: KpiMetric;
    callbacksDue: KpiMetric;
    activeCampaigns: KpiMetric;
  };
  funnel: FunnelStage[];
  callTrend: CallTrendPoint[];
  callOutcomes: OutcomeItem[];
  agentPerformance: AgentItem[];
  campaignPerformance: CampaignItem[];
  watchlist: Watchlist;
};

const KPI_COLOURS = ['#0f766e', '#2563eb', '#ca8a04', '#7c3aed', '#ea580c', '#059669'];
const DONUT_COLOURS = ['#2563eb', '#7c3aed', '#0f766e', '#f97316', '#dc2626', '#0891b2'];

function formatDateLabel(value: string) {
  return new Date(value).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
}

function DeltaChip({ delta, suffix = '%' }: { delta: number; suffix?: string }) {
  const positive = delta >= 0;
  return (
    <div className={`stat-card__trend ${positive ? 'stat-card__trend--up' : 'stat-card__trend--down'}`}>
      {positive ? '▲' : '▼'} {positive ? '+' : ''}{delta}{suffix}
    </div>
  );
}

function KpiCard({ label, metric, colour, icon, valueSuffix = '', deltaSuffix = '%' }: { label: string; metric: KpiMetric; colour: string; icon: React.ReactNode; valueSuffix?: string; deltaSuffix?: string }) {
  return (
    <div className="stat-card" style={{ '--card-accent': colour } as React.CSSProperties}>
      <div className="stat-card__icon" style={{ background: `${colour}18`, color: colour }}>{icon}</div>
      <div className="stat-card__body">
        <div className="stat-card__value">{metric.current.toLocaleString()}{valueSuffix}</div>
        <div className="stat-card__label">{label}</div>
        <div className="stat-card__sub">Previous: {metric.previous.toLocaleString()}{valueSuffix}</div>
      </div>
      <DeltaChip delta={metric.delta} suffix={deltaSuffix} />
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="empty-state">
      <AlertCircle size={28} />
      <p>{message}</p>
    </div>
  );
}

export default function AdminDashboard() {
  const [dateRange, setDateRange] = useState<DateRangeValue>(() => {
    const range = computeRange('today');
    return { preset: 'today', from: range.from, to: range.to };
  });
  const [campaignFilter, setCampaignFilter] = useState('');

  const params = {
    from: dateRange.from,
    to: dateRange.to,
    ...(campaignFilter ? { campaignId: campaignFilter } : {}),
  };

  const { data: campaignsData } = useQuery({
    queryKey: ['campaigns', 'admin-dashboard-filter'],
    queryFn: () => campaignsService.list({ limit: 100 }),
  });

  const { data: dashboardData } = useQuery({
    queryKey: ['admin-dashboard-summary', dateRange.from, dateRange.to, campaignFilter],
    queryFn: () => adminService.dashboard(params),
  });

  const campaigns = (campaignsData?.data?.data?.campaigns || []) as Array<{ id: string; name: string }>;
  const selectedCampaign = campaigns.find((campaign) => campaign.id === campaignFilter) || null;
  const summary = dashboardData?.data?.data as DashboardSummary | undefined;

  const trendData = {
    labels: summary?.callTrend.map((point) => formatDateLabel(point.date)) || [],
    datasets: [
      {
        label: 'Total calls',
        data: summary?.callTrend.map((point) => point.total) || [],
        backgroundColor: 'rgba(37, 99, 235, 0.72)',
        borderRadius: 8,
      },
      {
        label: 'Connected',
        data: summary?.callTrend.map((point) => point.connected) || [],
        backgroundColor: 'rgba(15, 118, 110, 0.78)',
        borderRadius: 8,
      },
      {
        label: 'Callbacks',
        data: summary?.callTrend.map((point) => point.callback) || [],
        backgroundColor: 'rgba(249, 115, 22, 0.78)',
        borderRadius: 8,
      },
    ],
  };
  const funnelMax = Math.max(...(summary?.funnel.map((item) => item.count) || [1]));
  const outcomeData = {
    labels: summary?.callOutcomes.map((item) => item.label) || [],
    datasets: [{ data: summary?.callOutcomes.map((item) => item.count) || [], backgroundColor: DONUT_COLOURS, borderColor: '#fff', borderWidth: 2 }],
  };
  const agentBarData = {
    labels: summary?.agentPerformance.map((item) => item.name) || [],
    datasets: [
      { label: 'Calls', data: summary?.agentPerformance.map((item) => item.calls) || [], backgroundColor: '#7c3aed', borderRadius: 8 },
      { label: 'Connected', data: summary?.agentPerformance.map((item) => item.connected) || [], backgroundColor: '#0f766e', borderRadius: 8 },
    ],
  };
  const campaignBarData = {
    labels: summary?.campaignPerformance.map((item) => item.name) || [],
    datasets: [{ label: 'Connect rate %', data: summary?.campaignPerformance.map((item) => item.connectRate) || [], backgroundColor: '#2563eb', borderRadius: 8 }],
  };
  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { labels: { color: '#64748b', font: { family: 'Inter', size: 12 } } },
      tooltip: {
        backgroundColor: '#0f172a',
        borderColor: '#1e293b',
        borderWidth: 1,
        titleColor: '#f8fafc',
        bodyColor: '#cbd5e1',
      },
    },
    scales: {
      x: { grid: { color: '#e2e8f0' }, ticks: { color: '#64748b' } },
      y: { grid: { color: '#e2e8f0' }, ticks: { color: '#64748b' } },
    },
  };
  const outcomeLegendItems = (summary?.callOutcomes || []).map((item, index) => ({
    ...item,
    colour: DONUT_COLOURS[index % DONUT_COLOURS.length],
  }));

  return (
    <AppLayout>
      <div className="page-container">
        <section className="dashboard-hero">
          <div>
            <p className="section-eyebrow">Control center</p>
            <h1 className="page-title">Admin Dashboard</h1>
            <p className="page-subtitle">Track funnel health, call throughput, agent execution, campaign performance, and operational risk in one place.</p>
          </div>

          <div className="page-actions">
            <DateRangeFilter value={dateRange} onChange={setDateRange} includeAllTime allTimeLabel="All Data" />
            <div style={{ minWidth: 220 }}>
              <Dropdown
                value={campaignFilter}
                onChange={setCampaignFilter}
                placeholder="All Campaigns"
                height={38}
                options={[
                  { value: '', label: 'All Campaigns' },
                  ...campaigns.map((campaign) => ({ value: campaign.id, label: campaign.name })),
                ]}
              />
            </div>
            <div className="ops-pill">{selectedCampaign ? selectedCampaign.name : 'All campaigns'}</div>
          </div>
        </section>

        {summary ? (
          <>
            <div className="stats-grid">
              <KpiCard label="Total Leads" metric={summary.kpis.totalLeads} colour={KPI_COLOURS[0]} icon={<Users size={20} />} />
              <KpiCard label="Total Calls" metric={summary.kpis.totalCalls} colour={KPI_COLOURS[1]} icon={<Phone size={20} />} />
              <KpiCard label="Connect Rate" metric={summary.kpis.connectRate} colour={KPI_COLOURS[2]} icon={<TrendingUp size={20} />} valueSuffix="%" deltaSuffix="pp" />
              <KpiCard label="Active Agents" metric={summary.kpis.activeAgents} colour={KPI_COLOURS[3]} icon={<UserCheck size={20} />} />
              <KpiCard label="Callbacks Due" metric={summary.kpis.callbacksDue} colour={KPI_COLOURS[4]} icon={<Clock size={20} />} />
              <KpiCard label="Active Campaigns" metric={summary.kpis.activeCampaigns} colour={KPI_COLOURS[5]} icon={<FolderOpen size={20} />} />
            </div>

            <div className="dashboard-grid" style={{ alignItems: 'start' }}>
              <div className="dashboard-stack">
                <div className="card">
                  <div className="card-header card-header--dense">
                    <div>
                      <div className="card-kicker">Status overview</div>
                      <h2 className="card-title">Follow-up Status</h2>
                    </div>
                  </div>
                  <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    {summary.funnel.map((stage) => (
                      <div key={stage.key} style={{ display: 'grid', gridTemplateColumns: '140px minmax(0, 1fr) 60px', gap: 12, alignItems: 'center' }}>
                        <div style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>{stage.label}</div>
                        <div style={{ height: 12, borderRadius: 999, background: '#e2e8f0', overflow: 'hidden' }}>
                          <div style={{ width: `${funnelMax ? (stage.count / funnelMax) * 100 : 0}%`, height: '100%', background: 'linear-gradient(90deg, #2563eb 0%, #7c3aed 100%)' }} />
                        </div>
                        <div style={{ textAlign: 'right', fontWeight: 700, color: 'var(--text-primary)' }}>{stage.count.toLocaleString()}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="card">
                  <div className="card-header card-header--dense">
                    <div>
                      <div className="card-kicker">Call pulse</div>
                      <h2 className="card-title">Call Performance Trend</h2>
                    </div>
                  </div>
                  <div style={{ padding: 20, height: 320 }}>
                    {summary.callTrend.length ? <Bar data={trendData} options={chartOptions as never} /> : <EmptyState message="No calls in this range" />}
                  </div>
                </div>

                <div className="card">
                  <div className="card-header card-header--dense">
                    <div>
                      <div className="card-kicker">Team ranking</div>
                      <h2 className="card-title">Agent Performance</h2>
                    </div>
                  </div>
                  <div style={{ padding: 20, height: 320 }}>
                    {summary.agentPerformance.length ? <Bar data={agentBarData} options={{ ...chartOptions, indexAxis: 'y' } as never} /> : <EmptyState message="No agent activity yet" />}
                  </div>
                  <div className="card-body" style={{ paddingTop: 0, display: 'grid', gap: 10 }}>
                    {summary.agentPerformance.slice(0, 5).map((agent) => (
                      <div key={agent.agentId} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 78px 78px 84px', gap: 12, alignItems: 'center', padding: '10px 0', borderTop: '1px solid var(--border)' }}>
                        <div>
                          <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{agent.name}</div>
                          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{agent.talkMinutes} talk mins</div>
                        </div>
                        <div style={{ textAlign: 'right' }}>{agent.calls}</div>
                        <div style={{ textAlign: 'right' }}>{agent.connected}</div>
                        <div style={{ textAlign: 'right', fontWeight: 700 }}>{agent.connectRate}%</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="dashboard-stack">
                <div className="card">
                  <div className="card-header card-header--dense">
                    <div>
                      <div className="card-kicker">Mix</div>
                      <h2 className="card-title">Call Outcome Breakdown</h2>
                    </div>
                  </div>
                  {summary.callOutcomes.length ? (
                    <div className="card-body" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.2fr) minmax(220px, 0.8fr)', gap: 20, alignItems: 'center' }}>
                      <div style={{ height: 280 }}>
                        <Doughnut
                          data={outcomeData}
                          options={{
                            ...chartOptions,
                            scales: undefined,
                            plugins: {
                              ...chartOptions.plugins,
                              legend: { display: false },
                            },
                          } as never}
                        />
                      </div>
                      <div style={{ display: 'grid', gap: 10 }}>
                        {outcomeLegendItems.map((item) => (
                          <div key={item.label} style={{ display: 'grid', gridTemplateColumns: '12px minmax(0, 1fr) auto', gap: 12, alignItems: 'center' }}>
                            <div style={{ width: 12, height: 12, borderRadius: 999, background: item.colour }} />
                            <div style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>{item.label}</div>
                            <div style={{ color: 'var(--text-primary)', fontWeight: 700 }}>{item.count.toLocaleString()}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div style={{ padding: 20, height: 320 }}>
                      <EmptyState message="No call outcomes available" />
                    </div>
                  )}
                </div>

                <div className="card">
                  <div className="card-header card-header--dense">
                    <div>
                      <div className="card-kicker">Campaigns</div>
                      <h2 className="card-title">Campaign Performance</h2>
                    </div>
                  </div>
                  <div style={{ padding: 20, height: 320 }}>
                    {summary.campaignPerformance.length ? <Bar data={campaignBarData} options={{ ...chartOptions, indexAxis: 'y' } as never} /> : <EmptyState message="No campaign activity in this range" />}
                  </div>
                  <div className="card-body" style={{ paddingTop: 0, display: 'grid', gap: 10 }}>
                    {summary.campaignPerformance.slice(0, 5).map((campaign) => (
                      <div key={campaign.campaignId} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 64px 64px 82px', gap: 12, alignItems: 'center', padding: '10px 0', borderTop: '1px solid var(--border)' }}>
                        <div>
                          <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{campaign.name}</div>
                          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{campaign.leads} leads</div>
                        </div>
                        <div style={{ textAlign: 'right' }}>{campaign.calls}</div>
                        <div style={{ textAlign: 'right' }}>{campaign.connected}</div>
                        <div style={{ textAlign: 'right', fontWeight: 700 }}>{campaign.connectRate}%</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="card">
                  <div className="card-header card-header--dense">
                    <div>
                      <div className="card-kicker">Action signals</div>
                      <h2 className="card-title">Watchlist</h2>
                    </div>
                  </div>
                  <div className="card-body signal-list">
                    <div className="signal-row">
                      <div className="signal-row__icon signal-row__icon--amber"><Clock size={16} /></div>
                      <div className="signal-row__body">
                        <div className="signal-row__label">Callback backlog</div>
                        <div className="signal-row__value">{summary.watchlist.callbackBacklog} pending callbacks in the selected range.</div>
                      </div>
                    </div>
                    <div className="signal-row">
                      <div className="signal-row__icon signal-row__icon--red"><AlertCircle size={16} /></div>
                      <div className="signal-row__body">
                        <div className="signal-row__label">Stale leads</div>
                        <div className="signal-row__value">{summary.watchlist.staleLeadCount} uncontacted leads are older than 48 hours.</div>
                      </div>
                    </div>
                    <div className="signal-row">
                      <div className="signal-row__icon signal-row__icon--blue"><Activity size={16} /></div>
                      <div className="signal-row__body">
                        <div className="signal-row__label">Low activity agents</div>
                        <div className="signal-row__value">
                          {summary.watchlist.lowActivityAgents.length
                            ? summary.watchlist.lowActivityAgents.map((agent) => `${agent.name} (${agent.calls})`).join(', ')
                            : 'No low-activity agents in this range.'}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="card" style={{ padding: 32 }}>
            <EmptyState message="Loading admin dashboard analytics..." />
          </div>
        )}
      </div>
    </AppLayout>
  );
}
