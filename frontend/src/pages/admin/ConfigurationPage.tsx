import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import AppLayout from '../../components/layout/AppLayout';
import { branchesService, stringeePortalConfigsService } from '../../services/crm.service';
import { useAuthStore } from '../../store/authStore';
import toast from 'react-hot-toast';
import { Plus, Edit2, X } from 'lucide-react';

interface BranchRecord {
  id: string;
  name: string;
  code: string;
}

interface StringeePortalConfig {
  id: string;
  branchId: string;
  portalName: string;
  tenant: string;
  adminEmailMasked: string;
  createdAt: string;
  updatedAt: string;
}

interface PortalModalProps {
  portal?: StringeePortalConfig | null;
  branchId: string;
  onClose: () => void;
  onSave: (payload: Record<string, unknown>) => void;
  isSaving: boolean;
}

function PortalModal({ portal, branchId, onClose, onSave, isSaving }: PortalModalProps) {
  const isEdit = !!portal;
  const [form, setForm] = useState({
    portalName: portal?.portalName || '',
    tenant: portal?.tenant || '',
    apiSid: '',
    apiSecret: '',
    adminEmail: '',
    adminPassword: '',
  });

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 560 }} onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">{isEdit ? 'Edit Portal' : 'Add Portal'}</h2>
          <button className="btn-icon" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label className="form-label">Portal Name</label>
            <input className="form-input" value={form.portalName} onChange={(event) => setForm((current) => ({ ...current, portalName: event.target.value }))} placeholder="e.g. Portal A" />
          </div>
          <div className="form-group">
            <label className="form-label">StringeeX Tenant</label>
            <input className="form-input" value={form.tenant} onChange={(event) => setForm((current) => ({ ...current, tenant: event.target.value }))} placeholder="e.g. apextechnologies" />
          </div>
          <div className="form-group">
            <label className="form-label">Stringee API SID</label>
            <input className="form-input" value={form.apiSid} onChange={(event) => setForm((current) => ({ ...current, apiSid: event.target.value }))} placeholder={isEdit ? 'Leave blank to keep existing' : 'Required'} />
          </div>
          <div className="form-group">
            <label className="form-label">Stringee API Secret</label>
            <input className="form-input" value={form.apiSecret} onChange={(event) => setForm((current) => ({ ...current, apiSecret: event.target.value }))} placeholder={isEdit ? 'Leave blank to keep existing' : 'Required'} />
          </div>
          <div className="form-group">
            <label className="form-label">StringeeX Admin Email</label>
            <input className="form-input" type="email" value={form.adminEmail} onChange={(event) => setForm((current) => ({ ...current, adminEmail: event.target.value }))} placeholder={isEdit ? 'Leave blank to keep existing' : 'Required'} />
          </div>
          <div className="form-group">
            <label className="form-label">StringeeX Admin Password</label>
            <input className="form-input" type="password" value={form.adminPassword} onChange={(event) => setForm((current) => ({ ...current, adminPassword: event.target.value }))} placeholder={isEdit ? 'Leave blank to keep existing' : 'Required'} />
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button
            className="btn btn-primary"
            disabled={isSaving || !form.portalName.trim() || !form.tenant.trim() || (!isEdit && (!form.apiSid.trim() || !form.apiSecret.trim() || !form.adminEmail.trim() || !form.adminPassword))}
            onClick={() => {
              const payload: Record<string, unknown> = {
                branchId,
                portalName: form.portalName.trim(),
                tenant: form.tenant.trim(),
              };
              if (!isEdit || form.apiSid.trim()) payload.apiSid = form.apiSid.trim();
              if (!isEdit || form.apiSecret.trim()) payload.apiSecret = form.apiSecret.trim();
              if (!isEdit || form.adminEmail.trim()) payload.adminEmail = form.adminEmail.trim();
              if (!isEdit || form.adminPassword) payload.adminPassword = form.adminPassword;
              onSave(payload);
            }}
          >
            {isSaving ? 'Saving...' : isEdit ? 'Save Changes' : 'Add Portal'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ConfigurationPage() {
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const isSuperAdmin = user?.role === 'super_admin';
  const [selectedBranchId, setSelectedBranchId] = useState(user?.branchId || '');
  const [showCreate, setShowCreate] = useState(false);
  const [editingPortal, setEditingPortal] = useState<StringeePortalConfig | null>(null);

  const { data: branchesData } = useQuery({
    queryKey: ['branches'],
    queryFn: () => branchesService.list(),
    enabled: isSuperAdmin,
  });

  const branches = useMemo(() => (branchesData?.data?.data || []) as BranchRecord[], [branchesData]);

  useEffect(() => {
    if (user?.role === 'branch_admin' && user.branchId) {
      setSelectedBranchId(user.branchId);
      return;
    }
    if (isSuperAdmin && !selectedBranchId && branches.length) {
      setSelectedBranchId(branches[0].id);
    }
  }, [branches, isSuperAdmin, selectedBranchId, user?.branchId, user?.role]);

  const { data, isLoading } = useQuery({
    queryKey: ['stringee-portals', selectedBranchId],
    queryFn: () => stringeePortalConfigsService.list(selectedBranchId ? { branchId: selectedBranchId } : undefined),
    enabled: Boolean(selectedBranchId),
  });

  const configs = (data?.data?.data || []) as StringeePortalConfig[];

  const createMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) => stringeePortalConfigsService.create(payload),
    onSuccess: () => {
      toast.success('Portal configuration added');
      setShowCreate(false);
      queryClient.invalidateQueries({ queryKey: ['stringee-portals', selectedBranchId] });
    },
    onError: (error: any) => toast.error(error.response?.data?.error?.message || 'Failed to add portal configuration'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Record<string, unknown> }) => stringeePortalConfigsService.update(id, payload),
    onSuccess: () => {
      toast.success('Portal configuration updated');
      setEditingPortal(null);
      queryClient.invalidateQueries({ queryKey: ['stringee-portals', selectedBranchId] });
    },
    onError: (error: any) => toast.error(error.response?.data?.error?.message || 'Failed to update portal configuration'),
  });

  return (
    <AppLayout>
      <div className="page-container">
        <div className="page-header">
          <div>
            <h1 className="page-title">Configuration</h1>
            <p className="page-subtitle">Manage branch Stringee portal credentials and assignments.</p>
          </div>
          <button className="btn btn-primary" disabled={!selectedBranchId} onClick={() => setShowCreate(true)}>
            <Plus size={16} />
            Add Portal
          </button>
        </div>

        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-header">
            <h2 className="card-title">Branch Scope</h2>
          </div>
          <div className="card-body" style={{ paddingTop: 0 }}>
            {isSuperAdmin ? (
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Branch</label>
                <select className="form-input" value={selectedBranchId} onChange={(event) => setSelectedBranchId(event.target.value)}>
                  {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
                </select>
              </div>
            ) : (
              <div style={{ color: 'var(--text-secondary)' }}>Managing your branch configuration only.</div>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Configured Portals</h2>
          </div>
          <div className="table-header">
            <div className="table-col" style={{ flex: 1.4 }}>Portal</div>
            <div className="table-col">Tenant</div>
            <div className="table-col">Admin</div>
            <div className="table-col">Updated</div>
            <div className="table-col" style={{ textAlign: 'right' }}>Actions</div>
          </div>
          {isLoading && <div className="empty-state"><p>Loading configurations...</p></div>}
          {!isLoading && !configs.length && <div className="empty-state"><p>No portal configuration added for this branch.</p></div>}
          {!isLoading && configs.map((config) => (
            <div key={config.id} className="table-row">
              <div className="table-cell" style={{ flex: 1.4 }}>
                <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{config.portalName}</div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Configured</div>
              </div>
              <div className="table-cell" style={{ color: 'var(--text-secondary)' }}>{config.tenant}</div>
              <div className="table-cell" style={{ color: 'var(--text-secondary)' }}>{config.adminEmailMasked}</div>
              <div className="table-cell" style={{ color: 'var(--text-secondary)' }}>{new Date(config.updatedAt).toLocaleDateString()}</div>
              <div className="table-cell" style={{ justifyContent: 'flex-end' }}>
                <button className="btn btn-secondary" onClick={() => setEditingPortal(config)}>
                  <Edit2 size={15} />
                  Edit
                </button>
              </div>
            </div>
          ))}
        </div>

        {showCreate && selectedBranchId && (
          <PortalModal
            branchId={selectedBranchId}
            onClose={() => setShowCreate(false)}
            onSave={(payload) => createMutation.mutate(payload)}
            isSaving={createMutation.isPending}
          />
        )}

        {editingPortal && selectedBranchId && (
          <PortalModal
            portal={editingPortal}
            branchId={selectedBranchId}
            onClose={() => setEditingPortal(null)}
            onSave={(payload) => updateMutation.mutate({ id: editingPortal.id, payload })}
            isSaving={updateMutation.isPending}
          />
        )}
      </div>
    </AppLayout>
  );
}
