import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { usersService, teamsService, stringeePortalConfigsService } from '../../services/crm.service';
import AppLayout from '../../components/layout/AppLayout';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import { useAuthStore } from '../../store/authStore';
import toast from 'react-hot-toast';
import { Plus, RefreshCw, Search, UserX, UserCheck, Edit2, X, Key, Clock, Trash2 } from 'lucide-react';

const USERS_PAGE_SIZE = 10;

type UserRole = 'super_admin' | 'branch_admin' | 'supervisor' | 'agent';
type UserStatus = 'active' | 'inactive' | 'on_break' | 'offline';

interface User {
  id: string; name: string; email: string;
  stringeeEmail?: string | null;
  stringeeAccountId?: string | null;
  stringeePortalConfigId?: string | null;
  stringeePortalConfig?: { id: string; portalName: string } | null;
  role: UserRole; status: UserStatus; teamId: string | null;
  branch?: { id: string; name: string } | null;
  team?: { id: string; name: string } | null; createdAt: string;
}
interface Team { id: string; name: string; }
interface PortalConfig { id: string; portalName: string; }

// ── Modal ─────────────────────────────────────────────────────────────

function UserModal({
  user, teams, branchId, onClose, onSave,
}: { user?: User | null; teams: Team[]; branchId?: string | null; onClose: () => void; onSave: (data: Record<string, unknown>) => void; }) {
  const isEdit = !!user;
  const qc = useQueryClient();
  const authBranchId = useAuthStore((state) => state.user?.branchId || null);
  const effectiveBranchId = user?.branch?.id || branchId || authBranchId;
  const initialStringeeEmail = user?.stringeeEmail || '';
  const initialPortalConfigId = user?.stringeePortalConfigId || user?.stringeePortalConfig?.id || '';
  const [form, setForm] = useState({
    name: user?.name || '',
    email: user?.email || '',
    stringeeEmail: user?.stringeeEmail || '',
    stringeePortalConfigId: user?.stringeePortalConfigId || user?.stringeePortalConfig?.id || '',
    password: '',
    role: user?.role || 'agent' as UserRole,
    teamId: user?.teamId || '',
    status: user?.status || 'offline' as UserStatus,
    stringeeAccountId: user?.stringeeAccountId || '',
  });

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const { data: portalsData } = useQuery({
    queryKey: ['stringee-portals', effectiveBranchId],
    queryFn: () => stringeePortalConfigsService.list(effectiveBranchId ? { branchId: effectiveBranchId } : undefined),
    enabled: Boolean(effectiveBranchId),
  });

  const portals: PortalConfig[] = portalsData?.data?.data || [];

  useEffect(() => {
    if (!form.stringeePortalConfigId && portals.length === 1) {
      set('stringeePortalConfigId', portals[0].id);
    }
  }, [form.stringeePortalConfigId, portals]);

  const syncMutation = useMutation({
    mutationFn: () => usersService.syncStringee(user!.id),
    onSuccess: (res) => {
      const acc = res.data?.data?.stringeeAccountId as string | null | undefined;
      if (acc) {
        setForm((f) => ({ ...f, stringeeAccountId: acc }));
        toast.success(`Linked to Stringee agent ${acc}`);
      } else {
        toast.error('Stringee did not return an account ID for that email');
      }
      qc.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.error?.message || err?.message || 'Sync failed';
      toast.error(msg);
    },
  });

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
            name: form.name, email: form.email, stringeeEmail: form.stringeeEmail || null, role: form.role,
            teamId: form.teamId || null, status: form.status,
            stringeePortalConfigId: form.stringeePortalConfigId || null,
            stringeeAccountId: form.stringeeAccountId.trim() || null,
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
            <div className="form-group">
              <label className="form-label">Stringee Email</label>
              <input
                className="form-input"
                type="email"
                value={form.stringeeEmail}
                onChange={(e) => setForm((current) => ({
                  ...current,
                  stringeeEmail: e.target.value,
                  stringeeAccountId: isEdit && e.target.value !== initialStringeeEmail ? '' : current.stringeeAccountId,
                }))}
                placeholder="agent-stringee@company.com"
              />
            </div>
            <div className="form-group">
              <label className="form-label">Portal</label>
              <select
                className="form-input"
                value={form.stringeePortalConfigId}
                onChange={(e) => setForm((current) => ({
                  ...current,
                  stringeePortalConfigId: e.target.value,
                  stringeeAccountId: isEdit && e.target.value !== initialPortalConfigId ? '' : current.stringeeAccountId,
                }))}
                disabled={!effectiveBranchId || portals.length === 0}
              >
                <option value="">{portals.length ? 'Select portal' : 'No portal configured'}</option>
                {portals.map((portal) => <option key={portal.id} value={portal.id}>{portal.portalName}</option>)}
              </select>
              <div style={{ fontSize: 11, color: '#666', marginTop: 4 }}>
                {portals.length
                  ? portals.length === 1
                    ? 'The only configured portal is selected by default.'
                    : 'Choose which Stringee portal this user belongs to.'
                  : 'No branch portal configured yet. Dialing will show No dialer available.'}
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Stringee Account ID</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  className="form-input"
                  value={form.stringeeAccountId}
                  onChange={(e) => set('stringeeAccountId', e.target.value)}
                  placeholder={isEdit ? 'Click Re-sync to fetch from StringeeX' : 'Auto-linked after save'}
                  style={{ flex: 1 }}
                />
                {isEdit && form.stringeeAccountId && (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => set('stringeeAccountId', '')}
                    title="Clear Stringee Account ID"
                  >
                    Clear
                  </button>
                )}
                {isEdit && (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={!form.stringeeEmail || !form.stringeePortalConfigId || syncMutation.isPending}
                    onClick={() => syncMutation.mutate()}
                    title="Re-fetch this user's account_id from StringeeX"
                  >
                    {syncMutation.isPending ? 'Syncing…' : 'Re-sync'}
                  </button>
                )}
              </div>
              <div style={{ fontSize: 11, color: '#666', marginTop: 4 }}>
                Auto-resolved from <strong>Stringee Email</strong> on save. No password needed.
              </div>
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
                  <option value="branch_admin">Admin</option>
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
  const authUser = useAuthStore((state) => state.user);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [page, setPage] = useState(1);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [resetUser, setResetUser] = useState<User | null>(null);
  const [breakUser, setBreakUser] = useState<User | null>(null);
  const [deleteUser, setDeleteUser] = useState<User | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const { data: usersData, isLoading } = useQuery({
    queryKey: ['users', roleFilter],
    queryFn: () => usersService.list({ limit: 200, ...(roleFilter ? { role: roleFilter } : {}) }),
  });

  const { data: teamsData } = useQuery({
    queryKey: ['teams'],
    queryFn: () => teamsService.list(),
  });

  const apiErr = (e: any, fallback: string): string => {
    const err = e?.response?.data?.error;
    if (err?.details?.length) {
      return err.details.map((d: any) => `${d.path}: ${d.message}`).join(' | ');
    }
    return err?.message || e?.message || fallback;
  };

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => usersService.create(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['users'] }); toast.success('User created'); setShowCreate(false); },
    onError: (e: any) => toast.error(apiErr(e, 'Failed to create user')),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) => usersService.update(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['users'] }); toast.success('User updated'); setEditUser(null); },
    onError: (e: any) => toast.error(apiErr(e, 'Failed to update user')),
  });

  const deactivateMutation = useMutation({
    mutationFn: (id: string) => usersService.update(id, { status: 'inactive' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['users'] }); toast.success('User deactivated'); },
    onError: (e: any) => toast.error(apiErr(e, 'Failed')),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => usersService.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['users'] }); toast.success('User deleted'); setDeleteUser(null); },
    onError: (e: any) => toast.error(apiErr(e, 'Failed to delete user')),
  });

  const resetPasswordMutation = useMutation({
    mutationFn: ({ id, password }: { id: string; password: string }) =>
      usersService.resetPassword(id, password),
    onSuccess: (res) => {
      toast.success(res.data.data.message || 'Password reset successful');
      setResetUser(null);
    },
    onError: (e: any) => toast.error(apiErr(e, 'Failed to reset password')),
  });

  const users: User[] = usersData?.data?.data?.users || [];
  const teams: Team[] = teamsData?.data?.data || [];
  const filtered = users.filter(
    (u) => u.name.toLowerCase().includes(search.toLowerCase()) || u.email.toLowerCase().includes(search.toLowerCase())
  );
  const totalPages = Math.max(1, Math.ceil(filtered.length / USERS_PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paginatedUsers = filtered.slice((currentPage - 1) * USERS_PAGE_SIZE, currentPage * USERS_PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [search, roleFilter]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const roleColour: Record<string, string> = { super_admin: '#4f46e5', branch_admin: '#6366f1', supervisor: '#22d3ee', agent: '#22c55e' };
  const roleLabel: Record<UserRole, string> = {
    super_admin: 'Super Admin',
    branch_admin: 'Admin',
    supervisor: 'Supervisor',
    agent: 'Agent',
  };
  const statusTone: Record<UserStatus, { background: string; color: string; label: string }> = {
    active: { background: '#e9f8ef', color: '#1f9d55', label: 'Active' },
    inactive: { background: '#f3f4f8', color: '#6b7280', label: 'Inactive' },
    on_break: { background: '#fff4df', color: '#c67a0a', label: 'On Break' },
    offline: { background: '#eef2f7', color: '#64748b', label: 'Offline' },
  };

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
            {['', 'branch_admin', 'supervisor', 'agent'].map((r) => (
              <button key={r} className={`filter-tab ${roleFilter === r ? 'filter-tab--active' : ''}`} onClick={() => setRoleFilter(r)}>
                {r === 'branch_admin' ? 'Admin' : r || 'All'}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        <div className="card">
          <div className="table-header">
            <div className="table-col" style={{ flex: 2 }}>User</div>
            <div className="table-col">Role</div>
            <div className="table-col">Branch</div>
            <div className="table-col">Team</div>
            <div className="table-col">Status</div>
            <div className="table-col">Joined</div>
            <div className="table-col">Actions</div>
          </div>
          {isLoading && <div className="empty-state"><RefreshCw className="spin" size={20} /><p>Loading…</p></div>}
          {paginatedUsers.map((u) => (
            <div key={u.id} className="table-row">
              <div className="table-cell" style={{ flex: 2, display: 'flex', gap: 10, alignItems: 'center' }}>
                <div className="avatar avatar--sm">{u.name.charAt(0)}</div>
                <div>
                  <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{u.name}</div>
                  <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>{u.email}</div>
                  {u.stringeeEmail && <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>Stringee: {u.stringeeEmail}</div>}
                  {u.stringeePortalConfig?.portalName && <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>Portal: {u.stringeePortalConfig.portalName}</div>}
                  {u.stringeeAccountId && <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>Account ID: {u.stringeeAccountId}</div>}
                </div>
              </div>
              <div className="table-cell">
                <span className="badge" style={{ background: roleColour[u.role] + '22', color: roleColour[u.role] }}>{roleLabel[u.role]}</span>
              </div>
              <div className="table-cell" style={{ color: 'var(--text-secondary)' }}>{u.branch?.name || '—'}</div>
              <div className="table-cell" style={{ color: 'var(--text-secondary)' }}>{u.team?.name || '—'}</div>
              <div className="table-cell">
                <span className="badge" style={statusTone[u.status]}>
                  {statusTone[u.status].label}
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
                <button
                  className="btn-icon"
                  title="Delete user"
                  style={{ color: '#ef4444' }}
                  onClick={() => setDeleteUser(u)}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          ))}
          {!isLoading && filtered.length === 0 && (
            <div className="empty-state"><p>No users found</p></div>
          )}
        </div>

        {!isLoading && filtered.length > 0 && (
          <div className="pagination">
            <button
              className="btn btn-secondary"
              disabled={currentPage === 1}
              onClick={() => setPage((value) => Math.max(1, value - 1))}
            >
              Previous
            </button>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              Page {currentPage} of {totalPages}
            </span>
            <button
              className="btn btn-secondary"
              disabled={currentPage === totalPages}
              onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
            >
              Next
            </button>
          </div>
        )}
      </div>

      {(showCreate || editUser) && (
        <UserModal
          user={editUser}
          teams={teams}
          branchId={editUser?.branch?.id || authUser?.branchId || null}
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

      <ConfirmDialog
        open={!!deleteUser}
        title="Delete user?"
        message={
          <>
            Are you sure you want to delete <strong>{deleteUser?.name}</strong>?
            {'\n\n'}This hides them from all listings. Their leads and call history are preserved, and the email can be reused for a new account.
          </>
        }
        confirmLabel="Delete user"
        variant="danger"
        loading={deleteMutation.isPending}
        onConfirm={() => deleteUser && deleteMutation.mutate(deleteUser.id)}
        onCancel={() => setDeleteUser(null)}
      />
    </AppLayout>
  );
}
