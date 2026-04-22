import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { teamsService, usersService } from '../../services/crm.service';
import AppLayout from '../../components/layout/AppLayout';
import toast from 'react-hot-toast';
import { Plus, Edit2, Users, X, RefreshCw, UserPlus, UserMinus } from 'lucide-react';

interface Team {
  id: string; name: string; description?: string;
  supervisorId: string | null;
  supervisor?: { id: string; name: string } | null;
  members: { id: string; name: string; email: string; status: string }[];
  _count: { members: number; leads: number };
}
interface User { id: string; name: string; email: string; role: string; teamId: string | null; }

// ── Team Modal ────────────────────────────────────────────────────────

function TeamModal({ team, supervisors, onClose, onSave }: {
  team?: Team | null; supervisors: User[];
  onClose: () => void; onSave: (data: Record<string, unknown>) => void;
}) {
  const [form, setForm] = useState({
    name: team?.name || '',
    description: team?.description || '',
    supervisorId: team?.supervisorId || '',
  });
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">{team ? 'Edit Team' : 'New Team'}</h2>
          <button className="btn-icon" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label className="form-label">Team Name</label>
            <input className="form-input" value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. North India Team" />
          </div>
          <div className="form-group">
            <label className="form-label">Description</label>
            <input className="form-input" value={form.description} onChange={e => set('description', e.target.value)} placeholder="Optional" />
          </div>
          <div className="form-group">
            <label className="form-label">Supervisor</label>
            <select className="form-input" value={form.supervisorId} onChange={e => set('supervisorId', e.target.value)}>
              <option value="">No supervisor</option>
              {supervisors.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={() => onSave({ ...form, supervisorId: form.supervisorId || null })}>
            {team ? 'Save Changes' : 'Create Team'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Member Manager ────────────────────────────────────────────────────

function MembersPanel({ team, agents, onAddMembers, onRemoveMembers }: {
  team: Team; agents: User[];
  onAddMembers: (ids: string[]) => void; onRemoveMembers: (ids: string[]) => void;
}) {
  const [addId, setAddId] = useState('');
  const unassignedAgents = agents.filter(a => !team.members.find(m => m.id === a.id) && a.role === 'agent');

  return (
    <div className="members-panel">
      <div className="members-panel__header">
        <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{team.name}</span>
        <span className="badge" style={{ background: '#1e293b', color: '#a78bfa' }}>{team._count.members} members</span>
      </div>
      {/* Current members */}
      <div style={{ marginBottom: 12 }}>
        {team.members.map(m => (
          <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
            <div className="avatar avatar--sm">{m.name.charAt(0)}</div>
            <span style={{ flex: 1, fontSize: '0.85rem', color: 'var(--text-primary)' }}>{m.name}</span>
            <span className="badge" style={{ background: m.status === 'active' ? '#14532d' : '#1e293b', color: m.status === 'active' ? '#22c55e' : '#64748b' }}>{m.status}</span>
            <button className="btn-icon" title="Remove" onClick={() => onRemoveMembers([m.id])} style={{ color: 'var(--red)' }}>
              <UserMinus size={14} />
            </button>
          </div>
        ))}
        {team.members.length === 0 && <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', padding: '8px 0' }}>No members yet</p>}
      </div>
      {/* Add member */}
      {unassignedAgents.length > 0 && (
        <div style={{ display: 'flex', gap: 8 }}>
          <select className="form-input" value={addId} onChange={e => setAddId(e.target.value)}>
            <option value="">Add agent…</option>
            {unassignedAgents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <button className="btn btn-primary" disabled={!addId} onClick={() => { onAddMembers([addId]); setAddId(''); }}>
            <UserPlus size={15} />
          </button>
        </div>
      )}
    </div>
  );
}

// ── Teams Page ────────────────────────────────────────────────────────

export default function TeamsPage() {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [editTeam, setEditTeam] = useState<Team | null>(null);
  const [expandedTeam, setExpandedTeam] = useState<string | null>(null);

  const { data: teamsData, isLoading } = useQuery({
    queryKey: ['teams'],
    queryFn: () => teamsService.list(),
  });

  const { data: usersData } = useQuery({
    queryKey: ['users', 'all-roles'],
    queryFn: () => usersService.list({ limit: 200 }),
  });

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => teamsService.create(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['teams'] }); toast.success('Team created'); setShowCreate(false); },
    onError: (e: Error) => toast.error(e.message || 'Failed'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) => teamsService.update(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['teams'] }); toast.success('Team updated'); setEditTeam(null); },
    onError: (e: Error) => toast.error(e.message || 'Failed'),
  });

  const addMembersMutation = useMutation({
    mutationFn: ({ teamId, agentIds }: { teamId: string; agentIds: string[] }) =>
      teamsService.addMembers(teamId, agentIds),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['teams'] }); toast.success('Member added'); },
  });

  const removeMembersMutation = useMutation({
    mutationFn: ({ teamId, agentIds }: { teamId: string; agentIds: string[] }) =>
      teamsService.removeMembers(teamId, agentIds),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['teams'] }); toast.success('Member removed'); },
  });

  const teams: Team[] = teamsData?.data?.data || [];
  const users: User[] = usersData?.data?.data?.users || [];
  const supervisors = users.filter(u => u.role === 'supervisor');
  const agents = users.filter(u => u.role === 'agent');

  return (
    <AppLayout>
      <div className="page-container">
        <div className="page-header">
          <div>
            <h1 className="page-title">Teams</h1>
            <p className="page-subtitle">{teams.length} teams · {agents.length} total agents</p>
          </div>
          <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
            <Plus size={16} /> New Team
          </button>
        </div>

        {isLoading && <div className="empty-state"><RefreshCw className="spin" size={20} /><p>Loading…</p></div>}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {teams.map(team => (
            <div key={team.id} className="card">
              {/* Team Header Row */}
              <div className="table-row" style={{ padding: '16px 20px', cursor: 'pointer' }}
                onClick={() => setExpandedTeam(expandedTeam === team.id ? null : team.id)}>
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{
                    width: 44, height: 44, borderRadius: 12, flexShrink: 0,
                    background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontWeight: 800, fontSize: '1.1rem', color: '#fff',
                  }}>
                    {team.name.charAt(0)}
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '1rem' }}>{team.name}</div>
                    {team.description && <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{team.description}</div>}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 24, alignItems: 'center' }}>
                  {team.supervisor && (
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Supervisor</div>
                      <div style={{ fontSize: '0.85rem', color: '#22d3ee' }}>{team.supervisor.name}</div>
                    </div>
                  )}
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-primary)' }}>{team._count.members}</div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Agents</div>
                  </div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button className="btn-icon" onClick={e => { e.stopPropagation(); setEditTeam(team); }}><Edit2 size={15} /></button>
                    <button className="btn-icon" onClick={e => { e.stopPropagation(); setExpandedTeam(expandedTeam === team.id ? null : team.id); }}>
                      <Users size={15} />
                    </button>
                  </div>
                </div>
              </div>

              {/* Expanded members panel */}
              {expandedTeam === team.id && (
                <div style={{ borderTop: '1px solid var(--border)', padding: 20, background: 'var(--bg-elevated)' }}>
                  <MembersPanel
                    team={team}
                    agents={agents}
                    onAddMembers={ids => addMembersMutation.mutate({ teamId: team.id, agentIds: ids })}
                    onRemoveMembers={ids => removeMembersMutation.mutate({ teamId: team.id, agentIds: ids })}
                  />
                </div>
              )}
            </div>
          ))}
          {!isLoading && teams.length === 0 && (
            <div className="empty-state" style={{ border: '1px dashed var(--border-subtle)', borderRadius: 14, padding: 48 }}>
              <Users size={36} style={{ opacity: 0.3 }} />
              <p>No teams yet. Create one to organize your agents.</p>
            </div>
          )}
        </div>
      </div>

      {(showCreate || editTeam) && (
        <TeamModal
          team={editTeam}
          supervisors={supervisors}
          onClose={() => { setShowCreate(false); setEditTeam(null); }}
          onSave={data => {
            if (editTeam) updateMutation.mutate({ id: editTeam.id, data });
            else createMutation.mutate(data);
          }}
        />
      )}
    </AppLayout>
  );
}
