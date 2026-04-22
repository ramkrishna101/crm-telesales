import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { tagsService } from '../../services/crm.service';
import AppLayout from '../../components/layout/AppLayout';
import toast from 'react-hot-toast';
import { Plus, Trash2, Edit2, X, RefreshCw, Lock } from 'lucide-react';

interface Tag {
  id: string; name: string; colour: string; isSystem: boolean;
  createdBy?: { id: string; name: string } | null;
}

const PRESET_COLOURS = [
  '#6366f1', '#22d3ee', '#22c55e', '#f59e0b', '#ef4444',
  '#a78bfa', '#34d399', '#fb923c', '#60a5fa', '#f472b6',
];

function TagModal({ tag, onClose, onSave }: {
  tag?: Tag | null; onClose: () => void;
  onSave: (name: string, colour: string) => void;
}) {
  const [name, setName] = useState(tag?.name || '');
  const [colour, setColour] = useState(tag?.colour || '#6366f1');

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 380 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">{tag ? 'Edit Tag' : 'New Disposition Tag'}</h2>
          <button className="btn-icon" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label className="form-label">Tag Name</label>
            <input className="form-input" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Interested, RNR, Callback…" />
          </div>
          <div className="form-group">
            <label className="form-label">Colour</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {PRESET_COLOURS.map(c => (
                <button key={c} onClick={() => setColour(c)} style={{
                  width: 30, height: 30, borderRadius: 8, background: c, border: 'none', cursor: 'pointer',
                  outline: colour === c ? `2px solid #fff` : 'none',
                  outlineOffset: 2, transform: colour === c ? 'scale(1.15)' : 'none',
                  transition: 'transform 0.12s',
                }} />
              ))}
              <input type="color" value={colour} onChange={e => setColour(e.target.value)}
                style={{ width: 30, height: 30, borderRadius: 8, border: 'none', cursor: 'pointer', padding: 0, background: 'none' }} />
            </div>
          </div>
          {/* Preview */}
          <div style={{ marginTop: 4 }}>
            <label className="form-label">Preview</label>
            <div style={{ marginTop: 6 }}>
              <span style={{
                display: 'inline-block', padding: '6px 16px', borderRadius: 100,
                border: `1px solid ${colour}`, color: colour, fontWeight: 600, fontSize: '0.85rem',
                background: colour + '22',
              }}>
                {name || 'Tag Name'}
              </span>
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={!name.trim()} onClick={() => onSave(name.trim(), colour)}>
            {tag ? 'Save Changes' : 'Create Tag'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function TagsPage() {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [editTag, setEditTag] = useState<Tag | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['tags'],
    queryFn: () => tagsService.list(),
  });

  const createMutation = useMutation({
    mutationFn: ({ name, colour }: { name: string; colour: string }) => tagsService.create(name, colour),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tags'] }); toast.success('Tag created'); setShowCreate(false); },
    onError: (e: Error) => toast.error(e.message || 'Failed'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, name, colour }: { id: string; name: string; colour: string }) => tagsService.update(id, { name, colour }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tags'] }); toast.success('Tag updated'); setEditTag(null); },
    onError: (e: Error) => toast.error(e.message || 'Failed'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => tagsService.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tags'] }); toast.success('Tag deleted'); },
    onError: (e: Error) => toast.error(e.message || 'Cannot delete system tags'),
  });

  const tags: Tag[] = data?.data?.data || [];
  const systemTags = tags.filter(t => t.isSystem);
  const customTags = tags.filter(t => !t.isSystem);

  return (
    <AppLayout>
      <div className="page-container">
        <div className="page-header">
          <div>
            <h1 className="page-title">Disposition Tags</h1>
            <p className="page-subtitle">{systemTags.length} system · {customTags.length} custom</p>
          </div>
          <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
            <Plus size={16} /> New Tag
          </button>
        </div>

        {isLoading && <div className="empty-state"><RefreshCw className="spin" size={20} /><p>Loading…</p></div>}

        {/* System Tags */}
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">System Tags</h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-muted)', fontSize: '0.8rem' }}>
              <Lock size={13} /> Read-only
            </div>
          </div>
          <div className="card-body" style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {systemTags.map(t => (
              <div key={t.id} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '8px 14px', borderRadius: 100,
                border: `1px solid ${t.colour}`, background: t.colour + '18',
              }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: t.colour, display: 'inline-block', flexShrink: 0 }} />
                <span style={{ color: t.colour, fontWeight: 600, fontSize: '0.875rem' }}>{t.name}</span>
                <Lock size={11} style={{ color: 'var(--text-muted)', marginLeft: 2 }} />
              </div>
            ))}
          </div>
        </div>

        {/* Custom Tags */}
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Custom Tags</h2>
            <span className="card-subtitle">Created by admins</span>
          </div>
          {customTags.length === 0 && (
            <div className="empty-state">
              <p>No custom tags yet. Create one to extend disposition options.</p>
            </div>
          )}
          {customTags.length > 0 && (
            <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: 0 }}>
              {customTags.map(t => (
                <div key={t.id} className="table-row" style={{ padding: '14px 20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1 }}>
                    <div style={{ width: 32, height: 32, borderRadius: 8, background: t.colour, flexShrink: 0 }} />
                    <div>
                      <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{t.name}</span>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 1 }}>
                        {t.createdBy?.name && `Created by ${t.createdBy.name}`}
                      </div>
                    </div>
                  </div>
                  {/* Live preview chip */}
                  <span style={{ padding: '4px 14px', borderRadius: 100, border: `1px solid ${t.colour}`, color: t.colour, background: t.colour + '22', fontWeight: 600, fontSize: '0.8rem', marginRight: 16 }}>
                    {t.name}
                  </span>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button className="btn-icon" onClick={() => setEditTag(t)}><Edit2 size={15} /></button>
                    <button className="btn-icon" style={{ color: 'var(--red)' }} onClick={() => deleteMutation.mutate(t.id)}><Trash2 size={15} /></button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {(showCreate || editTag) && (
        <TagModal
          tag={editTag}
          onClose={() => { setShowCreate(false); setEditTag(null); }}
          onSave={(name, colour) => {
            if (editTag) updateMutation.mutate({ id: editTag.id, name, colour });
            else createMutation.mutate({ name, colour });
          }}
        />
      )}
    </AppLayout>
  );
}
