import { useState, useRef, useSyncExternalStore } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { leadsService, usersService, campaignsService, tagsService } from '../../services/crm.service';
import AppLayout from '../../components/layout/AppLayout';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import Dropdown from '../../components/ui/Dropdown';
import toast from 'react-hot-toast';
import * as XLSX from 'xlsx';
import { Upload, Search, RefreshCw, ChevronLeft, ChevronRight, Download, FileSpreadsheet, CheckCircle2, X, UserCheck, PhoneCall, Trash2 } from 'lucide-react';
import { stringeeService } from '../../services/stringee.service';

// ── Export Leads to Excel ─────────────────────────────────────────────

async function exportLeads(
  filters: { campaignId?: string; status?: string; assignedToId?: string },
  campaigns: { id: string; name: string }[],
  agents: { id: string; name: string }[],
) {
  toast.loading('Preparing export…', { id: 'export' });
  try {
    // First fetch to get the real total count
    const countRes = await leadsService.list({ limit: 1, page: 1, ...filters });
    const total: number = countRes.data?.data?.total ?? 0;
    if (!total) {
      toast.error('No leads to export', { id: 'export' });
      return;
    }
    // Fetch all leads in one go using the real total
    const res = await leadsService.list({ limit: total, page: 1, ...filters });
    const leads = res.data?.data?.leads ?? [];
    if (!leads.length) {
      toast.error('No leads to export', { id: 'export' });
      return;
    }
    const campaignMap = Object.fromEntries(campaigns.map((c) => [c.id, c.name]));
    const agentMap = Object.fromEntries(agents.map((a) => [a.id, a.name]));
    const rows = leads.map((l: Record<string, unknown>) => ({
      Name: l.name ?? '',
      'Mobile Number': l.phone ?? '',
      Email: l.email ?? '',
      Status: l.status,
      Disposition: l.status,
      Priority: l.priority,
      DND: (l.isDnd as boolean) ? 'Yes' : 'No',
      'Last Call Result': l.lastCallResult ?? '',
      Language: l.lastCallLanguage ?? '',
      'Last Call Description': l.lastCallDescription ?? '',
      Campaign: campaignMap[(l.campaignId as string)] ?? l.campaignId,
      'Assigned To': l.assignedToId ? (agentMap[(l.assignedToId as string)] ?? l.assignedToId) : 'Unassigned',
      'Last Called': l.lastCalledAt ? new Date(l.lastCalledAt as string).toLocaleString() : '',
      'Created At': new Date(l.createdAt as string).toLocaleString(),
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Leads');
    const filename = `leads_export_${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(wb, filename);
    toast.success(`Exported ${leads.length} leads`, { id: 'export' });
  } catch {
    toast.error('Export failed', { id: 'export' });
  }
}

// ── Template Download ─────────────────────────────────────────────────

function downloadTemplate() {
  const headers = ['name', 'phone', 'email', 'city', 'product_interest', 'source'];
  const samples = [
    ['Rahul Sharma', '9876543210', 'rahul@example.com', 'Mumbai', 'Home Loan', 'Website'],
    ['Priya Patel',  '8765432109', 'priya@example.com', 'Delhi',  'Car Insurance', 'Facebook'],
    ['Amit Singh',  '7654321098', '',                  'Pune',   'Term Plan', 'Cold Call'],
  ];
  const csvContent = [headers, ...samples].map(r => r.join(',')).join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'leads_template.csv';
  a.click();
  URL.revokeObjectURL(url);
}

interface Lead {
  id: string; name: string | null; phone?: string; email: string | null;
  status: string; priority: string; isDnd: boolean;
  assignedToId: string | null; assignedTo?: { id: string; name: string } | null;
  campaignId: string; lastCallResult?: string | null; lastCalledAt: string | null; createdAt: string;
}

// ── Upload Panel ──────────────────────────────────────────────────────

function UploadPanel({ campaigns, onDone, onClose }: {
  campaigns: { id: string; name: string }[];
  onDone: () => void;
  onClose: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [selectedCampaign, setSelectedCampaign] = useState(campaigns[0]?.id || '');
  const [jobId, setJobId] = useState<string | null>(null);
  const [progress, setProgress] = useState<Record<string, unknown> | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const uploadMutation = useMutation({
    mutationFn: (f: File) => leadsService.upload(selectedCampaign, f),
    onSuccess: async (res) => {
      const id = res.data.data.jobId as string;
      setJobId(id);
      toast.success('Upload queued — processing in background');
      const poll = setInterval(async () => {
        const s = await leadsService.uploadStatus(id);
        setProgress(s.data.data);
        if (s.data.data.status === 'done' || s.data.data.status === 'error') {
          clearInterval(poll);
          if (s.data.data.status === 'done') {
            toast.success(`✅ Imported ${s.data.data.inserted} leads`);
            onDone();
          } else {
            toast.error('Upload processing failed');
          }
        }
      }, 1200);
    },
    onError: () => toast.error('Upload failed — check file format'),
  });

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) setFile(dropped);
  };

  const isDone = progress?.status === 'done';
  const isError = progress?.status === 'error';

  return (
    <div className="upload-panel-full">
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-primary)' }}>Upload Leads</div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 2 }}>Supports CSV, XLSX, XLS — up to 50MB — 100,000 rows</div>
        </div>
        <button className="btn-icon" onClick={onClose}><X size={18} /></button>
      </div>

      <div className="upload-layout">
        {/* LEFT — Column reference */}
        <div className="upload-format-guide">
          <div style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--accent)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
            <FileSpreadsheet size={15} /> Column Reference
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
            <thead>
              <tr style={{ background: 'var(--bg-elevated)' }}>
                <th style={{ padding: '7px 10px', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em', borderRadius: '6px 0 0 6px' }}>Column</th>
                <th style={{ padding: '7px 10px', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Type</th>
                <th style={{ padding: '7px 10px', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em', borderRadius: '0 6px 6px 0' }}>Notes</th>
              </tr>
            </thead>
            <tbody>
              {[
                { col: 'phone', type: '🔴 Required', note: 'Min 7 digits. Also accepts: mobile, phone_number' },
                { col: 'name',  type: '🟡 Optional', note: 'Full name. Also accepts: full_name, FullName' },
                { col: 'email', type: '🟡 Optional', note: 'Valid email address' },
                { col: 'city / state', type: '🟢 Custom', note: 'Any extra columns become custom fields' },
                { col: 'product / source', type: '🟢 Custom', note: 'Any extra columns become custom fields' },
              ].map(({ col, type, note }) => (
                <tr key={col} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '8px 10px', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'monospace', fontSize: '0.82rem' }}>{col}</td>
                  <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 600, color: type.includes('Required') ? '#ef4444' : type.includes('Optional') ? '#f59e0b' : '#22c55e' }}>
                      {type}
                    </span>
                  </td>
                  <td style={{ padding: '8px 10px', color: 'var(--text-muted)', fontSize: '0.76rem', lineHeight: 1.4 }}>{note}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Rules */}
          <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {[
              'Duplicate phone numbers are auto-skipped',
              'DND-listed numbers are filtered automatically',
              'Rows with no valid phone number are marked invalid',
              'Column headers are case-insensitive',
            ].map(rule => (
              <div key={rule} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                <CheckCircle2 size={13} style={{ color: '#22c55e', flexShrink: 0, marginTop: 1 }} />
                {rule}
              </div>
            ))}
          </div>

          {/* Download template */}
          <button className="btn btn-secondary" style={{ width: '100%', marginTop: 16, gap: 8 }} onClick={downloadTemplate}>
            <Download size={15} /> Download Sample Template (.csv)
          </button>
        </div>

        {/* RIGHT — Upload zone */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, flex: 1 }}>
          {/* Campaign selector */}
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Upload to Campaign</label>
            <select className="form-input" value={selectedCampaign} onChange={e => setSelectedCampaign(e.target.value)}>
              {campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          {/* Drop zone */}
          {!file && !progress && (
            <div
              className={`upload-drop ${isDragging ? 'upload-drop--dragging' : ''}`}
              style={{ flex: 1, minHeight: 160 }}
              onClick={() => fileRef.current?.click()}
              onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
            >
              <Upload size={32} style={{ color: isDragging ? 'var(--accent)' : 'var(--text-muted)' }} />
              <div style={{ fontWeight: 600, color: isDragging ? 'var(--accent)' : 'var(--text-primary)' }}>
                {isDragging ? 'Drop to upload' : 'Click or drag file here'}
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>.csv, .xlsx, .xls · max 50MB</div>
            </div>
          )}
          <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" style={{ display: 'none' }}
            onChange={e => { setFile(e.target.files?.[0] || null); }} />

          {/* File selected — ready to upload */}
          {file && !jobId && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', background: 'var(--bg-elevated)', borderRadius: 10, border: '1px solid var(--border-subtle)' }}>
                <FileSpreadsheet size={28} style={{ color: '#22c55e', flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.9rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{(file.size / 1024).toFixed(1)} KB</div>
                </div>
                <button className="btn-icon" onClick={() => setFile(null)}><X size={16} /></button>
              </div>
              <button className="btn btn-primary" style={{ width: '100%', padding: '12px', fontSize: '0.95rem' }}
                disabled={!selectedCampaign || uploadMutation.isPending}
                onClick={() => uploadMutation.mutate(file)}>
                <Upload size={16} />
                {uploadMutation.isPending ? 'Queuing…' : `Upload to ${campaigns.find(c => c.id === selectedCampaign)?.name || 'Campaign'}`}
              </button>
            </div>
          )}

          {/* Progress */}
          {progress && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 600, color: isDone ? '#22c55e' : isError ? '#ef4444' : 'var(--accent)', fontSize: '0.9rem' }}>
                  {isDone ? '✅ Upload Complete' : isError ? '❌ Upload Failed' : '⏳ Processing Leads…'}
                </span>
                <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
                  {typeof progress.inserted === 'number' ? `${progress.inserted} / ${progress.total}` : ''}
                </span>
              </div>
              <div className="progress-bar-wrap" style={{ height: 10 }}>
                <div className="progress-bar" style={{ width: `${(progress.progress as number) || (isDone ? 100 : 5)}%`, transition: 'width 0.6s ease' }} />
              </div>
              {isDone && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
                  {[
                    { label: 'Inserted', value: progress.inserted, colour: '#22c55e' },
                    { label: 'DND Skipped', value: progress.skipped, colour: '#f59e0b' },
                    { label: 'Invalid', value: progress.invalid, colour: '#ef4444' },
                  ].map(({ label, value, colour }) => (
                    <div key={label} style={{ textAlign: 'center', background: 'var(--bg-elevated)', borderRadius: 10, padding: '12px 8px', border: `1px solid ${colour}33` }}>
                      <div style={{ fontSize: '1.4rem', fontWeight: 800, color: colour }}>{value as number}</div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600, marginTop: 2 }}>{label}</div>
                    </div>
                  ))}
                </div>
              )}
              {isError && (
                <div style={{ padding: '10px 14px', background: '#450a0a', border: '1px solid #7f1d1d', borderRadius: 8, fontSize: '0.82rem', color: '#f87171' }}>
                  {progress.error as string || 'Unknown error. Check the file format and try again.'}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Leads Page ────────────────────────────────────────────────────────

export default function LeadsPage() {
  const qc = useQueryClient();
  const [campaignFilter, setCampaignFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [agentFilter, setAgentFilter] = useState('');
  // Draft + applied state for call result / lead status (Apply/Reset pattern)
  const [draftCallResult, setDraftCallResult] = useState('');
  const [draftFollowUp, setDraftFollowUp] = useState('');
  const [callResultFilter, setCallResultFilter] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [showUpload, setShowUpload] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [confirmDelete, setConfirmDelete] = useState<string[] | null>(null);
  const LIMIT = 50;

  const hasUnapplied = draftCallResult !== callResultFilter || draftFollowUp !== statusFilter;
  const hasActiveFilters = !!(callResultFilter || statusFilter || draftCallResult || draftFollowUp);

  const applyFilters = () => { setCallResultFilter(draftCallResult); setStatusFilter(draftFollowUp); setPage(1); };
  const resetFilters = () => { setDraftCallResult(''); setDraftFollowUp(''); setCallResultFilter(''); setStatusFilter(''); setPage(1); };

  const { data: leadsData, isLoading } = useQuery({
    queryKey: ['leads', page, campaignFilter, statusFilter, agentFilter, callResultFilter],
    queryFn: () => leadsService.list({ 
      page, 
      limit: LIMIT, 
      ...(campaignFilter ? { campaignId: campaignFilter } : {}), 
      ...(statusFilter ? { status: statusFilter } : {}),
      ...(agentFilter ? { assignedToId: agentFilter } : {}),
      ...(callResultFilter ? { callResult: callResultFilter } : {}),
    }),
  });

  const { data: campaignsData } = useQuery({
    queryKey: ['campaigns', 'all'],
    queryFn: () => campaignsService.list({ limit: 100 }),
  });

  const { data: agentsData } = useQuery({
    queryKey: ['users', 'agent'],
    queryFn: () => usersService.list({ role: 'agent', limit: 100 }),
  });

  const { data: tagsData } = useQuery({
    queryKey: ['disposition-tags'],
    queryFn: () => tagsService.list(),
    staleTime: 5 * 60 * 1000,
  });
  const dispositionTags: { name: string; color?: string | null }[] = tagsData?.data?.data || tagsData?.data || [];

  const assignMutation = useMutation({
    mutationFn: ({ leadIds, agentId }: { leadIds: string[]; agentId: string }) =>
      leadsService.assign(leadIds, agentId),
    onSuccess: (res) => { qc.invalidateQueries({ queryKey: ['leads'] }); toast.success(res.data.data.message); setSelected([]); },
  });

  const reclaimMutation = useMutation({
    mutationFn: (leadIds: string[]) => leadsService.reclaim(leadIds),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['leads'] }); toast.success('Leads reclaimed'); setSelected([]); },
  });

  const deleteMutation = useMutation({
    mutationFn: (leadIds: string[]) => leadsService.delete(leadIds),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['leads'] });
      toast.success(res.data.data.message);
      setSelected([]);
      setConfirmDelete(null);
    },
    onError: () => toast.error('Failed to delete leads'),
  });

  const assignCampaignMutation = useMutation({
    mutationFn: ({ campaignId, agentId }: { campaignId: string; agentId: string }) =>
      leadsService.assignCampaign(campaignId, agentId),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['leads'] });
      toast.success(res.data.data.message);
    },
    onError: () => toast.error('Assignment failed'),
  });

  const leads: Lead[] = leadsData?.data?.data?.leads || [];
  const total: number = leadsData?.data?.data?.total || 0;
  const campaigns = campaignsData?.data?.data?.campaigns || [];
  const agents = agentsData?.data?.data?.users || [];
  const pages = Math.ceil(total / LIMIT);
  const callState = useSyncExternalStore(stringeeService.subscribe, stringeeService.getSnapshot);

  const statusColour: Record<string, string> = {
    uncontacted: '#6f63ff', contacted: '#3b82f6', lead: '#1f9d55',
    not_interested: '#dc2626', dnd: '#c2410c', invalid: '#64748b', callback: '#c67a0a',
  };
  const statusLabel: Record<string, string> = {
    uncontacted: 'Uncontacted',
    contacted: 'Contacted',
    lead: 'Interested',
    callback: 'Callback',
    not_interested: 'Not Interested',
    dnd: 'DND',
    invalid: 'Invalid',
  };
  const priorityTone: Record<string, { background: string; color: string }> = {
    high: { background: '#fff0f0', color: '#dc2626' },
    normal: { background: '#eef2f7', color: '#64748b' },
  };

  const toggleSelect = (id: string) =>
    setSelected((s) => s.includes(id) ? s.filter((x) => x !== id) : [...s, id]);

  const handleCall = async (lead: Lead) => {
    try {
      await stringeeService.startCall(lead.id, lead.name || 'Lead');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to start call');
    }
  };

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
                <button
                  className="btn btn-secondary"
                  style={{ color: '#ef4444', borderColor: '#ef4444' }}
                  onClick={() => setConfirmDelete(selected)}
                >
                  <Trash2 size={14} /> Delete {selected.length}
                </button>
              </>
            )}
            <button className="btn btn-secondary" onClick={downloadTemplate}>
              <Download size={15} /> Template
            </button>
            <button
              className="btn btn-secondary"
              onClick={() => exportLeads(
                {
                  ...(campaignFilter ? { campaignId: campaignFilter } : {}),
                  ...(statusFilter ? { status: statusFilter } : {}),
                  ...(agentFilter ? { assignedToId: agentFilter } : {}),
                  ...(callResultFilter ? { callResult: callResultFilter } : {}),
                },
                campaigns as { id: string; name: string }[],
                agents as { id: string; name: string }[],
              )}
            >
              <FileSpreadsheet size={15} /> Export
            </button>
            <button className="btn btn-primary" onClick={() => setShowUpload(!showUpload)}>
              <Upload size={15} /> {showUpload ? 'Hide Upload' : 'Upload Leads'}
            </button>
          </div>
        </div>

        {/* Upload Panel */}
        {showUpload && (
          <UploadPanel
            campaigns={(campaigns as { id: string; name: string }[])}
            onDone={() => { setShowUpload(false); qc.invalidateQueries({ queryKey: ['leads'] }); }}
            onClose={() => setShowUpload(false)}
          />
        )}

          {/* Assign entire campaign in one click */}
            {campaignFilter && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', background: 'var(--bg-elevated)', borderRadius: 10, border: '1px solid var(--border)', flexWrap: 'wrap' }}>
                <UserCheck size={15} style={{ color: '#22d3ee', flexShrink: 0 }} />
                <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>Assign all unassigned to:</span>
                <select className="form-input" style={{ width: 160, padding: '5px 10px', fontSize: '0.82rem' }}
                  defaultValue=""
                  onChange={(e) => {
                    if (e.target.value) {
                      assignCampaignMutation.mutate({ campaignId: campaignFilter, agentId: e.target.value });
                      e.target.value = '';
                    }
                  }}>
                  <option value="">Pick agent…</option>
                  {(agents as Record<string, string>[]).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
                {assignCampaignMutation.isPending && <RefreshCw size={13} className="spin" style={{ color: 'var(--accent)' }} />}
              </div>
            )}
        <div className="filter-bar">
          <div className="search-box">
            <Search size={15} className="search-icon" />
            <input className="search-input" placeholder="Search by name…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div style={{ width: 180 }}>
            <Dropdown
              value={campaignFilter}
              onChange={(value) => { setCampaignFilter(value); setPage(1); }}
              placeholder="All Campaigns"
              options={[
                { value: '', label: 'All Campaigns' },
                ...(campaigns as Record<string, string>[]).map((c) => ({ value: c.id, label: c.name })),
              ]}
            />
          </div>
          <div style={{ width: 180 }}>
            <Dropdown
              value={agentFilter}
              onChange={(value) => { setAgentFilter(value); setPage(1); }}
              placeholder="All Agents"
              options={[
                { value: '', label: 'All Agents' },
                { value: 'null', label: 'Unassigned' },
                ...(agents as Record<string, string>[]).map((a) => ({ value: a.id, label: a.name })),
              ]}
            />
          </div>
          <Dropdown
            value={draftFollowUp}
            onChange={setDraftFollowUp}
            placeholder="All followup statuses"
            options={[
              { value: '', label: 'All followup statuses' },
              { value: 'uncontacted',    label: 'Uncontacted',    colour: '#6f63ff' },
              { value: 'contacted',      label: 'Contacted',      colour: '#3b82f6' },
              { value: 'lead',           label: 'Interested',     colour: '#1f9d55' },
              { value: 'callback',       label: 'Callback',       colour: '#c67a0a' },
              { value: 'not_interested', label: 'Not Interested', colour: '#dc2626' },
              { value: 'dnd',            label: 'DND',            colour: '#c2410c' },
              { value: 'invalid',        label: 'Invalid',        colour: '#64748b' },
            ]}
          />
          <Dropdown
            value={draftCallResult}
            onChange={setDraftCallResult}
            placeholder="All call results"
            options={[
              { value: '', label: 'All call results' },
              ...dispositionTags.map((t) => ({ value: t.name, label: t.name, colour: t.color || undefined })),
            ]}
          />
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              type="button"
              onClick={applyFilters}
              disabled={!hasUnapplied}
              style={{ height: 36, padding: '0 14px', fontSize: 13, fontWeight: 600, borderRadius: 8, border: 'none', cursor: hasUnapplied ? 'pointer' : 'not-allowed', background: hasUnapplied ? '#4f46e5' : '#cbd5e1', color: '#fff', transition: 'background 120ms' }}
            >Apply</button>
            <button
              type="button"
              onClick={resetFilters}
              disabled={!hasActiveFilters}
              style={{ height: 36, padding: '0 12px', fontSize: 13, fontWeight: 500, borderRadius: 8, border: '1px solid #cbd5e1', cursor: hasActiveFilters ? 'pointer' : 'not-allowed', background: 'var(--bg-surface)', color: hasActiveFilters ? '#475569' : '#cbd5e1' }}
            >Reset</button>
          </div>
        </div>

        {/* Table */}
        <div className="card">
          <div className="table-header">
            <div style={{ width: 28 }}><input type="checkbox" onChange={(e) => setSelected(e.target.checked ? leads.map(l => l.id) : [])} /></div>
            <div className="table-col" style={{ flex: 2 }}>Contact</div>
            <div className="table-col">Followup Status</div>
            <div className="table-col">Priority</div>
            <div className="table-col">Assigned To</div>
            <div className="table-col">Last Call Result</div>
            <div className="table-col">Last Called</div>
            <div className="table-col">Actions</div>
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
                <span className="badge" style={{ background: (statusColour[l.status] || '#6366f1') + '1a', color: statusColour[l.status] || '#6366f1' }}>
                  {statusLabel[l.status] || l.status.replace('_', ' ')}
                </span>
              </div>
              <div className="table-cell">
                <span className="badge" style={priorityTone[l.priority] || priorityTone.normal}>
                  {l.priority}
                </span>
              </div>
              <div className="table-cell" style={{ color: 'var(--text-secondary)' }}>
                {l.assignedTo?.name || <span style={{ color: 'var(--text-muted)' }}>Unassigned</span>}
              </div>
              <div className="table-cell">
                {l.lastCallResult ? (
                  <span
                    className="badge"
                    style={{
                      background: '#eef2ff',
                      color: '#4338ca',
                      whiteSpace: 'nowrap',
                      textTransform: 'capitalize',
                    }}
                  >
                    {l.lastCallResult}
                  </span>
                ) : (
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>—</span>
                )}
              </div>
              <div className="table-cell" style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>
                {l.lastCalledAt ? new Date(l.lastCalledAt).toLocaleString() : '—'}
              </div>
              <div className="table-cell">
                <button
                  className="btn btn-secondary"
                  style={{ padding: '6px 10px', fontSize: '0.76rem' }}
                  disabled={!l.phone || l.isDnd || (
                    !!callState.activeLeadId && callState.activeLeadId !== l.id &&
                    ['dialing', 'ringing', 'in_call'].includes(callState.callStatus)
                  )}
                  onClick={() => void handleCall(l)}
                >
                  <PhoneCall size={14} /> {callState.activeLeadId === l.id && ['dialing', 'ringing', 'in_call'].includes(callState.callStatus) ? 'Calling' : 'Call'}
                </button>
                <button
                  className="btn-icon"
                  title="Delete lead"
                  style={{ color: '#ef4444', marginLeft: 4 }}
                  onClick={() => setConfirmDelete([l.id])}
                >
                  <Trash2 size={14} />
                </button>
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

      <ConfirmDialog
        open={!!confirmDelete}
        title={confirmDelete?.length === 1 ? 'Delete lead?' : `Delete ${confirmDelete?.length} leads?`}
        message={
          confirmDelete?.length === 1
            ? 'This lead will be permanently hidden. Call logs and history are preserved.'
            : `${confirmDelete?.length} leads will be permanently hidden. Call logs and history are preserved.`
        }
        confirmLabel={confirmDelete?.length === 1 ? 'Delete lead' : `Delete ${confirmDelete?.length} leads`}
        variant="danger"
        loading={deleteMutation.isPending}
        onConfirm={() => confirmDelete && deleteMutation.mutate(confirmDelete)}
        onCancel={() => setConfirmDelete(null)}
      />
    </AppLayout>
  );
}
