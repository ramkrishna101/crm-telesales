import { useState } from 'react';
import type { ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import AppLayout from '../../components/layout/AppLayout';
import { branchesService } from '../../services/crm.service';
import toast from 'react-hot-toast';
import { Building2, Users, FolderOpen, UserCheck, Plus, Edit2, X } from 'lucide-react';

interface BranchRecord {
  id: string;
  name: string;
  code: string;
  status: 'active' | 'inactive';
  branchAdmin?: { id: string; name: string; email: string; status: string } | null;
  _count: {
    users: number;
    teams: number;
    campaigns: number;
    leads: number;
  };
}

interface BranchModalProps {
  branch?: BranchRecord | null;
  onClose: () => void;
  onSave: (data: Record<string, unknown>) => void;
  isSaving: boolean;
}

const initialForm = {
  name: '',
  code: '',
  status: 'active' as 'active' | 'inactive',
  adminName: '',
  adminEmail: '',
  adminPassword: '',
};

function BranchModal({ branch, onClose, onSave, isSaving }: BranchModalProps) {
  const [form, setForm] = useState({
    name: branch?.name || '',
    code: branch?.code || '',
    status: branch?.status || 'active',
    adminName: '',
    adminEmail: '',
    adminPassword: '',
  });

  const isEdit = !!branch;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 520 }} onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">{isEdit ? 'Edit Branch' : 'Create Branch'}</h2>
          <button className="btn-icon" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label className="form-label">Branch Name</label>
            <input
              className="form-input"
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              placeholder="e.g. Mumbai East"
            />
          </div>
          <div className="form-group">
            <label className="form-label">Branch Code</label>
            <input
              className="form-input"
              value={form.code}
              onChange={(event) => setForm((current) => ({ ...current, code: event.target.value.toLowerCase() }))}
              placeholder="e.g. mumbai-east"
            />
          </div>
          {isEdit && (
            <div className="form-group">
              <label className="form-label">Status</label>
              <select
                className="form-input"
                value={form.status}
                onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as 'active' | 'inactive' }))}
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
          )}
          {!isEdit && (
            <>
              <div className="form-group">
                <label className="form-label">Branch Admin Name</label>
                <input
                  className="form-input"
                  value={form.adminName}
                  onChange={(event) => setForm((current) => ({ ...current, adminName: event.target.value }))}
                  placeholder="Optional"
                />
              </div>
              <div className="form-group">
                <label className="form-label">Branch Admin Email</label>
                <input
                  className="form-input"
                  type="email"
                  value={form.adminEmail}
                  onChange={(event) => setForm((current) => ({ ...current, adminEmail: event.target.value }))}
                  placeholder="Optional"
                />
              </div>
              <div className="form-group">
                <label className="form-label">Branch Admin Password</label>
                <input
                  className="form-input"
                  type="password"
                  value={form.adminPassword}
                  onChange={(event) => setForm((current) => ({ ...current, adminPassword: event.target.value }))}
                  placeholder="Optional"
                />
              </div>
            </>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button
            className="btn btn-primary"
            disabled={isSaving || !form.name.trim() || !form.code.trim()}
            onClick={() => {
              const payload: Record<string, unknown> = {
                name: form.name.trim(),
                code: form.code.trim(),
                ...(isEdit ? { status: form.status } : {}),
              };

              if (!isEdit && form.adminName && form.adminEmail && form.adminPassword) {
                payload.admin = {
                  name: form.adminName.trim(),
                  email: form.adminEmail.trim(),
                  password: form.adminPassword,
                };
              }

              onSave(payload);
            }}
          >
            {isSaving ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Branch'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function BranchesPage() {
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [editingBranch, setEditingBranch] = useState<BranchRecord | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['branches'],
    queryFn: () => branchesService.list(),
  });

  const createBranch = useMutation({
    mutationFn: (payload: Record<string, unknown>) => branchesService.create(payload),
    onSuccess: () => {
      toast.success('Branch created');
      setShowCreate(false);
      queryClient.invalidateQueries({ queryKey: ['branches'] });
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error?.message || 'Failed to create branch');
    },
  });

  const updateBranch = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Record<string, unknown> }) =>
      branchesService.update(id, payload),
    onSuccess: () => {
      toast.success('Branch updated');
      setEditingBranch(null);
      queryClient.invalidateQueries({ queryKey: ['branches'] });
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error?.message || 'Failed to update branch');
    },
  });

  const branches = (data?.data?.data || []) as BranchRecord[];

  return (
    <AppLayout>
      <div className="page-container">
        <div className="page-header">
          <div>
            <h1 className="page-title">Branches</h1>
            <p className="page-subtitle">Create and manage branch-level admins and segregated operations.</p>
          </div>
          <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
            <Plus size={16} />
            Create Branch
          </button>
        </div>

        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Branch List</h2>
          </div>
          <div className="table-header">
            <div className="table-col" style={{ flex: 1.6 }}>Branch</div>
            <div className="table-col" style={{ flex: 1.5 }}>Admin</div>
            <div className="table-col">Users</div>
            <div className="table-col">Teams</div>
            <div className="table-col">Campaigns</div>
            <div className="table-col">Leads</div>
            <div className="table-col">Status</div>
            <div className="table-col" style={{ textAlign: 'right' }}>Actions</div>
          </div>
          {isLoading && <div className="empty-state"><p>Loading branches...</p></div>}
          {!isLoading && branches.length === 0 && <div className="empty-state"><p>No branches created yet.</p></div>}
          {!isLoading && branches.map((branch) => (
            <div key={branch.id} className="table-row">
              <div className="table-cell" style={{ flex: 1.6 }}>
                <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{branch.name}</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{branch.code}</div>
              </div>
              <div className="table-cell" style={{ flex: 1.5, color: 'var(--text-secondary)' }}>
                {branch.branchAdmin ? (
                  <>
                    <div style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{branch.branchAdmin.name}</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{branch.branchAdmin.email}</div>
                  </>
                ) : 'Not assigned'}
              </div>
              <div className="table-cell">{branch._count.users}</div>
              <div className="table-cell">{branch._count.teams}</div>
              <div className="table-cell">{branch._count.campaigns}</div>
              <div className="table-cell">{branch._count.leads}</div>
              <div className="table-cell">
                <span className="badge" style={{ background: branch.status === 'active' ? '#22c55e22' : '#64748b22', color: branch.status === 'active' ? '#22c55e' : '#64748b' }}>
                  {branch.status}
                </span>
              </div>
              <div className="table-cell" style={{ justifyContent: 'flex-end' }}>
                <button className="btn btn-secondary" onClick={() => setEditingBranch(branch)}>
                  <Edit2 size={15} />
                  Edit
                </button>
              </div>
            </div>
          ))}
        </div>

        {showCreate && (
          <BranchModal
            onClose={() => setShowCreate(false)}
            onSave={(payload) => createBranch.mutate(payload)}
            isSaving={createBranch.isPending}
          />
        )}
        {editingBranch && (
          <BranchModal
            branch={editingBranch}
            onClose={() => setEditingBranch(null)}
            onSave={(payload) => updateBranch.mutate({ id: editingBranch.id, payload })}
            isSaving={updateBranch.isPending}
          />
        )}
      </div>
    </AppLayout>
  );
}

function Stat({ icon, label, value }: { icon: ReactNode; label: string; value: number }) {
  return (
    <div style={{ padding: 12, borderRadius: 14, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-secondary)', marginBottom: 6 }}>
        {icon}
        <span style={{ fontSize: '0.78rem' }}>{label}</span>
      </div>
      <div style={{ fontSize: '1.15rem', fontWeight: 700 }}>{value}</div>
    </div>
  );
}