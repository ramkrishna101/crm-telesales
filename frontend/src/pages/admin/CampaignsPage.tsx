import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { campaignsService, teamsService } from '../../services/crm.service';
import AppLayout from '../../components/layout/AppLayout';
import toast from 'react-hot-toast';
import { Plus, X, Upload, BarChart2, Pause, Play, Eye, RefreshCw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface Campaign {
  id: string; name: string; description?: string;
  type: 'standard' | 'vip'; priority: 'normal' | 'high';
  status: 'active' | 'paused' | 'closed';
  teamId: string | null;
  team?: { id: string; name: string } | null;
  createdBy: { id: string; name: string };
  _count: { leads: number; agents: number };
  createdAt: string;
}
interface Team { id: string; name: string; }

// ── Create Modal ──────────────────────────────────────────────────────

function CreateCampaignModal({ teams, onClose, onSave }: {
  teams: Team[]; onClose: () => void;
  onSave: (data: Record<string, unknown>) => void;
}) {
  const [form, setForm] = useState({ name: '', description: '', type: 'standard', priority: 'normal', teamId: '' });
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">New Campaign</h2>
          <button className="btn-icon" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label className="form-label">Campaign Name</label>
            <input className="form-input" value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Q2 Insurance Outreach" />
          </div>
          <div className="form-group">
            <label className="form-label">Description</label>
            <textarea className="form-input" rows={2} value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="What is this campaign about?" />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Type</label>
              <select className="form-input" value={form.type} onChange={(e) => set('type', e.target.value)}>
                <option value="standard">Standard</option>
                <option value="vip">VIP</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Priority</label>
              <select className="form-input" value={form.priority} onChange={(e) => set('priority', e.target.value)}>
                <option value="normal">Normal</option>
                <option value="high">High</option>
              </select>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Assign Team</label>
            <select className="form-input" value={form.teamId} onChange={(e) => set('teamId', e.target.value)}>
              <option value="">No team</option>
              {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={() => onSave({ ...form, teamId: form.teamId || null })}>
            Create Campaign
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Campaigns Page ────────────────────────────────────────────────────

export default function CampaignsPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [showCreate, setShowCreate] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');

  const { data: campaignsData, isLoading } = useQuery({
    queryKey: ['campaigns', statusFilter],
    queryFn: () => campaignsService.list({ limit: 100, ...(statusFilter ? { status: statusFilter } : {}) }),
  });

  const { data: teamsData } = useQuery({
    queryKey: ['teams'],
    queryFn: () => teamsService.list(),
  });

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => campaignsService.create(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['campaigns'] }); toast.success('Campaign created'); setShowCreate(false); },
    onError: (e: Error) => toast.error(e.message || 'Failed'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) => campaignsService.update(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['campaigns'] }); toast.success('Campaign updated'); },
    onError: (e: Error) => toast.error(e.message || 'Failed'),
  });

  const campaigns: Campaign[] = campaignsData?.data?.data?.campaigns || [];
  const teams: Team[] = teamsData?.data?.data || [];

  const statusColour = { active: '#22c55e', paused: '#f59e0b', closed: '#94a3b8' };
  const priorityColour = { high: '#ef4444', normal: '#6366f1' };

  return (
    <AppLayout>
      <div className="page-container">
        <div className="page-header">
          <div>
            <h1 className="page-title">Campaigns</h1>
            <p className="page-subtitle">{campaigns.length} total · {campaigns.filter(c => c.status === 'active').length} active</p>
          </div>
          <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
            <Plus size={16} /> New Campaign
          </button>
        </div>

        {/* Status tabs */}
        <div className="filter-bar">
          <div className="filter-tabs">
            {['', 'active', 'paused', 'closed'].map((s) => (
              <button key={s} className={`filter-tab ${statusFilter === s ? 'filter-tab--active' : ''}`} onClick={() => setStatusFilter(s)}>
                {s || 'All'}
              </button>
            ))}
          </div>
        </div>

        {/* Campaign Cards */}
        {isLoading && <div className="empty-state"><RefreshCw className="spin" size={20} /><p>Loading…</p></div>}
        <div className="campaign-grid">
          {campaigns.map((c) => (
            <div key={c.id} className="campaign-card">
              <div className="campaign-card__header">
                <div style={{ flex: 1 }}>
                  <div className="campaign-card__name">{c.name}</div>
                  {c.description && <div className="campaign-card__desc">{c.description}</div>}
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button className="btn-icon" title="View" onClick={() => navigate(`/admin/campaigns/${c.id}`)}><Eye size={15} /></button>
                  <button className="btn-icon" title="Stats" onClick={() => navigate(`/admin/campaigns/${c.id}/stats`)}><BarChart2 size={15} /></button>
                  {c.status === 'active'
                    ? <button className="btn-icon" title="Pause" onClick={() => updateMutation.mutate({ id: c.id, data: { status: 'paused' } })}><Pause size={15} /></button>
                    : c.status === 'paused'
                      ? <button className="btn-icon" title="Resume" onClick={() => updateMutation.mutate({ id: c.id, data: { status: 'active' } })}><Play size={15} /></button>
                      : null
                  }
                </div>
              </div>

              <div className="campaign-card__meta">
                <span className="badge" style={{ background: (statusColour[c.status] || '#94a3b8') + '22', color: statusColour[c.status] || '#94a3b8' }}>{c.status}</span>
                <span className="badge" style={{ background: (priorityColour[c.priority] || '#6366f1') + '22', color: priorityColour[c.priority] || '#6366f1' }}>{c.priority} priority</span>
                <span className="badge" style={{ background: '#1e293b', color: '#64748b' }}>{c.type}</span>
              </div>

              <div className="campaign-card__stats">
                <div className="campaign-stat">
                  <span className="campaign-stat__value">{c._count.leads.toLocaleString()}</span>
                  <span className="campaign-stat__label">Leads</span>
                </div>
                <div className="campaign-stat">
                  <span className="campaign-stat__value">{c._count.agents}</span>
                  <span className="campaign-stat__label">Agents</span>
                </div>
                <div className="campaign-stat">
                  <span className="campaign-stat__value">{c.team?.name || '—'}</span>
                  <span className="campaign-stat__label">Team</span>
                </div>
              </div>
            </div>
          ))}
          {!isLoading && campaigns.length === 0 && (
            <div className="empty-state" style={{ gridColumn: '1/-1' }}>
              <p>No campaigns yet. Create one to get started.</p>
            </div>
          )}
        </div>
      </div>

      {showCreate && (
        <CreateCampaignModal teams={teams} onClose={() => setShowCreate(false)} onSave={(data) => createMutation.mutate(data)} />
      )}
    </AppLayout>
  );
}
