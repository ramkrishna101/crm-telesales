import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { campaignsService, teamsService, usersService } from '../../services/crm.service';
import AppLayout from '../../components/layout/AppLayout';
import toast from 'react-hot-toast';
import {
  Plus, X, BarChart2, Pause, Play, Eye,
  RefreshCw, ChevronRight, ChevronLeft,
  Users2, Building2, CheckCircle2, UserPlus, UserMinus,
} from 'lucide-react';

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
interface Team { id: string; name: string; members?: { id: string; name: string; email: string }[]; }
interface User { id: string; name: string; email: string; role: string; teamId: string | null; }

// ─────────────────────────────────────────────────────────────────────────────
// Wizard Modal
// ─────────────────────────────────────────────────────────────────────────────

const STEPS = [
  { label: 'Details',     icon: <Building2 size={15} /> },
  { label: 'Team',        icon: <Users2 size={15} /> },
  { label: 'Agents',      icon: <UserPlus size={15} /> },
];

function CampaignWizard({ teams, agents, onClose, onCreate }: {
  teams: Team[];
  agents: User[];
  onClose: () => void;
  onCreate: (campaignId: string) => void;
}) {
  const qc = useQueryClient();
  const [step, setStep] = useState(0);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: '', description: '', type: 'standard', priority: 'normal', teamId: '',
  });
  const [selectedAgents, setSelectedAgents] = useState<string[]>([]);
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  // Agents available: those in the selected team OR all agents if no team selected
  const teamMembers = form.teamId
    ? agents.filter(a => a.teamId === form.teamId)
    : agents;

  // Step 1 → Create campaign
  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => campaignsService.create(data),
    onSuccess: (res) => {
      const id = res.data.data.campaign?.id || res.data.data.id;
      setCreatedId(id);
      qc.invalidateQueries({ queryKey: ['campaigns'] });
      toast.success('Campaign created');
      setStep(2); // Jump straight to agents step
    },
    onError: (e: Error) => toast.error(e.message || 'Failed to create campaign'),
  });

  // Step 3 → Assign agents
  const assignMutation = useMutation({
    mutationFn: (agentIds: string[]) => campaignsService.addAgents(createdId!, agentIds),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['campaigns'] });
      toast.success(`${selectedAgents.length} agent${selectedAgents.length > 1 ? 's' : ''} added to campaign`);
      onCreate(createdId!);
      onClose();
    },
    onError: (e: Error) => toast.error(e.message || 'Failed to assign agents'),
  });

  const toggleAgent = (id: string) =>
    setSelectedAgents(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);

  const toggleAll = () =>
    setSelectedAgents(s => s.length === teamMembers.length ? [] : teamMembers.map(a => a.id));

  const handleNext = () => {
    if (step === 0) {
      if (!form.name.trim()) { toast.error('Campaign name is required'); return; }
      setStep(1);
    } else if (step === 1) {
      // Proceed to create with team info
      createMutation.mutate({ ...form, teamId: form.teamId || null });
    } else if (step === 2) {
      if (selectedAgents.length > 0) {
        assignMutation.mutate(selectedAgents);
      } else {
        // Skip agent assignment
        onCreate(createdId!);
        onClose();
      }
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal--wide" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="modal-header">
          <h2 className="modal-title">New Campaign</h2>
          <button className="btn-icon" onClick={onClose}><X size={18} /></button>
        </div>

        {/* Step indicators */}
        <div className="wizard-steps">
          {STEPS.map((s, i) => (
            <div key={s.label} className={`wizard-step ${i < step ? 'wizard-step--done' : i === step ? 'wizard-step--active' : ''}`}>
              <div className="wizard-step__dot">
                {i < step ? <CheckCircle2 size={16} /> : s.icon}
              </div>
              <span className="wizard-step__label">{s.label}</span>
              {i < STEPS.length - 1 && <div className="wizard-step__line" />}
            </div>
          ))}
        </div>

        <div className="modal-body">
          {/* ── Step 0: Campaign Details ───────────────────────────────── */}
          {step === 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div className="form-group">
                <label className="form-label">Campaign Name <span style={{ color: '#ef4444' }}>*</span></label>
                <input className="form-input" value={form.name} onChange={e => set('name', e.target.value)}
                  placeholder="e.g. Q2 Insurance Outreach" autoFocus />
              </div>
              <div className="form-group">
                <label className="form-label">Description</label>
                <textarea className="form-input" rows={2} value={form.description}
                  onChange={e => set('description', e.target.value)} placeholder="What is this campaign about?" />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Type</label>
                  <select className="form-input" value={form.type} onChange={e => set('type', e.target.value)}>
                    <option value="standard">Standard</option>
                    <option value="vip">VIP</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Priority</label>
                  <select className="form-input" value={form.priority} onChange={e => set('priority', e.target.value)}>
                    <option value="normal">Normal</option>
                    <option value="high">High</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* ── Step 1: Team Assignment ────────────────────────────────── */}
          {step === 1 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ padding: '12px 16px', background: 'var(--bg-elevated)', borderRadius: 10, border: '1px solid var(--border-subtle)' }}>
                <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: 2 }}>{form.name}</div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{form.type} · {form.priority} priority</div>
              </div>

              <div>
                <label className="form-label" style={{ marginBottom: 10, display: 'block' }}>
                  Assign to a Team <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(optional)</span>
                </label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {/* No team option */}
                  <label className={`team-option ${!form.teamId ? 'team-option--selected' : ''}`}
                    onClick={() => { set('teamId', ''); setSelectedAgents([]); }}>
                    <div className="team-option__radio">{!form.teamId && <div className="team-option__radio-dot" />}</div>
                    <div>
                      <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.9rem' }}>No specific team</div>
                      <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>Pick individual agents in the next step</div>
                    </div>
                  </label>

                  {teams.map(t => (
                    <label key={t.id} className={`team-option ${form.teamId === t.id ? 'team-option--selected' : ''}`}
                      onClick={() => { set('teamId', t.id); setSelectedAgents([]); }}>
                      <div className="team-option__radio">
                        {form.teamId === t.id && <div className="team-option__radio-dot" />}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.9rem' }}>{t.name}</div>
                        <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                          {agents.filter(a => a.teamId === t.id).length} agents
                        </div>
                      </div>
                      <span className="badge" style={{ background: '#1e293b', color: '#a78bfa' }}>
                        {agents.filter(a => a.teamId === t.id).length} agents
                      </span>
                    </label>
                  ))}

                  {teams.length === 0 && (
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.84rem', padding: '8px 0' }}>
                      No teams created yet. You can still assign individual agents in the next step.
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ── Step 2: Agent Selection ────────────────────────────────── */}
          {step === 2 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <label className="form-label" style={{ margin: 0 }}>
                    Select Agents <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(optional)</span>
                  </label>
                  <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: 2 }}>
                    {form.teamId
                      ? `Showing agents from selected team · ${teamMembers.length} available`
                      : `All agents · ${teamMembers.length} available`}
                  </div>
                </div>
                {teamMembers.length > 0 && (
                  <button className="btn btn-secondary" style={{ fontSize: '0.78rem', padding: '5px 12px' }} onClick={toggleAll}>
                    {selectedAgents.length === teamMembers.length ? 'Deselect All' : 'Select All'}
                  </button>
                )}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 280, overflowY: 'auto' }}>
                {teamMembers.map(a => (
                  <div key={a.id}
                    className={`agent-option ${selectedAgents.includes(a.id) ? 'agent-option--selected' : ''}`}
                    onClick={() => toggleAgent(a.id)}>
                    <div className="avatar avatar--sm">{a.name.charAt(0)}</div>
                    <div style={{ flex: 1, marginLeft: 10 }}>
                      <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.875rem' }}>{a.name}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{a.email}</div>
                    </div>
                    <div className={`agent-option__check ${selectedAgents.includes(a.id) ? 'agent-option__check--active' : ''}`}>
                      {selectedAgents.includes(a.id) && <CheckCircle2 size={18} />}
                    </div>
                  </div>
                ))}
                {teamMembers.length === 0 && (
                  <div className="empty-state">
                    <Users2 size={28} style={{ opacity: 0.3 }} />
                    <p>No agents found. {form.teamId ? 'The selected team has no members yet.' : 'Create agents first.'}</p>
                  </div>
                )}
              </div>

              {selectedAgents.length > 0 && (
                <div style={{ padding: '10px 14px', background: '#14532d22', border: '1px solid #22c55e44', borderRadius: 8, fontSize: '0.82rem', color: '#22c55e', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <CheckCircle2 size={15} />
                  {selectedAgents.length} agent{selectedAgents.length > 1 ? 's' : ''} will be added to this campaign
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="modal-footer">
          {step > 0 && step < 2 && (
            <button className="btn btn-secondary" onClick={() => setStep(s => s - 1)}>
              <ChevronLeft size={15} /> Back
            </button>
          )}
          {step === 2 && (
            <button className="btn btn-secondary" onClick={() => { onCreate(createdId!); onClose(); }}>
              Skip & Finish
            </button>
          )}
          <div style={{ flex: 1 }} />
          <button className="btn btn-primary"
            disabled={createMutation.isPending || assignMutation.isPending}
            onClick={handleNext}>
            {createMutation.isPending ? 'Creating…' : assignMutation.isPending ? 'Assigning…' :
              step === 0 ? <><span>Next</span><ChevronRight size={15} /></> :
              step === 1 ? <><span>Create Campaign</span><ChevronRight size={15} /></> :
              selectedAgents.length > 0 ? `Add ${selectedAgents.length} Agent${selectedAgents.length > 1 ? 's' : ''} & Finish` : 'Finish'
            }
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Campaigns Page
// ─────────────────────────────────────────────────────────────────────────────

export default function CampaignsPage() {
  const qc = useQueryClient();
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

  const { data: usersData } = useQuery({
    queryKey: ['users', 'agents-all'],
    queryFn: () => usersService.list({ role: 'agent', limit: 200 }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      campaignsService.update(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['campaigns'] }); toast.success('Campaign updated'); },
    onError: (e: Error) => toast.error(e.message || 'Failed'),
  });

  const campaigns: Campaign[] = campaignsData?.data?.data?.campaigns || [];
  const teams: Team[] = teamsData?.data?.data || [];
  const agents: User[] = usersData?.data?.data?.users || [];

  const statusColour: Record<string, string> = { active: '#22c55e', paused: '#f59e0b', closed: '#94a3b8' };
  const priorityColour: Record<string, string> = { high: '#ef4444', normal: '#6366f1' };

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
              <button key={s} className={`filter-tab ${statusFilter === s ? 'filter-tab--active' : ''}`}
                onClick={() => setStatusFilter(s)}>
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
                  <span className="campaign-stat__value" style={{ color: c._count.agents > 0 ? '#22c55e' : 'var(--text-muted)' }}>{c._count.agents}</span>
                  <span className="campaign-stat__label">Agents</span>
                </div>
                <div className="campaign-stat">
                  <span className="campaign-stat__value" style={{ fontSize: '0.85rem' }}>{c.team?.name || '—'}</span>
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
        <CampaignWizard
          teams={teams}
          agents={agents}
          onClose={() => setShowCreate(false)}
          onCreate={() => { qc.invalidateQueries({ queryKey: ['campaigns'] }); setShowCreate(false); }}
        />
      )}
    </AppLayout>
  );
}
