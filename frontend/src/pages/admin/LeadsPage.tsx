import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { leadsService, usersService, campaignsService } from '../../services/crm.service';
import AppLayout from '../../components/layout/AppLayout';
import toast from 'react-hot-toast';
import { Upload, Search, UserCheck, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react';

interface Lead {
  id: string; name: string | null; phone?: string; email: string | null;
  status: string; priority: string; isDnd: boolean;
  assignedToId: string | null; assignedTo?: { id: string; name: string } | null;
  campaignId: string; lastCalledAt: string | null; createdAt: string;
}

// ── Upload Panel ──────────────────────────────────────────────────────

function UploadPanel({ campaignId, onDone }: { campaignId: string; onDone: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [progress, setProgress] = useState<Record<string, unknown> | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const uploadMutation = useMutation({
    mutationFn: (f: File) => leadsService.upload(campaignId, f),
    onSuccess: async (res) => {
      const id = res.data.data.jobId as string;
      setJobId(id);
      toast.success('Upload queued');
      // Poll status
      const poll = setInterval(async () => {
        const s = await leadsService.uploadStatus(id);
        setProgress(s.data.data);
        if (s.data.data.status === 'done' || s.data.data.status === 'error') {
          clearInterval(poll);
          if (s.data.data.status === 'done') { toast.success(`Imported ${s.data.data.inserted} leads`); onDone(); }
        }
      }, 1200);
    },
    onError: () => toast.error('Upload failed'),
  });

  return (
    <div className="upload-panel">
      <div className="upload-drop" onClick={() => fileRef.current?.click()}>
        <Upload size={28} style={{ color: 'var(--accent)' }} />
        <div style={{ fontWeight: 600 }}>{file ? file.name : 'Drop CSV or Excel here'}</div>
        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Supports .csv, .xlsx, .xls — max 50MB</div>
      </div>
      <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" style={{ display: 'none' }} onChange={(e) => setFile(e.target.files?.[0] || null)} />
      {file && !jobId && (
        <button className="btn btn-primary" style={{ width: '100%' }} onClick={() => uploadMutation.mutate(file)}>
          {uploadMutation.isPending ? 'Uploading…' : `Upload ${file.name}`}
        </button>
      )}
      {progress && (
        <div className="upload-progress">
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
              {progress.status === 'done' ? '✅ Complete' : progress.status === 'error' ? '❌ Error' : '⏳ Processing…'}
            </span>
            <span style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: '0.85rem' }}>
              {typeof progress.inserted === 'number' ? `${progress.inserted}/${progress.total}` : ''}
            </span>
          </div>
          <div className="progress-bar-wrap">
            <div className="progress-bar" style={{ width: `${(progress.progress as number) || (progress.status === 'done' ? 100 : 0)}%` }} />
          </div>
          {progress.status === 'done' && (
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 6 }}>
              {progress.inserted as number} inserted · {progress.skipped as number} DND skipped · {progress.invalid as number} invalid
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Leads Page ────────────────────────────────────────────────────────

export default function LeadsPage() {
  const qc = useQueryClient();
  const [campaignFilter, setCampaignFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [showUpload, setShowUpload] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const LIMIT = 50;

  const { data: leadsData, isLoading } = useQuery({
    queryKey: ['leads', page, campaignFilter, statusFilter],
    queryFn: () => leadsService.list({ page, limit: LIMIT, ...(campaignFilter ? { campaignId: campaignFilter } : {}), ...(statusFilter ? { status: statusFilter } : {}) }),
  });

  const { data: campaignsData } = useQuery({
    queryKey: ['campaigns', 'all'],
    queryFn: () => campaignsService.list({ limit: 100 }),
  });

  const { data: agentsData } = useQuery({
    queryKey: ['users', 'agent'],
    queryFn: () => usersService.list({ role: 'agent', limit: 100 }),
  });

  const assignMutation = useMutation({
    mutationFn: ({ leadIds, agentId }: { leadIds: string[]; agentId: string }) =>
      leadsService.assign(leadIds, agentId),
    onSuccess: (res) => { qc.invalidateQueries({ queryKey: ['leads'] }); toast.success(res.data.data.message); setSelected([]); },
  });

  const reclaimMutation = useMutation({
    mutationFn: (leadIds: string[]) => leadsService.reclaim(leadIds),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['leads'] }); toast.success('Leads reclaimed'); setSelected([]); },
  });

  const leads: Lead[] = leadsData?.data?.data?.leads || [];
  const total: number = leadsData?.data?.data?.total || 0;
  const campaigns = campaignsData?.data?.data?.campaigns || [];
  const agents = agentsData?.data?.data?.users || [];
  const pages = Math.ceil(total / LIMIT);

  const statusColour: Record<string, string> = {
    uncontacted: '#6366f1', contacted: '#22d3ee', lead: '#22c55e',
    not_interested: '#ef4444', dnd: '#dc2626', invalid: '#94a3b8', callback: '#f59e0b',
  };

  const toggleSelect = (id: string) =>
    setSelected((s) => s.includes(id) ? s.filter((x) => x !== id) : [...s, id]);

  return (
    <AppLayout>
      <div className="page-container">
        <div className="page-header">
          <div>
            <h1 className="page-title">Leads</h1>
            <p className="page-subtitle">{total.toLocaleString()} total leads</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {selected.length > 0 && (
              <>
                <select className="form-input" style={{ width: 180 }}
                  onChange={(e) => e.target.value && assignMutation.mutate({ leadIds: selected, agentId: e.target.value })}>
                  <option value="">Assign {selected.length} to…</option>
                  {(agents as Record<string, string>[]).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
                <button className="btn btn-secondary" onClick={() => reclaimMutation.mutate(selected)}>
                  Reclaim {selected.length}
                </button>
              </>
            )}
            <button className="btn btn-primary" onClick={() => setShowUpload(!showUpload)}>
              <Upload size={15} /> Upload CSV
            </button>
          </div>
        </div>

        {/* Upload Panel */}
        {showUpload && (
          <UploadPanel
            campaignId={campaignFilter || (campaigns[0]?.id as string) || ''}
            onDone={() => { setShowUpload(false); qc.invalidateQueries({ queryKey: ['leads'] }); }}
          />
        )}

        {/* Filters */}
        <div className="filter-bar">
          <div className="search-box">
            <Search size={15} className="search-icon" />
            <input className="search-input" placeholder="Search by name…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <select className="form-input" style={{ width: 180 }} value={campaignFilter} onChange={(e) => { setCampaignFilter(e.target.value); setPage(1); }}>
            <option value="">All Campaigns</option>
            {(campaigns as Record<string, string>[]).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <div className="filter-tabs">
            {['', 'uncontacted', 'contacted', 'lead', 'callback', 'not_interested', 'invalid', 'dnd'].map((s) => (
              <button key={s} className={`filter-tab ${statusFilter === s ? 'filter-tab--active' : ''}`} onClick={() => { setStatusFilter(s); setPage(1); }}>
                {s || 'All'}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        <div className="card">
          <div className="table-header">
            <div style={{ width: 28 }}><input type="checkbox" onChange={(e) => setSelected(e.target.checked ? leads.map(l => l.id) : [])} /></div>
            <div className="table-col" style={{ flex: 2 }}>Contact</div>
            <div className="table-col">Status</div>
            <div className="table-col">Priority</div>
            <div className="table-col">Assigned To</div>
            <div className="table-col">Last Called</div>
          </div>
          {isLoading && <div className="empty-state"><RefreshCw className="spin" size={20} /><p>Loading…</p></div>}
          {leads
            .filter(l => !search || (l.name || '').toLowerCase().includes(search.toLowerCase()))
            .map((l) => (
            <div key={l.id} className={`table-row ${selected.includes(l.id) ? 'table-row--selected' : ''}`}>
              <div style={{ width: 28 }}><input type="checkbox" checked={selected.includes(l.id)} onChange={() => toggleSelect(l.id)} /></div>
              <div className="table-cell" style={{ flex: 2 }}>
                <div style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{l.name || '—'}</div>
                <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                  {l.isDnd && <span style={{ color: '#ef4444', marginRight: 4 }}>⛔ DND</span>}
                  {l.email || ''}
                </div>
              </div>
              <div className="table-cell">
                <span className="badge" style={{ background: (statusColour[l.status] || '#6366f1') + '22', color: statusColour[l.status] || '#6366f1' }}>
                  {l.status.replace('_', ' ')}
                </span>
              </div>
              <div className="table-cell">
                <span className="badge" style={{ background: l.priority === 'high' ? '#45090a' : '#1e293b', color: l.priority === 'high' ? '#f87171' : '#64748b' }}>
                  {l.priority}
                </span>
              </div>
              <div className="table-cell" style={{ color: 'var(--text-secondary)' }}>
                {l.assignedTo?.name || <span style={{ color: 'var(--text-muted)' }}>Unassigned</span>}
              </div>
              <div className="table-cell" style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>
                {l.lastCalledAt ? new Date(l.lastCalledAt).toLocaleString() : '—'}
              </div>
            </div>
          ))}
          {!isLoading && leads.length === 0 && (
            <div className="empty-state"><Upload size={28} style={{ opacity: 0.4 }} /><p>No leads. Upload a CSV to get started.</p></div>
          )}
        </div>

        {/* Pagination */}
        {pages > 1 && (
          <div className="pagination">
            <button className="btn btn-secondary" disabled={page === 1} onClick={() => setPage(p => p - 1)}>
              <ChevronLeft size={16} />
            </button>
            <span style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>Page {page} of {pages} ({total.toLocaleString()} leads)</span>
            <button className="btn btn-secondary" disabled={page === pages} onClick={() => setPage(p => p + 1)}>
              <ChevronRight size={16} />
            </button>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
