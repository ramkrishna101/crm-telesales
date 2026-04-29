import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { usersService, teamsService } from '../../services/crm.service';
import AppLayout from '../../components/layout/AppLayout';
import toast from 'react-hot-toast';
import { Plus, RefreshCw, Search, UserX, UserCheck, Edit2, X, Key, Clock } from 'lucide-react';

type UserRole = 'admin' | 'supervisor' | 'agent';
type UserStatus = 'active' | 'inactive' | 'on_break' | 'offline';

interface User {
  id: string; name: string; email: string;
  role: UserRole; status: UserStatus; teamId: string | null;
  team?: { id: string; name: string } | null; createdAt: string;
}
interface Team { id: string; name: string; }

// ── Modal ─────────────────────────────────────────────────────────────

function UserModal({
  user, teams, onClose, onSave,
}: { user?: User | null; teams: Team[]; onClose: () => void; onSave: (data: Record<string, unknown>) => void; }) {
  const isEdit = !!user;
  const [form, setForm] = useState({
    name: user?.name || '',
    email: user?.email || '',
    password: '',
    role: user?.role || 'agent' as UserRole,
    teamId: user?.teamId || '',
    status: user?.status || 'offline' as UserStatus,
  });

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <form onSubmit={(e) => {
          e.preventDefault();
          if (form.role === 'agent' && !form.teamId) {
            toast.error('Agents must be assigned to a team/supervisor.');
            return;
          }
          if (!form.name || !form.email) {
            toast.error('Name and email are required.');
            return;
          }
          onSave({
            name: form.name, email: form.email, role: form.role,
            teamId: form.teamId || null, status: form.status,
            ...(form.password ? { password: form.password } : {}),
          });
        }}>
          <div className="modal-header">
            <h2 className="modal-title">{isEdit ? 'Edit User' : 'Create User'}</h2>
            <button type="button" className="btn-icon" onClick={onClose}><X size={18} /></button>
          </div>
          <div className="modal-body">
            <div className="form-group">
              <label className="form-label">Full Name</label>
              <input className="form-input" value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="John Doe" />
            </div>
            <div className="form-group">
              <label className="form-label">Email</label>
              <input className="form-input" type="email" value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="john@company.com" />
            </div>
            {!isEdit && (
              <div className="form-group">
                <label className="form-label">Password</label>
                <input className="form-input" type="password" value={form.password} onChange={(e) => set('password', e.target.value)} placeholder="Min. 6 characters" />
              </div>
            )}
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Role</label>
                <select className="form-input" value={form.role} onChange={(e) => set('role', e.target.value)}>
                  <option value="admin">Admin</option>
                  <option value="supervisor">Supervisor</option>
                  <option value="agent">Agent</option>
                </select>
              </div>
              {isEdit && (
                <div className="form-group">
                  <label className="form-label">Status</label>
                  <select className="form-input" value={form.status} onChange={(e) => set('status', e.target.value)}>
                    <option value="active">Active</option>
                    <option value="offline">Offline</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
              )}
            </div>
            <div className="form-group">
              <label className="form-label">
                Team {form.role === 'agent' ? <span style={{ color: '#ef4444' }}>*</span> : <span style={{ color: 'var(--text-muted)' }}>(optional)</span>}
              </label>
              <select className="form-input" value={form.teamId} onChange={(e) => set('teamId', e.target.value)}>
                <option value="">No team</option>
                {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              {form.role === 'agent' && !form.teamId && (
                <p style={{ fontSize: '0.75rem', color: '#ef4444', marginTop: 4 }}>Agents must be assigned to a team/supervisor.</p>
              )}
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary">
              {isEdit ? 'Save Changes' : 'Create User'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ResetPasswordModal({
  user, onClose, onSave,
}: { user: User; onClose: () => void; onSave: (password: string) => void; }) {
  const [password, setPassword] = useState('');

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 400 }}>
        <div className="modal-header">
          <h2 className="modal-title">Reset Password</h2>
          <button className="btn-icon" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="modal-body">
          <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: 16 }}>
            Set a new password for <strong>{user.name}</strong>.
            This will invalidate all current active sessions for this user.
          </p>
          <div className="form-group">
            <label className="form-label">New Password</label>
            <input
              className="form-input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Min. 6 characters"
              autoFocus
            />
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button
            className="btn btn-primary"
            disabled={password.length < 6}
            onClick={() => onSave(password)}
          >
            Reset Password
          </button>
        </div>
      </div>
    </div>
  );
}

