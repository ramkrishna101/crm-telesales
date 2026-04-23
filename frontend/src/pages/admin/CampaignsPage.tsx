import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { campaignsService, teamsService, usersService, leadsService } from '../../services/crm.service';
import AppLayout from '../../components/layout/AppLayout';
import toast from 'react-hot-toast';
import {
  Plus, X, BarChart2, Pause, Play, Eye,
  RefreshCw, ChevronRight, ChevronLeft,
  Users2, Building2, CheckCircle2, UserPlus, UserMinus,
  Upload, FileSpreadsheet, FileText, CheckCircle, TrendingUp, PhoneCall, Users
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
// Campaign Stats Modal
// ─────────────────────────────────────────────────────────────────────────────

function CampaignStatsModal({ campaignId, onClose }: { campaignId: string, onClose: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ['campaign-stats', campaignId],
    queryFn: () => campaignsService.stats(campaignId),
  });

  const stats = data?.data?.data;

  if (isLoading) return (
    <div className="modal-overlay"><div className="modal-content"><div className="empty-state">Loading stats...</div></div></div>
  );

  const dispositions = [
    { key: 'lead', label: 'Interested', color: 'var(--green)' },
    { key: 'invalid', label: 'Invalid Number', color: 'var(--red)' },
    { key: 'callback', label: 'Callback', color: 'var(--accent)' },
    { key: 'rnr', label: 'RNR', color: 'var(--purple)' },
    { key: 'dnd', label: 'DND', color: 'var(--red-dark)' },
    { key: 'not_interested', label: 'Not Interested', color: 'var(--text-muted)' },
    { key: 'busy', label: 'Busy', color: 'var(--orange)' },
  ];

  const maxVal = Math.max(...dispositions.map(d => stats.leadsByStatus[d.key] || 0), 1);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal--wide" onClick={e => e.stopPropagation()} style={{ maxWidth: 800 }}>
        <div className="modal-header">
          <div>
            <h2 className="modal-title">Campaign Analytics</h2>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Real-time performance overview</p>
          </div>
          <button className="btn-icon" onClick={onClose}><X size={18} /></button>
        </div>

        <div className="modal-body">
          {/* Summary Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24 }}>
            <div style={{ background: 'var(--bg-elevated)', padding: '20px', borderRadius: 12, border: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Total Contacted</span>
                <PhoneCall size={16} style={{ color: 'var(--accent)' }} />
              </div>
              <div style={{ fontSize: '2.2rem', fontWeight: 800, lineHeight: 1, color: 'var(--text-primary)', marginBottom: 8 }}>{stats.totalContacted}</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>out of {stats.totalLeads} total leads</div>
            </div>

            <div style={{ background: 'var(--bg-elevated)', padding: '20px', borderRadius: 12, border: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Conversions</span>
                <TrendingUp size={16} style={{ color: 'var(--green)' }} />
              </div>
              <div style={{ fontSize: '2.2rem', fontWeight: 800, lineHeight: 1, color: 'var(--green)', marginBottom: 8 }}>{stats.leadsByStatus['lead'] || 0}</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Interested customers</div>
            </div>

            <div style={{ background: 'var(--bg-elevated)', padding: '20px', borderRadius: 12, border: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Conv. Rate</span>
                <BarChart2 size={16} style={{ color: 'var(--purple)' }} />
              </div>
              <div style={{ fontSize: '2.2rem', fontWeight: 800, lineHeight: 1, color: 'var(--text-primary)', marginBottom: 8 }}>{stats.conversionRate}</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Contacted to Interested</div>
            </div>
          </div>

          {/* Disposition Breakdown (Matching user image) */}
          <div style={{ background: 'var(--bg-elevated)', padding: 24, borderRadius: 12, border: '1px solid var(--border-subtle)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 700 }}>Call Dispositions</h3>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Last 30 days</span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {dispositions.map(d => {
                const count = stats.leadsByStatus[d.key] || 0;
                const pct = (count / maxVal) * 100;
                return (
                  <div key={d.key} style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    <div style={{ width: 120, fontSize: '0.85rem', fontWeight: 500, color: 'var(--text-secondary)' }}>{d.label}</div>
                    <div style={{ flex: 1, height: 8, background: 'rgba(255,255,255,0.05)', borderRadius: 10, position: 'relative', overflow: 'hidden' }}>
                      <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${pct}%`, background: d.color || 'var(--accent)', borderRadius: 10, transition: 'width 0.6s ease' }} />
                    </div>
                    <div style={{ width: 40, textAlign: 'right', fontWeight: 700, fontSize: '0.9rem' }}>{count}</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Agent Performance Table */}
          {stats.agentPerformance && stats.agentPerformance.length > 0 && (
            <div style={{ background: 'var(--bg-elevated)', padding: 24, borderRadius: 12, border: '1px solid var(--border-subtle)', marginTop: 24 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 700 }}>Agent Performance</h3>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Top dialers</span>
              </div>
              <div className="table-responsive" style={{ overflowX: 'auto' }}>
                <table className="data-table" style={{ width: '100%', minWidth: '800px', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                      <th style={{ padding: '12px 16px', textAlign: 'left', whiteSpace: 'nowrap' }}>Agent Name</th>
                      <th style={{ padding: '12px 16px', textAlign: 'right', whiteSpace: 'nowrap' }}>Calls</th>
                      <th style={{ padding: '12px 16px', textAlign: 'right', color: 'var(--green)', whiteSpace: 'nowrap' }}>Conn.</th>
                      <th style={{ padding: '12px 16px', textAlign: 'right', color: 'var(--purple)', whiteSpace: 'nowrap' }}>Conv %</th>
                      <th style={{ padding: '12px 16px', textAlign: 'right', whiteSpace: 'nowrap' }}>Int.</th>
                      <th style={{ padding: '12px 16px', textAlign: 'right', whiteSpace: 'nowrap' }}>CB</th>
                      <th style={{ padding: '12px 16px', textAlign: 'right', whiteSpace: 'nowrap' }}>Not Int.</th>
                      <th style={{ padding: '12px 16px', textAlign: 'right', whiteSpace: 'nowrap' }}>RNR</th>
                      <th style={{ padding: '12px 16px', textAlign: 'right', whiteSpace: 'nowrap' }}>Busy</th>
                      <th style={{ padding: '12px 16px', textAlign: 'right', whiteSpace: 'nowrap' }}>DND</th>
                      <th style={{ padding: '12px 16px', textAlign: 'right', whiteSpace: 'nowrap' }}>Inv.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.agentPerformance.map((agent: any) => {
                      const connectRate = agent.connected > 0 ? ((agent.interested / agent.connected) * 100).toFixed(1) : 0;
                      return (
                        <tr key={agent.agentId} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                          <td style={{ padding: '12px 16px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                              <div className="avatar avatar--sm">{agent.name.charAt(0)}</div>
                              <span style={{ fontWeight: 500, whiteSpace: 'nowrap' }}>{agent.name}</span>
                            </div>
                          </td>
                          <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 600 }}>{agent.calls}</td>
                          <td style={{ padding: '12px 16px', textAlign: 'right', color: 'var(--green)', fontWeight: 600 }}>{agent.connected}</td>
                          <td style={{ padding: '12px 16px', textAlign: 'right', color: 'var(--purple)', fontWeight: 600 }}>{connectRate}%</td>
                          <td style={{ padding: '12px 16px', textAlign: 'right', color: 'var(--green)' }}>{agent.interested}</td>
                          <td style={{ padding: '12px 16px', textAlign: 'right', color: 'var(--accent)' }}>{agent.callback}</td>
                          <td style={{ padding: '12px 16px', textAlign: 'right', color: 'var(--text-muted)' }}>{agent.notInterested}</td>
                          <td style={{ padding: '12px 16px', textAlign: 'right', color: 'var(--purple)' }}>{agent.rnr}</td>
                          <td style={{ padding: '12px 16px', textAlign: 'right', color: 'var(--orange)' }}>{agent.busy}</td>
                          <td style={{ padding: '12px 16px', textAlign: 'right', color: 'var(--red-dark)' }}>{agent.dnd}</td>
                          <td style={{ padding: '12px 16px', textAlign: 'right', color: 'var(--red)' }}>{agent.invalid}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <div className="modal-footer" style={{ justifyContent: 'center' }}>
          <button className="btn btn-secondary" onClick={onClose} style={{ minWidth: 120 }}>Close Analytics</button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Wizard Modal (Updated to include Data Upload)
// ─────────────────────────────────────────────────────────────────────────────

function CampaignWizard({ teams, agents, onClose, onCreate }: {
  teams: Team[];
  agents: User[];
  onClose: () => void;
  onCreate: (campaignId: string) => void;
}) {
  const qc = useQueryClient();
  const [step, setStep] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  
  const [form, setForm] = useState({
    name: '', description: '', type: 'standard', priority: 'normal', teamId: '',
  });
  const [selectedAgents, setSelectedAgents] = useState<string[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const teamMembers = form.teamId
    ? agents.filter(a => a.teamId === form.teamId)
    : agents;

  const handleCreateAndFinish = async () => {
    setIsProcessing(true);
    try {
      const createRes = await campaignsService.create({ ...form, teamId: form.teamId || null });
      const campaignId = createRes.data.data.campaign?.id || createRes.data.data.id;

      if (selectedAgents.length > 0) {
        await campaignsService.addAgents(campaignId, selectedAgents);
      }

      if (file) {
        toast.loading('Uploading lead data...', { id: 'upload' });
        await leadsService.upload(campaignId, file);
        toast.success('Campaign created and leads uploaded!', { id: 'upload' });
      } else {
        toast.success('Campaign created successfully');
      }

      qc.invalidateQueries({ queryKey: ['campaigns'] });
      onCreate(campaignId);
      onClose();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Something went wrong');
    } finally {
      setIsProcessing(false);
    }
  };

  const toggleAgent = (id: string) =>
    setSelectedAgents(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);

  const toggleAll = () =>
    setSelectedAgents(s => s.length === teamMembers.length ? [] : teamMembers.map(a => a.id));

  const handleNext = () => {
    if (step === 0) {
      if (!form.name.trim()) { toast.error('Campaign name is required'); return; }
      setStep(1);
    } else if (step === 1) {
      setStep(2);
    } else if (step === 2) {
      handleCreateAndFinish();
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal--wide" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">Create New Campaign</h2>
          <button className="btn-icon" onClick={onClose}><X size={18} /></button>
        </div>

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

        <div className="modal-body" style={{ minHeight: 340 }}>
          {step === 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div className="form-group">
                <label className="form-label">Campaign Name <span style={{ color: '#ef4444' }}>*</span></label>
                <input className="form-input" value={form.name} onChange={e => set('name', e.target.value)}
                  placeholder="e.g. Q4 Real Estate Leads" autoFocus />
              </div>
              <div className="form-group">
                <label className="form-label">Description</label>
                <textarea className="form-input" rows={2} value={form.description}
                  onChange={e => set('description', e.target.value)} placeholder="Target audience and campaign goals..." />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Type</label>
                  <select className="form-input" value={form.type} onChange={e => set('type', e.target.value)}>
                    <option value="standard">Standard</option>
                    <option value="vip">VIP (Priority Queue)</option>
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

          {step === 1 && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: 24 }}>
              <div>
                <label className="form-label" style={{ marginBottom: 12, display: 'block' }}>1. Select a Team</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <label className={`team-option ${!form.teamId ? 'team-option--selected' : ''}`}
                    onClick={() => { set('teamId', ''); setSelectedAgents([]); }}>
                    <div className="team-option__radio">{!form.teamId && <div className="team-option__radio-dot" />}</div>
                    <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>Individual Assignment</div>
                  </label>
                  {teams.map(t => (
                    <label key={t.id} className={`team-option ${form.teamId === t.id ? 'team-option--selected' : ''}`}
                      onClick={() => { set('teamId', t.id); setSelectedAgents([]); }}>
                      <div className="team-option__radio">{form.teamId === t.id && <div className="team-option__radio-dot" />}</div>
                      <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{t.name}</div>
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                  <label className="form-label" style={{ margin: 0 }}>2. Select Agents</label>
                  <button className="btn-link" style={{ fontSize: '0.75rem', color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer' }} onClick={toggleAll}>
                    {selectedAgents.length === teamMembers.length ? 'Deselect All' : 'Select All'}
                  </button>
                </div>
                <div style={{ maxHeight: 240, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {teamMembers.map(a => (
                    <div key={a.id} className={`agent-option ${selectedAgents.includes(a.id) ? 'agent-option--selected' : ''}`}
                      onClick={() => toggleAgent(a.id)} style={{ padding: '8px 12px' }}>
                      <div className="avatar avatar--sm" style={{ width: 28, height: 28, fontSize: '0.75rem' }}>{a.name.charAt(0)}</div>
                      <div style={{ flex: 1, marginLeft: 10, fontSize: '0.85rem', fontWeight: 500 }}>{a.name}</div>
                      {selectedAgents.includes(a.id) && <CheckCircle size={16} style={{ color: 'var(--accent)' }} />}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '20px 0', gap: 20 }}>
              <div style={{ textAlign: 'center' }}>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: 8 }}>Final Step: Import Leads</h3>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Upload your CSV or Excel file to populate the campaign immediately.</p>
              </div>

              <div 
                onClick={() => fileInputRef.current?.click()}
                style={{ 
                  width: '100%', 
                  maxWidth: 400, 
                  height: 180, 
                  border: '2px dashed var(--border)', 
                  borderRadius: 16, 
                  display: 'flex', 
                  flexDirection: 'column', 
                  alignItems: 'center', 
                  justifyContent: 'center',
                  gap: 12,
                  cursor: 'pointer',
                  background: file ? 'var(--accent-subtle)' : 'transparent',
                  borderColor: file ? 'var(--accent)' : 'var(--border)',
                  transition: 'all 0.2s'
                }}
              >
                {file ? (
                  <>
                    <FileSpreadsheet size={40} style={{ color: 'var(--accent)' }} />
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>{file.name}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{(file.size / 1024).toFixed(1)} KB</div>
                    </div>
                    <button className="btn btn-secondary btn-sm" onClick={(e) => { e.stopPropagation(); setFile(null); }}>Remove</button>
                  </>
                ) : (
                  <>
                    <Upload size={40} style={{ color: 'var(--text-muted)' }} />
                    <div style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>Click to browse CSV/XLSX</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>You can also skip this and upload later</div>
                  </>
                )}
              </div>
              <input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls" style={{ display: 'none' }} onChange={e => setFile(e.target.files?.[0] || null)} />
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={() => step === 0 ? onClose() : setStep(s => s - 1)}>
            {step === 0 ? 'Cancel' : 'Back'}
          </button>
          <div style={{ flex: 1 }} />
          <button className="btn btn-primary" disabled={isProcessing} onClick={handleNext}>
            {isProcessing ? 'Processing...' : (
              step === 2 ? (file ? 'Create & Import Data' : 'Create Campaign') : (
                <>Next Step <ChevronRight size={16} /></>
              )
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

const STEPS = [
  { label: 'Details',     icon: <Building2 size={15} /> },
  { label: 'Assignment',  icon: <Users2 size={15} /> },
  { label: 'Data Upload', icon: <Upload size={15} /> },
];

// ─────────────────────────────────────────────────────────────────────────────
// Campaigns Page
// ─────────────────────────────────────────────────────────────────────────────

export default function CampaignsPage() {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [selectedStatsId, setSelectedStatsId] = useState<string | null>(null);
  const [editTeamId, setEditTeamId] = useState<string | null>(null);
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
            <Plus size={16} /> Create Campaign
          </button>
        </div>

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

        {isLoading && <div className="empty-state"><RefreshCw className="spin" size={20} /><p>Loading…</p></div>}
        <div className="campaign-grid">
          {campaigns.map((c) => (
            <div key={c.id} className="campaign-card" onClick={() => setSelectedStatsId(c.id)} style={{ cursor: 'pointer' }}>
              <div className="campaign-card__header">
                <div style={{ flex: 1 }}>
                  <div className="campaign-card__name">{c.name}</div>
                  {c.description && <div className="campaign-card__desc">{c.description}</div>}
                </div>
                <div style={{ display: 'flex', gap: 4 }} onClick={e => e.stopPropagation()}>
                  {c.status === 'active'
                    ? <button className="btn-icon" title="Pause" onClick={() => updateMutation.mutate({ id: c.id, data: { status: 'paused' } })}><Pause size={15} /></button>
                    : c.status === 'paused'
                      ? <button className="btn-icon" title="Resume" onClick={() => updateMutation.mutate({ id: c.id, data: { status: 'active' } })}><Play size={15} /></button>
                      : null
                  }
                  <button className="btn-icon" title="Change Team" onClick={() => setEditTeamId(c.id)}><Users size={15} /></button>
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

      {selectedStatsId && (
        <CampaignStatsModal 
          campaignId={selectedStatsId} 
          onClose={() => setSelectedStatsId(null)} 
        />
      )}

      {editTeamId && (
        <div className="modal-overlay" onClick={() => setEditTeamId(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Reassign Campaign Team</h2>
              <button className="btn-icon" onClick={() => setEditTeamId(null)}><X size={18} /></button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 16 }}>
                Warning: Changing the team will revoke access for all current agents and unassign any leads they are currently working on (returning them to the unassigned pool).
              </p>
              <div className="form-group">
                <label className="form-label">Select New Team</label>
                <select className="form-input" 
                  defaultValue={campaigns.find(c => c.id === editTeamId)?.teamId || ''}
                  onChange={(e) => {
                    if (window.confirm("Are you sure you want to reassign this campaign? This action affects current lead assignments.")) {
                      updateMutation.mutate({ id: editTeamId, data: { teamId: e.target.value || null } });
                      setEditTeamId(null);
                    }
                  }}
                >
                  <option value="">-- No Team (Individual Agents) --</option>
                  {teams.map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
