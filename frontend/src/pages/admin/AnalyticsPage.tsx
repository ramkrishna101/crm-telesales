import { useState } from 'react';
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, BarElement, LineElement,
  PointElement, ArcElement, Tooltip, Legend, Filler,
} from 'chart.js';
import { Bar, Line, Doughnut } from 'react-chartjs-2';
import { useQuery } from '@tanstack/react-query';
import { callsService, leadsService, campaignsService } from '../../services/crm.service';
import AppLayout from '../../components/layout/AppLayout';
import { BarChart3, TrendingUp, Phone, Users2 } from 'lucide-react';

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, ArcElement, Tooltip, Legend, Filler);

// ── Chart defaults ────────────────────────────────────────────────────

const chartDefaults = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { labels: { color: '#94a3b8', font: { family: 'Inter', size: 12 } } },
    tooltip: {
      backgroundColor: '#1e293b',
      borderColor: '#334155',
      borderWidth: 1,
      titleColor: '#f1f5f9',
      bodyColor: '#94a3b8',
    },
  },
  scales: {
    x: { grid: { color: '#1e293b' }, ticks: { color: '#64748b', font: { family: 'Inter' } } },
    y: { grid: { color: '#1e293b' }, ticks: { color: '#64748b', font: { family: 'Inter' } } },
  },
};

// ── Date helpers ──────────────────────────────────────────────────────

function getDateRange(range: number | string) {
  const now = new Date();
  
  const formatDateLocal = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  if (range === 'today') {
    const d = formatDateLocal(now);
    return { from: d, to: d };
  }
  if (range === 'yesterday') {
    const y = new Date(Date.now() - 86400000);
    const yStr = formatDateLocal(y);
    return { from: yStr, to: yStr };
  }
  
  const days = range as number;
  const from = new Date(Date.now() - days * 86400000);
  return {
    from: formatDateLocal(from),
    to: formatDateLocal(now),
  };
}

