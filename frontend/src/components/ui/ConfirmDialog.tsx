import { AlertTriangle, X } from 'lucide-react';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'primary';
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'danger',
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!open) return null;

  const accent = variant === 'danger' ? '#ef4444' : '#6366f1';

  return (
    <div className="modal-overlay" onClick={loading ? undefined : onCancel}>
      <div
        className="modal"
        style={{ maxWidth: 420 }}
        onClick={(e) => e.stopPropagation()}
        role="alertdialog"
        aria-modal="true"
      >
        <div className="modal-header">
          <h2 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 32,
                height: 32,
                borderRadius: 8,
                background: accent + '22',
                color: accent,
              }}
            >
              <AlertTriangle size={18} />
            </span>
            {title}
          </h2>
          <button className="btn-icon" onClick={onCancel} disabled={loading}>
            <X size={18} />
          </button>
        </div>
        <div className="modal-body">
          <div style={{ fontSize: '0.9rem', lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{message}</div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onCancel} disabled={loading}>
            {cancelLabel}
          </button>
          <button
            className="btn btn-primary"
            onClick={onConfirm}
            disabled={loading}
            style={
              variant === 'danger'
                ? { background: accent, borderColor: accent }
                : undefined
            }
          >
            {loading ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ConfirmDialog;
