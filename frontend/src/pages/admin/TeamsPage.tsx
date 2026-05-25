import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { teamsService, usersService } from '../../services/crm.service';
import AppLayout from '../../components/layout/AppLayout';
import toast from 'react-hot-toast';
import { Plus, Edit2, Users, X, RefreshCw, UserPlus, UserMinus, Search } from 'lucide-react';

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
  const unassignedAgents = agents.filter(a => !(team.members || []).find(m => m.id === a.id) && a.role === 'agent');
  const memberStatusTone: Record<string, { background: string; color: string; label: string }> = {
    active: { background: '#e9f8ef', color: '#1f9d55', label: 'Active' },
    offline: { background: '#eef2f7', color: '#64748b', label: 'Offline' },
    inactive: { background: '#f3f4f8', color: '#6b7280', label: 'Inactive' },
    on_break: { background: '#fff4df', color: '#c67a0a', label: 'On Break' },
  };

  return (
    <div className="members-panel">
      <div className="members-panel__header">
        <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{team.name}</span>
        <span className="badge" style={{ background: '#efeefe', color: '#635bff' }}>{team._count.members} members</span>
      </div>
      {/* Current members */}
      <div style={{ marginBottom: 12 }}>
        {team.members?.map(m => (
          <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
            <div className="avatar avatar--sm">{m.name.charAt(0)}</div>
            <span style={{ flex: 1, fontSize: '0.85rem', color: 'var(--text-primary)' }}>{m.name}</span>
            <span className="badge" style={memberStatusTone[m.status] || memberStatusTone.offline}>
              {(memberStatusTone[m.status] || memberStatusTone.offline).label}
            </span>
            <button className="btn-icon" title="Remove" onClick={() => onRemoveMembers([m.id])} style={{ color: 'var(--red)' }}>
              <UserMinus size={14} />
            </button>
          </div>
        ))}
        {(!team.members || team.members.length === 0) && <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', padding: '8px 0' }}>No members yet</p>}
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
  const [search, setSearch] = useState('');

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
  const filteredTeams = teams.filter((team) => {
    const query = search.trim().toLowerCase();
    if (!query) return true;

    return team.name.toLowerCase().includes(query)
      || (team.description || '').toLowerCase().includes(query)
      || (team.supervisor?.name || '').toLowerCase().includes(query);
  });

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

        <div className="filter-bar">
          <div className="search-box">
            <Search size={15} className="search-icon" />
            <input
              className="search-input"
              placeholder="Search teams..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {isLoading && <div className="empty-state"><RefreshCw className="spin" size={20} /><p>Loading…</p></div>}

        {!isLoading && filteredTeams.length > 0 && (
          <div className="card">
            <div className="table-header">
              <div className="table-col" style={{ flex: 2 }}>Team</div>
              <div className="table-col">Supervisor</div>
              <div className="table-col">Members</div>
              <div className="table-col">Leads</div>
              <div className="table-col">Description</div>
              <div className="table-col">Actions</div>
            </div>

            {filteredTeams.map((team) => (
              <div key={team.id}>
                <div
                  className="table-row"
                  style={{ cursor: 'pointer' }}
                  onClick={() => setExpandedTeam(expandedTeam === team.id ? null : team.id)}
                >
                  <div className="table-cell" style={{ flex: 2, display: 'flex', gap: 12, alignItems: 'center' }}>
                    <div className="avatar">{team.name.charAt(0)}</div>
                    <div>
                      <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{team.name}</div>
                      <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                        {expandedTeam === team.id ? 'Hide members' : 'View members'}
                      </div>
                    </div>
                  </div>
                    <div className="table-cell" style={{ color: team.supervisor ? '#5f6bff' : 'var(--text-muted)', fontWeight: team.supervisor ? 600 : 500 }}>
                    {team.supervisor?.name || 'Unassigned'}
                  </div>
                  <div className="table-cell" style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
                    {team._count.members}
                  </div>
                  <div className="table-cell" style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
                    {team._count.leads}
                  </div>
                  <div className="table-cell" style={{ color: 'var(--text-secondary)' }}>
                    {team.description || 'No description'}
                  </div>
                  <div className="table-cell" style={{ display: 'flex', gap: 4 }} onClick={(e) => e.stopPropagation()}>
                    <button className="btn-icon" title="Edit" onClick={() => setEditTeam(team)}><Edit2 size={15} /></button>
                    <button className="btn-icon" title="Manage Members" onClick={() => setExpandedTeam(expandedTeam === team.id ? null : team.id)}>
                      <Users size={15} />
                    </button>
                  </div>
                </div>

                {expandedTeam === team.id && (
                  <div style={{ borderTop: '1px solid var(--border)', padding: 20, background: '#fafafe' }}>
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
          </div>
        )}

        {!isLoading && filteredTeams.length === 0 && (
          <div className="empty-state card">
            <p>{search.trim() ? 'No teams match that search.' : 'No teams yet. Create one to organize your agents.'}</p>
          </div>
        )}
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
