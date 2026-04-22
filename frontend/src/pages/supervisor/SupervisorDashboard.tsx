import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS, CategoryScale, LinearScale,
  BarElement, Tooltip, Legend,
} from 'chart.js';
import { leadsService, callsService, usersService } from '../../services/crm.service';
import AppLayout from '../../components/layout/AppLayout';
import { api } from '../../services/api';
import { Users2, Phone, ListChecks, TrendingUp, ChevronRight, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

interface AgentRow {
  agentId: string; name: string; calls: number;
  connected: number; avgDuration: number;
}

export default function SupervisorDashboard() {
  const qc = useQueryClient();
  const [selectLead, setSelectLead] = useState<string[]>([]);

  const { data: teamData } = useQuery({
    queryKey: ['supervisor-team'],
    queryFn: () => api.get('/teams'),
  });

  const { data: agentsData } = useQuery({
    queryKey: ['supervisor-agents'],
    queryFn: () => usersService.list({ role: 'agent', limit: 100 }),
  });

  const { data: summaryData } = useQuery({
    queryKey: ['supervisor-calls-summary'],
    queryFn: () => callsService.summary(),
    refetchInterval: 60_000,
  });

  const { data: leadsData, isLoading: leadsLoading } = useQuery({
    queryKey: ['supervisor-leads'],
    queryFn: () => leadsService.list({ limit: 50, status: 'uncontacted' }),
  });

  const { data: callsData } = useQuery({
    queryKey: ['supervisor-calls'],
    queryFn: () => callsService.list({ limit: 20 }),
  });

  const assignMutation = useMutation({
    mutationFn: ({ leadIds, agentId }: { leadIds: string[]; agentId: string }) =>
      leadsService.assign(leadIds, agentId),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['supervisor-leads'] });
      toast.success(res.data.data.message);
      setSelectLead([]);
    },
  });

  const teams = teamData?.data?.data || [];
  const agents = (agentsData?.data?.data?.users || []) as Record<string, string>[];
  const summary = summaryData?.data?.data;
  const leads = (leadsData?.data?.data?.leads || []) as Record<string, unknown>[];
  const recentCalls = (callsData?.data?.data?.logs || []) as Record<string, unknown>[];
  const leaderboard: AgentRow[] = summary?.agentLeaderboard || [];
  const totalCalls = (summary?.dailyTotals || []).reduce((s: number, d: { count: number }) => s + d.count, 0);

  // Bar chart for today's calls per agent
  const chartData = {
    labels: leaderboard.slice(0, 10).map((a) => a.name.split(' ')[0]),
    datasets: [{
      label: 'Calls',
      data: leaderboard.slice(0, 10).map((a) => a.calls),
      backgroundColor: 'rgba(99, 102, 241, 0.7)',
      borderColor: '#6366f1',
      borderWidth: 1,
      borderRadius: 6,
    }, {
      label: 'Connected',
      data: leaderboard.slice(0, 10).map((a) => a.connected),
      backgroundColor: 'rgba(34, 197, 94, 0.7)',
      borderColor: '#22c55e',
      borderWidth: 1,
      borderRadius: 6,
    }],
  };

  return (
    <AppLayout>
      <div className="page-container">
        <div className="page-header">
          <div>
            <h1 className="page-title">Team Overview</h1>
            <p className="page-subtitle">Monitor agents, leads and performance</p>
          </div>
          <button className="btn btn-secondary" onClick={() => qc.invalidateQueries()}>
            <RefreshCw size={14} /> Refresh
          </button>
        </div>

        {/* KPIs */}
        <div className="stats-grid">
          {[
            { label: 'Team Agents', value: agents.length, icon: <Users2 size={20} />, colour: '#6366f1', sub: `${agents.filter(a => a.status === 'active').length} active` },
            { label: 'Calls (7 days)', value: totalCalls, icon: <Phone size={20} />, colour: '#22c55e', sub: 'All agents' },
            { label: 'Unassigned Leads', value: leadsData?.data?.data?.total || 0, icon: <ListChecks size={20} />, colour: '#f59e0b', sub: 'Needs assignment' },
            {
              label: 'Connect Rate',
              value: totalCalls > 0 ? `${Math.round((leaderboard.reduce((s, a) => s + a.connected, 0) / totalCalls) * 100)}%` : '—',
              icon: <TrendingUp size={20} />, colour: '#22d3ee', sub: 'Connected / Total',
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

        {/* Agent Performance Chart */}
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Agent Performance (7 days)</h2>
            <span className="card-subtitle">Total vs Connected calls</span>
          </div>
          <div style={{ padding: 20, height: 260 }}>
            {leaderboard.length > 0 ? (
              <Bar
                data={chartData}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: {
                    legend: { labels: { color: '#94a3b8', font: { family: 'Inter', size: 12 } } },
                    tooltip: { backgroundColor: '#1e293b', borderColor: '#334155', borderWidth: 1, titleColor: '#f1f5f9', bodyColor: '#94a3b8' },
                  },
                  scales: {
                    x: { grid: { color: '#1e293b' }, ticks: { color: '#64748b' } },
                    y: { grid: { color: '#1e293b' }, ticks: { color: '#64748b' } },
                  },
                }}
              />
            ) : (
              <div className="empty-state"><p>No call data for the period</p></div>
            )}
          </div>
        </div>

        <div className="two-col-grid">
          {/* Unassigned Leads */}
          <div className="card">
            <div className="card-header">
              <h2 className="card-title">Unassigned Leads</h2>
              {selectLead.length > 0 && (
                <select className="form-input" style={{ width: 180 }}
                  onChange={(e) => e.target.value && assignMutation.mutate({ leadIds: selectLead, agentId: e.target.value })}>
                  <option value="">Assign {selectLead.length} to…</option>
                  {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              )}
            </div>
            {leadsLoading && <div className="empty-state"><RefreshCw className="spin" size={18} /><p>Loading…</p></div>}
            {leads.slice(0, 8).map((l) => (
              <div key={l.id as string} className={`table-row ${selectLead.includes(l.id as string) ? 'table-row--selected' : ''}`}
                style={{ cursor: 'pointer' }}
                onClick={() => setSelectLead(s => s.includes(l.id as string) ? s.filter(x => x !== l.id) : [...s, l.id as string])}>
                <div style={{ width: 24, flexShrink: 0 }}>
                  <input type="checkbox" readOnly checked={selectLead.includes(l.id as string)} />
                </div>
                <div style={{ flex: 1, marginLeft: 10 }}>
                  <div style={{ fontWeight: 500, color: 'var(--text-primary)', fontSize: '0.875rem' }}>{(l.name as string) || 'Unknown'}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{l.email as string || ''}</div>
                </div>
                <span className="badge" style={{ background: l.priority === 'high' ? '#ef444422' : '#1e293b', color: l.priority === 'high' ? '#ef4444' : '#64748b' }}>
                  {l.priority as string}
                </span>
              </div>
            ))}
            {!leadsLoading && leads.length === 0 && (
              <div className="empty-state"><p>All leads assigned ✓</p></div>
            )}
          </div>

          {/* Recent Call Activity */}
          <div className="card">
            <div className="card-header">
              <h2 className="card-title">Recent Activity</h2>
              <span className="card-subtitle">Latest calls</span>
            </div>
            {recentCalls.slice(0, 8).map((c) => {
              const tag = c.dispositionTag as string;
              const tagColour: Record<string, string> = { Interested: '#22c55e', 'Not Interested': '#ef4444', Callback: '#f59e0b', DND: '#dc2626', RNR: '#6366f1', Busy: '#a78bfa' };
              return (
                <div key={c.id as string} className="followup-row">
                  <div className="avatar avatar--sm">{((c.agent as Record<string, string>)?.name || '?').charAt(0)}</div>
                  <div style={{ flex: 1, marginLeft: 8 }}>
                    <div style={{ fontSize: '0.83rem', fontWeight: 500, color: 'var(--text-primary)' }}>
                      {(c.agent as Record<string, string>)?.name} → {(c.lead as Record<string, string>)?.name || 'Unknown'}
                    </div>
                    <div style={{ fontSize: '0.73rem', color: 'var(--text-muted)' }}>
                      {new Date(c.calledAt as string).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      {c.durationSeconds ? ` · ${Math.floor(c.durationSeconds as number / 60)}m ${(c.durationSeconds as number) % 60}s` : ''}
                    </div>
                  </div>
                  <span className="badge" style={{ background: (tagColour[tag] || '#6366f1') + '22', color: tagColour[tag] || '#6366f1', fontSize: '0.7rem' }}>
                    {tag}
                  </span>
                </div>
              );
            })}
            {recentCalls.length === 0 && <div className="empty-state"><p>No recent calls</p></div>}
          </div>
        </div>

        {/* Agent Detail Table */}
        <div className="card">
          <div className="card-header"><h2 className="card-title">Agent Details</h2></div>
          <div className="table-header">
            <div className="table-col" style={{ flex: 2 }}>Agent</div>
            <div className="table-col">Status</div>
            <div className="table-col">Calls</div>
            <div className="table-col">Connected</div>
            <div className="table-col">Rate</div>
            <div className="table-col">Avg Duration</div>
          </div>
          {agents.map((a) => {
            const perf = leaderboard.find(l => l.agentId === a.id);
            return (
              <div key={a.id} className="table-row">
                <div className="table-cell" style={{ flex: 2, display: 'flex', gap: 10, alignItems: 'center' }}>
                  <div className="avatar avatar--sm">{a.name.charAt(0)}</div>
                  <div>
                    <div style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{a.name}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{a.email}</div>
                  </div>
                </div>
                <div className="table-cell">
                  <span className="badge" style={{ background: a.status === 'active' ? '#14532d' : '#1e293b', color: a.status === 'active' ? '#22c55e' : '#64748b' }}>
                    {a.status}
                  </span>
                </div>
                <div className="table-cell" style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{perf?.calls || 0}</div>
                <div className="table-cell">{perf?.connected || 0}</div>
                <div className="table-cell">
                  {perf?.calls
                    ? <span className="badge" style={{ background: '#14532d', color: '#22c55e' }}>{Math.round((perf.connected / perf.calls) * 100)}%</span>
                    : <span style={{ color: 'var(--text-muted)' }}>—</span>
                  }
                </div>
                <div className="table-cell" style={{ color: 'var(--text-secondary)' }}>
                  {perf?.avgDuration ? `${Math.floor(perf.avgDuration / 60)}m ${perf.avgDuration % 60}s` : '—'}
                </div>
              </div>
            );
          })}
          {agents.length === 0 && <div className="empty-state"><p>No agents in your team</p></div>}
        </div>
      </div>
    </AppLayout>
  );
}