function BreakHistoryModal({
  user, onClose,
}: { user: User; onClose: () => void; }) {
  const { data: breaksData, isLoading } = useQuery({
    queryKey: ['breaks', user.id],
    queryFn: () => usersService.getBreaks(user.id),
  });

  const breaks = breaksData?.data?.data || [];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 500, maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
        <div className="modal-header">
          <h2 className="modal-title">Break History: {user.name}</h2>
          <button className="btn-icon" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="modal-body" style={{ overflowY: 'auto', flex: 1, padding: '0 24px 24px' }}>
          {isLoading ? (
            <div className="empty-state"><RefreshCw className="spin" size={20} /><p>Loading breaks…</p></div>
          ) : breaks.length === 0 ? (
            <div className="empty-state"><p>No break history found for this agent.</p></div>
          ) : (
            <div className="table-responsive">
              <div className="table-header">
                <div className="table-col">Started</div>
                <div className="table-col">Ended</div>
                <div className="table-col">Duration</div>
              </div>
              {breaks.map((b: any) => {
                const start = new Date(b.startedAt);
                const end = b.endedAt ? new Date(b.endedAt) : null;
                const durMs = end ? end.getTime() - start.getTime() : Date.now() - start.getTime();
                const durMins = Math.floor(durMs / 60000);
                return (
                  <div key={b.id} className="table-row">
                    <div className="table-cell" style={{ color: 'var(--text-primary)' }}>
                      {start.toLocaleDateString()} <span style={{ color: 'var(--text-secondary)' }}>{start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                    <div className="table-cell" style={{ color: 'var(--text-primary)' }}>
                      {end ? end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : <span style={{ color: '#eab308' }}>Active</span>}
                    </div>
                    <div className="table-cell" style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                      {durMins} mins
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Users Page ────────────────────────────────────────────────────────

export default function UsersPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [editUser, setEditUser] = useState<User | null>(null);
  const [resetUser, setResetUser] = useState<User | null>(null);
  const [breakUser, setBreakUser] = useState<User | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const { data: usersData, isLoading } = useQuery({
    queryKey: ['users', roleFilter],
    queryFn: () => usersService.list({ limit: 200, ...(roleFilter ? { role: roleFilter } : {}) }),
  });

  const { data: teamsData } = useQuery({
    queryKey: ['teams'],
    queryFn: () => teamsService.list(),
  });

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => usersService.create(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['users'] }); toast.success('User created'); setShowCreate(false); },
    onError: (e: Error) => toast.error(e.message || 'Failed to create user'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) => usersService.update(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['users'] }); toast.success('User updated'); setEditUser(null); },
    onError: (e: Error) => toast.error(e.message || 'Failed to update user'),
  });

  const deactivateMutation = useMutation({
    mutationFn: (id: string) => usersService.deactivate(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['users'] }); toast.success('User deactivated'); },
    onError: (e: Error) => toast.error(e.message || 'Failed'),
  });

  const resetPasswordMutation = useMutation({
    mutationFn: ({ id, password }: { id: string; password: string }) =>
      usersService.resetPassword(id, password),
    onSuccess: (res) => {
      toast.success(res.data.data.message || 'Password reset successful');
      setResetUser(null);
    },
    onError: (e: Error) => toast.error(e.message || 'Failed to reset password'),
  });

  const users: User[] = usersData?.data?.data?.users || [];
  const teams: Team[] = teamsData?.data?.data || [];
  const filtered = users.filter(
    (u) => u.name.toLowerCase().includes(search.toLowerCase()) || u.email.toLowerCase().includes(search.toLowerCase())
  );

  const roleColour: Record<string, string> = { admin: '#6366f1', supervisor: '#22d3ee', agent: '#22c55e' };

  return (
    <AppLayout>
      <div className="page-container">
        <div className="page-header">
          <div>
            <h1 className="page-title">Users</h1>
            <p className="page-subtitle">{users.length} total · {users.filter(u => u.status === 'active').length} active</p>
          </div>
          <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
            <Plus size={16} /> Add User
          </button>
        </div>

        {/* Filters */}
        <div className="filter-bar">
          <div className="search-box">
            <Search size={15} className="search-icon" />
            <input className="search-input" placeholder="Search users…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="filter-tabs">
            {['', 'admin', 'supervisor', 'agent'].map((r) => (
              <button key={r} className={`filter-tab ${roleFilter === r ? 'filter-tab--active' : ''}`} onClick={() => setRoleFilter(r)}>
                {r || 'All'}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        <div className="card">
          <div className="table-header">
            <div className="table-col" style={{ flex: 2 }}>User</div>
            <div className="table-col">Role</div>
            <div className="table-col">Team</div>
            <div className="table-col">Status</div>
            <div className="table-col">Joined</div>
            <div className="table-col">Actions</div>
          </div>
          {isLoading && <div className="empty-state"><RefreshCw className="spin" size={20} /><p>Loading…</p></div>}
          {filtered.map((u) => (
            <div key={u.id} className="table-row">
              <div className="table-cell" style={{ flex: 2, display: 'flex', gap: 10, alignItems: 'center' }}>
                <div className="avatar avatar--sm">{u.name.charAt(0)}</div>
                <div>
                  <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{u.name}</div>
                  <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>{u.email}</div>
                </div>
              </div>
              <div className="table-cell">
                <span className="badge" style={{ background: roleColour[u.role] + '22', color: roleColour[u.role] }}>{u.role}</span>
              </div>
              <div className="table-cell" style={{ color: 'var(--text-secondary)' }}>{u.team?.name || '—'}</div>
              <div className="table-cell">
                <span className="badge" style={{ 
                  background: u.status === 'active' ? '#14532d' : u.status === 'on_break' ? '#a16207' : u.status === 'offline' ? '#334155' : '#1e293b', 
                  color: u.status === 'active' ? '#22c55e' : u.status === 'on_break' ? '#fde047' : u.status === 'offline' ? '#cbd5e1' : '#64748b' 
                }}>
                  {u.status === 'on_break' ? 'On Break' : u.status === 'offline' ? 'Offline' : u.status}
                </span>
              </div>
              <div className="table-cell" style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>
                {new Date(u.createdAt).toLocaleDateString()}
              </div>
              <div className="table-cell" style={{ display: 'flex', gap: 4 }}>
                <button className="btn-icon" title="Edit" onClick={() => setEditUser(u)}><Edit2 size={15} /></button>
                <button className="btn-icon" title="Reset Password" onClick={() => setResetUser(u)}><Key size={15} /></button>
                {u.role === 'agent' && (
                  <button className="btn-icon" title="View Break History" onClick={() => setBreakUser(u)}><Clock size={15} /></button>
                )}
                {(u.status === 'active' || u.status === 'on_break' || u.status === 'offline')
                  ? <button className="btn-icon" title="Deactivate" onClick={() => deactivateMutation.mutate(u.id)}><UserX size={15} /></button>
                  : <button className="btn-icon" title="Reactivate" onClick={() => updateMutation.mutate({ id: u.id, data: { status: 'active' } })}><UserCheck size={15} /></button>
                }
              </div>
            </div>
          ))}
          {!isLoading && filtered.length === 0 && (
            <div className="empty-state"><p>No users found</p></div>
          )}
        </div>
      </div>

      {(showCreate || editUser) && (
        <UserModal
          user={editUser}
          teams={teams}
          onClose={() => { setShowCreate(false); setEditUser(null); }}
          onSave={(data) => {
            if (editUser) updateMutation.mutate({ id: editUser.id, data });
            else createMutation.mutate(data);
          }}
        />
      )}

      {resetUser && (
        <ResetPasswordModal
          user={resetUser}
          onClose={() => setResetUser(null)}
          onSave={(password) => resetPasswordMutation.mutate({ id: resetUser.id, password })}
        />
      )}

      {breakUser && (
        <BreakHistoryModal
          user={breakUser}
          onClose={() => setBreakUser(null)}
        />
      )}
    </AppLayout>
  );
}