// ── Analytics Page ────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const [range, setRange] = useState<number | string>(7);
  const { from, to } = getDateRange(range);

  const { data: summaryData } = useQuery({
    queryKey: ['calls-summary', range],
    queryFn: () => callsService.summary({ from, to }),
  });

  const { data: leadsData } = useQuery({
    queryKey: ['leads-count'],
    queryFn: () => leadsService.list({ limit: 1 }),
  });

  const { data: campaignsData } = useQuery({
    queryKey: ['campaigns-count'],
    queryFn: () => campaignsService.list({ limit: 100 }),
  });

  const summary = summaryData?.data?.data;
  const totalLeads: number = leadsData?.data?.data?.total || 0;
  const campaigns = campaignsData?.data?.data?.campaigns || [];

  // ── Prepare chart data ─────────────────────────────────────────────

  const dailyLabels = (summary?.dailyTotals || []).map((d: { date: string }) =>
    new Date(d.date).toLocaleDateString('en', { month: 'short', day: 'numeric' })
  );
  const dailyCounts = (summary?.dailyTotals || []).map((d: { count: number }) => d.count);
  const dailyAvgDur = (summary?.dailyTotals || []).map((d: { avgDuration: number }) => Math.round(d.avgDuration / 60));

  const totalCalls = dailyCounts.reduce((s: number, c: number) => s + c, 0);

  // Hourly heatmap (0–23)
  const hourlyData = Array(24).fill(0);
  (summary?.hourlyHeatmap || []).forEach((h: { hour: number; count: number }) => {
    hourlyData[h.hour] = h.count;
  });

  // Tag breakdown
  const tagLabels = (summary?.tagBreakdown || []).map((t: { tag: string }) => t.tag);
  const tagCounts = (summary?.tagBreakdown || []).map((t: { count: number }) => t.count);
  const tagColours = [
    '#6366f1', '#22d3ee', '#22c55e', '#f59e0b', '#ef4444',
    '#a78bfa', '#34d399', '#fb923c', '#60a5fa', '#f472b6',
  ];

  const rangeLabel = typeof range === 'number' ? `Last ${range} days` : range.charAt(0).toUpperCase() + range.slice(1);

  return (
    <AppLayout>
      <div className="page-container">
        {/* Header */}
        <div className="page-header">
          <div>
            <h1 className="page-title">Analytics</h1>
            <p className="page-subtitle">Platform-wide performance insights</p>
          </div>
          <div className="filter-tabs">
            {['today', 'yesterday', 7, 14, 30].map((d) => (
              <button key={d} className={`filter-tab ${range === d ? 'filter-tab--active' : ''}`} onClick={() => setRange(d)}>
                {typeof d === 'number' ? `${d}d` : d.charAt(0).toUpperCase() + d.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* KPI Cards */}
        <div className="stats-grid">
          {[
            { label: 'Total Calls', value: totalCalls.toLocaleString(), icon: <Phone size={20} />, colour: '#6366f1', sub: rangeLabel },
            { label: 'Total Leads', value: totalLeads.toLocaleString(), icon: <Users2 size={20} />, colour: '#22c55e', sub: 'All campaigns' },
            { label: 'Active Campaigns', value: campaigns.filter((c: { status: string }) => c.status === 'active').length, icon: <BarChart3 size={20} />, colour: '#22d3ee', sub: `${campaigns.length} total` },
            {
              label: 'Conversion Rate',
              value: totalCalls > 0
                ? `${Math.round(((summary?.tagBreakdown?.find((t: { tag: string }) => t.tag === 'Interested')?.count || 0) / totalCalls) * 100)}%`
                : '—',
              icon: <TrendingUp size={20} />,
              colour: '#f59e0b',
              sub: '"Interested" / total calls',
            },
          ].map(({ label, value, icon, colour, sub }) => (
            <div key={label} className="stat-card" style={{ '--card-accent': colour } as React.CSSProperties}>
              <div className="stat-card__icon" style={{ background: colour + '22', color: colour }}>{icon}</div>
              <div className="stat-card__body">
                <div className="stat-card__value">{value}</div>
                <div className="stat-card__label">{label}</div>
                <div className="stat-card__sub">{sub}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Row 1: Daily Calls + Avg Duration */}
        <div className="two-col-grid">
          <div className="card">
            <div className="card-header">
              <h2 className="card-title">Daily Call Volume</h2>
              <span className="card-subtitle">Calls per day</span>
            </div>
            <div style={{ padding: 20, height: 240 }}>
              <Bar
                data={{
                  labels: dailyLabels,
                  datasets: [{
                    label: 'Calls',
                    data: dailyCounts,
                    backgroundColor: 'rgba(99, 102, 241, 0.7)',
                    borderColor: '#6366f1',
                    borderWidth: 1,
                    borderRadius: 4,
                  }],
                }}
                options={chartDefaults as never}
              />
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <h2 className="card-title">Avg Call Duration</h2>
              <span className="card-subtitle">Minutes per day</span>
            </div>
            <div style={{ padding: 20, height: 240 }}>
              <Line
                data={{
                  labels: dailyLabels,
                  datasets: [{
                    label: 'Avg Duration (mins)',
                    data: dailyAvgDur,
                    borderColor: '#22d3ee',
                    backgroundColor: 'rgba(34, 211, 238, 0.1)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.4,
                    pointRadius: 4,
                    pointBackgroundColor: '#22d3ee',
                  }],
                }}
                options={chartDefaults as never}
              />
            </div>
          </div>
        </div>

        {/* Row 2: Hourly Heatmap + Disposition Doughnut */}
        <div className="two-col-grid">
          <div className="card">
            <div className="card-header">
              <h2 className="card-title">Hourly Call Heatmap</h2>
              <span className="card-subtitle">Best hours to call</span>
            </div>
            <div style={{ padding: 20, height: 240 }}>
              <Bar
                data={{
                  labels: Array.from({ length: 24 }, (_, i) => `${i}:00`),
                  datasets: [{
                    label: 'Calls',
                    data: hourlyData,
                    backgroundColor: hourlyData.map((v) => {
                      const max = Math.max(...hourlyData, 1);
                      const intensity = v / max;
                      return `rgba(99, 102, 241, ${0.15 + intensity * 0.85})`;
                    }),
                    borderRadius: 3,
                  }],
                }}
                options={{
                  ...chartDefaults,
                  plugins: { ...chartDefaults.plugins, legend: { display: false } },
                } as never}
              />
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <h2 className="card-title">Disposition Breakdown</h2>
              <span className="card-subtitle">{typeof range === 'number' ? `All calls last ${range} days` : `All calls ${range}`}</span>
            </div>
            <div style={{ padding: 20, height: 240, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {tagLabels.length > 0 ? (
                <Doughnut
                  data={{
                    labels: tagLabels,
                    datasets: [{
                      data: tagCounts,
                      backgroundColor: tagColours.slice(0, tagLabels.length).map(c => c + 'cc'),
                      borderColor: tagColours.slice(0, tagLabels.length),
                      borderWidth: 2,
                    }],
                  }}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    cutout: '65%',
                    plugins: {
                      legend: {
                        position: 'right',
                        labels: { color: '#94a3b8', font: { family: 'Inter', size: 11 }, padding: 12, boxWidth: 12 },
                      },
                      tooltip: chartDefaults.plugins.tooltip,
                    },
                  }}
                />
              ) : (
                <div className="empty-state"><p>No call data yet</p></div>
              )}
            </div>
          </div>
        </div>

        {/* Agent Performance */}
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Agent Performance</h2>
            <span className="card-subtitle">{rangeLabel}</span>
          </div>
          {(summary?.agentLeaderboard || []).length === 0 ? (
            <div className="empty-state"><p>No call data available</p></div>
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
              {(summary.agentLeaderboard as Array<{
                agentId: string; name: string; calls: number;
                connected: number; avgDuration: number;
                interested: number; callback: number; notInterested: number;
                rnr: number; busy: number; dnd: number; invalid: number;
              }>).map((a, i) => {
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
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 400 }}>Avg: {a.avgDuration > 0 ? `${Math.floor(a.avgDuration / 60)}m ${a.avgDuration % 60}s` : '0s'}</div>
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
          )}
        </div>
      </div>
    </AppLayout>
  );
}
