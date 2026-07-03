import { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import AppLayout from '../../components/layout/AppLayout';
import { usersService, whatsappService } from '../../services/crm.service';
import toast from 'react-hot-toast';
import QRCode from 'qrcode';
import { ArrowRight, RefreshCw, MessageSquare, QrCode, RotateCcw, Trash2, X } from 'lucide-react';

type Slot = {
  id: string;
  displayName: string;
  e164?: string | null;
  status: string;
  hidePhone?: boolean;
  branch?: { id: string; name: string } | null;
  assignedTo?: { id: string; name: string; email: string; role: string; status: string } | null;
  session?: { state: string; qrPayload?: string | null; qrExpiresAt?: string | null; lastHeartbeatAt?: string | null } | null;
};

export default function WhatsAppPage() {
  const qc = useQueryClient();
  const [selectedUserBySlot, setSelectedUserBySlot] = useState<Record<string, string>>({});
  const [qrSlotId, setQrSlotId] = useState<string>('');
  const [qrImage, setQrImage] = useState<string>('');

  const { data: slotsData, isLoading: slotsLoading } = useQuery({
    queryKey: ['whatsapp-slots'],
    queryFn: () => whatsappService.listSlots(),
    refetchInterval: 5000,
  });

  const { data: usersData } = useQuery({
    queryKey: ['users', 'whatsapp'],
    queryFn: () => usersService.list({ limit: 200 }),
  });

  const reassignMutation = useMutation({
    mutationFn: ({ slotId, userId }: { slotId: string; userId: string }) =>
      whatsappService.reassignSlot(slotId, userId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['whatsapp-slots'] });
      toast.success('WhatsApp slot reassigned');
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error?.message || 'Failed to reassign slot');
    },
  });

  const scanMutation = useMutation({
    mutationFn: (userId: string) => whatsappService.scanUser(userId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['whatsapp-slots'] });
      toast.success('WhatsApp QR refreshed');
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error?.message || 'Failed to refresh WhatsApp QR');
    },
  });

  const reconnectMutation = useMutation({
    mutationFn: (slotId: string) => whatsappService.reconnectSlot(slotId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['whatsapp-slots'] });
      toast.success('WhatsApp reconnect started');
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error?.message || 'Failed to reconnect WhatsApp slot');
    },
  });

  const terminateMutation = useMutation({
    mutationFn: (slotId: string) => whatsappService.terminateSlot(slotId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['whatsapp-slots'] });
      toast.success('WhatsApp slot deleted');
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error?.message || 'Failed to delete slot');
    },
  });

  const hidePhoneMutation = useMutation({
    mutationFn: ({ slotId, hidePhone }: { slotId: string; hidePhone: boolean }) =>
      whatsappService.setSlotHidePhone(slotId, hidePhone),
    onSuccess: (_res, vars) => {
      qc.invalidateQueries({ queryKey: ['whatsapp-slots'] });
      toast.success(vars.hidePhone ? 'Phone numbers hidden from agent' : 'Phone numbers visible to agent');
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error?.message || 'Failed to update setting');
    },
  });

  const slots: Slot[] = slotsData?.data?.data?.slots || [];
  const users = usersData?.data?.data?.users || [];

  const availableUsers = useMemo(() => users.filter((user: any) => user.role === 'agent' || user.role === 'supervisor' || user.role === 'branch_admin'), [users]);

  const renderSessionStatus = (slot: Slot) => {
    const state = slot.session?.state || 'created';
    const connected = state === 'connected';
    const connecting = state === 'connecting' || state === 'qr_ready';
    const color = connected ? '#22c55e' : connecting ? '#f59e0b' : '#ef4444';
    const label = connected ? 'Connected' : connecting ? (state === 'qr_ready' ? 'Waiting for QR scan' : 'Connecting…') : state === 'terminated' ? 'Not connected' : state;
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 7,
          padding: '4px 12px',
          borderRadius: 14,
          fontSize: 12.5,
          fontWeight: 600,
          background: `${color}14`,
          color,
          border: `1px solid ${color}33`,
          whiteSpace: 'nowrap',
        }}
      >
        <span style={{ position: 'relative', width: 8, height: 8, flexShrink: 0 }}>
          <span style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: color }} />
          <span className="wa-live-ping" style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: color }} />
        </span>
        {label}
      </span>
    );
  };

  const connectedCount = slots.filter((slot) => slot.session?.state === 'connected').length;

  const qrSlot = qrSlotId ? slots.find((slot) => slot.id === qrSlotId) : undefined;
  const qrPayload = qrSlot?.session?.qrPayload || '';

  useEffect(() => {
    let cancelled = false;
    if (!qrPayload) {
      setQrImage('');
      return;
    }
    QRCode.toDataURL(qrPayload, { errorCorrectionLevel: 'M', margin: 1, width: 240 })
      .then((dataUrl: string) => { if (!cancelled) setQrImage(dataUrl); })
      .catch(() => { if (!cancelled) setQrImage(''); });
    return () => { cancelled = true; };
  }, [qrPayload]);

  // Close the modal automatically once the slot connects.
  useEffect(() => {
    if (qrSlot?.session?.state === 'connected') {
      setQrSlotId('');
      toast.success('WhatsApp connected');
    }
  }, [qrSlot?.session?.state]);

  return (
    <AppLayout>
      <style>{`
        @keyframes waLivePing {
          0% { transform: scale(1); opacity: 0.7; }
          80% { transform: scale(2.6); opacity: 0; }
          100% { transform: scale(2.6); opacity: 0; }
        }
        .wa-live-ping { animation: waLivePing 1.6s cubic-bezier(0, 0, 0.2, 1) infinite; }
      `}</style>
      <div className="page-container">
        <div className="page-header">
          <div>
            <h1 className="page-title">WhatsApp</h1>
            <p className="page-subtitle">Manage phone slots, assignment, and session state.</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 7,
                padding: '5px 12px',
                borderRadius: 14,
                fontSize: 12.5,
                fontWeight: 600,
                background: connectedCount > 0 ? '#22c55e14' : '#ef444414',
                color: connectedCount > 0 ? '#22c55e' : '#ef4444',
                border: `1px solid ${connectedCount > 0 ? '#22c55e33' : '#ef444433'}`,
              }}
            >
              <span style={{ position: 'relative', width: 8, height: 8 }}>
                <span style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: connectedCount > 0 ? '#22c55e' : '#ef4444' }} />
                <span className="wa-live-ping" style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: connectedCount > 0 ? '#22c55e' : '#ef4444' }} />
              </span>
              {connectedCount > 0 ? `${connectedCount} live` : 'Offline'}
            </span>
            <div className="ops-pill">
              <MessageSquare size={14} style={{ marginRight: 6 }} />
              {slots.length} slot{slots.length === 1 ? '' : 's'}
            </div>
          </div>
        </div>

        <div className="card">
          <div className="table-header">
            <div className="table-col" style={{ flex: 2 }}>Phone Slot</div>
            <div className="table-col">Assigned User</div>
            <div className="table-col">Session</div>
            <div className="table-col">QR</div>
            <div className="table-col">Hide Phone</div>
            <div className="table-col">Actions</div>
          </div>
          {slotsLoading && <div className="empty-state"><RefreshCw className="spin" size={20} /><p>Loading WhatsApp slots…</p></div>}
          {!slotsLoading && slots.map((slot) => (
            <div key={slot.id} className="table-row">
              <div className="table-cell" style={{ flex: 2 }}>
                <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{slot.displayName}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  {slot.branch?.name || 'All branches'} · {slot.status}
                </div>
              </div>
              <div className="table-cell">
                {slot.assignedTo ? (
                  <div>
                    <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{slot.assignedTo.name}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{slot.assignedTo.email}</div>
                  </div>
                ) : (
                  <span style={{ color: 'var(--text-muted)' }}>Unassigned</span>
                )}
              </div>
              <div className="table-cell">
                {renderSessionStatus(slot)}
              </div>
              <div className="table-cell" style={{ fontSize: 12 }}>
                {slot.session?.qrPayload ? (
                  <button
                    type="button"
                    onClick={() => setQrSlotId(slot.id)}
                    style={{ border: 'none', background: 'transparent', color: '#2563eb', cursor: 'pointer', padding: 0, fontSize: 12, fontWeight: 600, textDecoration: 'underline' }}
                  >
                    Show QR
                  </button>
                ) : (
                  <span style={{ color: 'var(--text-secondary)' }}>Not prepared</span>
                )}
              </div>
              <div className="table-cell">
                <button
                  type="button"
                  title={slot.hidePhone ? 'Phone numbers hidden from agent — click to show' : 'Phone numbers visible — click to hide from agent'}
                  disabled={hidePhoneMutation.isPending}
                  onClick={() => hidePhoneMutation.mutate({ slotId: slot.id, hidePhone: !slot.hidePhone })}
                  style={{
                    border: 'none',
                    cursor: 'pointer',
                    width: 42,
                    height: 24,
                    borderRadius: 12,
                    position: 'relative',
                    background: slot.hidePhone ? '#22c55e' : '#cbd5e1',
                    transition: 'background 0.15s ease',
                    padding: 0,
                    flexShrink: 0,
                  }}
                >
                  <span
                    style={{
                      position: 'absolute',
                      top: 3,
                      left: slot.hidePhone ? 21 : 3,
                      width: 18,
                      height: 18,
                      borderRadius: '50%',
                      background: '#ffffff',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
                      transition: 'left 0.15s ease',
                    }}
                  />
                </button>
              </div>
              <div className="table-cell" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <select
                  className="form-input"
                  value={selectedUserBySlot[slot.id] || slot.assignedTo?.id || ''}
                  onChange={(e) => setSelectedUserBySlot((current) => ({ ...current, [slot.id]: e.target.value }))}
                  style={{ maxWidth: 180 }}
                >
                  <option value="">Select user</option>
                  {availableUsers.map((user: any) => <option key={user.id} value={user.id}>{user.name}</option>)}
                </select>
                <button
                  className="btn-icon"
                  title="Reassign slot"
                  disabled={reassignMutation.isPending}
                  onClick={() => {
                    const userId = selectedUserBySlot[slot.id] || slot.assignedTo?.id;
                    if (!userId) return toast.error('Pick a user first');
                    reassignMutation.mutate({ slotId: slot.id, userId });
                  }}
                >
                  <ArrowRight size={15} />
                </button>
                <button
                  className="btn-icon"
                  title="Show / refresh QR"
                  disabled={scanMutation.isPending}
                  onClick={() => {
                    if (!slot.assignedTo?.id) return toast.error('Assign the slot first');
                    setQrSlotId(slot.id);
                    if (slot.session?.state !== 'qr_ready' || !slot.session?.qrPayload) {
                      scanMutation.mutate(slot.assignedTo.id);
                    }
                  }}
                >
                  <QrCode size={15} />
                </button>
                <button
                  className="btn-icon"
                  title="Reconnect"
                  disabled={reconnectMutation.isPending}
                  onClick={() => reconnectMutation.mutate(slot.id)}
                >
                  <RotateCcw size={15} />
                </button>
                <button
                  className="btn-icon"
                  title="Delete slot"
                  style={{ color: '#ef4444' }}
                  disabled={terminateMutation.isPending}
                  onClick={() => terminateMutation.mutate(slot.id)}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          ))}
          {!slotsLoading && slots.length === 0 && (
            <div className="empty-state"><p>No WhatsApp slots yet. Use the scan button in Users to create one.</p></div>
          )}
        </div>

        {qrSlot ? (
          <div className="modal-overlay" onClick={() => setQrSlotId('')}>
            <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
              <div className="modal-header">
                <h2 className="modal-title">Scan QR: {qrSlot.displayName}</h2>
                <button className="btn-icon" onClick={() => setQrSlotId('')}><X size={18} /></button>
              </div>
              <div className="modal-body">
                <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 0 }}>
                  Open WhatsApp on the phone: Settings → Linked devices → Link a device, then scan this code.
                </p>
                <div style={{ display: 'grid', placeItems: 'center', minHeight: 260 }}>
                  {qrImage ? (
                    <img src={qrImage} alt="WhatsApp QR code" style={{ width: 240, height: 240, imageRendering: 'pixelated' }} />
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-secondary)' }}>
                      <RefreshCw className="spin" size={16} />
                      {scanMutation.isPending ? 'Preparing QR…' : 'Waiting for QR from WhatsApp…'}
                    </div>
                  )}
                </div>
                <p style={{ color: 'var(--text-muted)', fontSize: 12, textAlign: 'center' }}>
                  QR refreshes automatically. This window closes once connected.
                </p>
              </div>
              <div className="modal-footer">
                <button
                  className="btn btn-secondary"
                  disabled={scanMutation.isPending || !qrSlot.assignedTo?.id}
                  onClick={() => qrSlot.assignedTo?.id && scanMutation.mutate(qrSlot.assignedTo.id)}
                >
                  Refresh QR
                </button>
                <button className="btn btn-secondary" onClick={() => setQrSlotId('')}>Close</button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </AppLayout>
  );
}