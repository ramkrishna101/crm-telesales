import { useQuery } from '@tanstack/react-query';
import { usersService, campaignsService, leadsService, callsService } from '../../services/crm.service';
import AppLayout from '../../components/layout/AppLayout';
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
        <span className="badge" style={{ background: c.priority === 'high' ? '#ef444422' : '#1e293b', color: c.priority === 'high' ? '#ef4444' : '#64748b' }}>
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
  const { data: usersData } = useQuery({
    queryKey: ['users', 'all'],
    queryFn: () => usersService.list({ limit: 100 }),
  });

  const { data: campaignsData } = useQuery({
    queryKey: ['campaigns', 'all'],
    queryFn: () => campaignsService.list({ limit: 10 }),
  });

  const { data: leadsData } = useQuery({
    queryKey: ['leads', 'dashboard'],
    queryFn: () => leadsService.list({ limit: 1 }),
  });

  const { data: callsSummary } = useQuery({
    queryKey: ['calls', 'summary'],
    queryFn: () => callsService.summary(),
  });

  const users = (usersData?.data?.data?.users || []) as Record<string, unknown>[];
  const campaigns = (campaignsData?.data?.data?.campaigns || []) as Record<string, unknown>[];
  const totalLeads = (leadsData?.data?.data?.total as number) || 0;
  const callData = callsSummary?.data?.data;
  const agents = users.filter((u) => u.role === 'agent');
  const activeCampaigns = campaigns.filter((c) => c.status === 'active').length;
  const totalCalls = callData?.dailyTotals?.reduce((s: number, d: { count: number }) => s + d.count, 0) || 0;

  return (
    <AppLayout>
      <div className="page-container">
        {/* Header */}
        <div className="page-header">
          <div>
            <h1 className="page-title">Admin Dashboard</h1>
            <p className="page-subtitle">Platform overview & performance metrics</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Link to="/admin/campaigns" className="btn btn-primary">
              + New Campaign
            </Link>
          </div>
        </div>

        {/* Stat Cards */}
        <div className="stats-grid">
          <StatCard
            icon={<Users size={22} />} label="Total Users"
            value={users.length} sub={`${agents.length} active agents`}
            colour="#6366f1" trend={12}
          />
          <StatCard
            icon={<FolderOpen size={22} />} label="Campaigns"
            value={campaigns.length} sub={`${activeCampaigns} active`}
            colour="#22d3ee"
          />
          <StatCard
            icon={<UserCheck size={22} />} label="Total Leads"
            value={totalLeads.toLocaleString()} sub="across all campaigns"
            colour="#22c55e" trend={8}
          />
          <StatCard
            icon={<Phone size={22} />} label="Calls (7 days)"
            value={totalCalls.toLocaleString()} sub="total connected"
            colour="#f59e0b"
          />
        </div>

        {/* Tag Breakdown + Agent Status */}
        <div className="two-col-grid">
          {/* Disposition Breakdown */}
          <div className="card">
            <div className="card-header">
              <h2 className="card-title">Call Dispositions</h2>
              <span className="card-subtitle">Last 7 days</span>
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

          {/* Agent Status */}
          <div className="card">
            <div className="card-header">
              <h2 className="card-title">Agent Status</h2>
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
        </div>

        {/* Campaigns Table */}
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Campaigns</h2>
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
    </AppLayout>
  );
}
