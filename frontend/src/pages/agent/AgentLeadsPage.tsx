import { useState, useSyncExternalStore, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { leadsService, callsService, tagsService } from '../../services/crm.service';
import AppLayout from '../../components/layout/AppLayout';
import Dropdown from '../../components/ui/Dropdown';
import { 
  Search, User, Phone, Calendar, MessageSquare, 
  ExternalLink, ChevronLeft, ChevronRight, Mail, Hash, Clock, History, PhoneCall
} from 'lucide-react';
import toast from 'react-hot-toast';
import { stringeeService } from '../../services/stringee.service';

interface Lead {
  id: string;
  name: string | null;
  phone: string; // Masked
  email: string | null;
  status: string;
  priority: string;
  createdAt: string;
  lastCalledAt: string | null;
  lastCallResult: string | null;
  campaign?: { name: string };
}

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'All followup statuses' },
  { value: 'uncontacted', label: 'Uncontacted' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'lead', label: 'Interested' },
  { value: 'callback', label: 'Callback' },
  { value: 'not_interested', label: 'Not interested' },
  { value: 'dnd', label: 'DND' },
  { value: 'invalid', label: 'Invalid' },
];

const PRIORITY_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'All priorities' },
  { value: 'high', label: 'High' },
  { value: 'normal', label: 'Normal' },
];

const STATUS_COLORS: Record<string, { bg: string; fg: string; dot: string }> = {
  uncontacted:    { bg: '#eef2f7', fg: '#475569', dot: '#94a3b8' },
  contacted:      { bg: '#e0f2fe', fg: '#0369a1', dot: '#0ea5e9' },
  lead:           { bg: '#dcfce7', fg: '#15803d', dot: '#22c55e' },
  callback:       { bg: '#fef9c3', fg: '#a16207', dot: '#eab308' },
  not_interested: { bg: '#fee2e2', fg: '#b91c1c', dot: '#ef4444' },
  dnd:            { bg: '#fce7f3', fg: '#9d174d', dot: '#ec4899' },
  invalid:        { bg: '#f1f5f9', fg: '#64748b', dot: '#94a3b8' },
};

const STATUS_LABELS: Record<string, string> = {
  uncontacted:    'Uncontacted',
  contacted:      'Contacted',
  lead:           'Interested',
  callback:       'Callback',
  not_interested: 'Not Interested',
  dnd:            'DND',
  invalid:        'Invalid',
};

// Colour palette for disposition tags (last call result)
const RESULT_COLORS: Record<string, { bg: string; fg: string }> = {
  'interested':       { bg: '#dcfce7', fg: '#15803d' },
  'not interested':   { bg: '#fee2e2', fg: '#b91c1c' },
  'callback':         { bg: '#fef9c3', fg: '#a16207' },
  'rnr':              { bg: '#e0e7ff', fg: '#4338ca' },
  'busy':             { bg: '#ffedd5', fg: '#c2410c' },
  'dnd':              { bg: '#fce7f3', fg: '#9d174d' },
  'invalid number':   { bg: '#f1f5f9', fg: '#64748b' },
};

export default function AgentLeadsPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  // Draft state — bound to the dropdowns. Not used for querying.
  const [draftStatus, setDraftStatus] = useState('');
  const [draftPriority, setDraftPriority] = useState('');
  const [draftCallResult, setDraftCallResult] = useState('');
  // Applied state — committed on Apply click; this is what drives the query.
  const [statusFilter, setStatusFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [callResultFilter, setCallResultFilter] = useState('');
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const hasUnapplied =
    draftStatus !== statusFilter ||
    draftPriority !== priorityFilter ||
    draftCallResult !== callResultFilter;

  const hasActiveFilters =
    !!(statusFilter || priorityFilter || callResultFilter || draftStatus || draftPriority || draftCallResult);

  const applyFilters = () => {
    setStatusFilter(draftStatus);
    setPriorityFilter(draftPriority);
    setCallResultFilter(draftCallResult);
  };

  const resetFilters = () => {
    setDraftStatus('');
    setDraftPriority('');
    setDraftCallResult('');
    setStatusFilter('');
    setPriorityFilter('');
    setCallResultFilter('');
  };

  // Debounce the search input so we don't hammer the server on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchTerm.trim()), 300);
    return () => clearTimeout(t);
  }, [searchTerm]);

  // Reset to page 1 whenever filters/search change.
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, statusFilter, priorityFilter, callResultFilter]);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['agent-leads', statusFilter, priorityFilter, callResultFilter, debouncedSearch, page],
    queryFn: () =>
      leadsService.list({
        page,
        limit: PAGE_SIZE,
        ...(statusFilter ? { status: statusFilter } : {}),
        ...(priorityFilter ? { priority: priorityFilter } : {}),
        ...(callResultFilter ? { callResult: callResultFilter } : {}),
        ...(debouncedSearch ? { q: debouncedSearch } : {}),
      }),
    placeholderData: (prev) => prev,
  });
  const callState = useSyncExternalStore(stringeeService.subscribe, stringeeService.getSnapshot);

  // Disposition tags to populate the Call Result filter.
  const { data: tagsData } = useQuery({
    queryKey: ['disposition-tags'],
    queryFn: () => tagsService.list(),
    staleTime: 5 * 60 * 1000,
  });
  const dispositionTags: { name: string; color?: string | null }[] =
    tagsData?.data?.data || tagsData?.data || [];

  const leads: Lead[] = data?.data?.data?.leads || [];
  const total: number = data?.data?.data?.total || 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const rangeStart = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(page * PAGE_SIZE, total);
  const filteredLeads = leads;

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
            <h1 className="page-title">My Leads</h1>
            <p className="page-subtitle">
              {total > 0
                ? `Showing ${rangeStart}–${rangeEnd} of ${total} assigned leads`
                : 'All leads currently assigned to you'}
            </p>
          </div>
        </div>

        <div className="card" style={{ border: 'none', background: 'transparent' }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 170px 170px 150px auto',
              gap: 8,
              marginBottom: 14,
              alignItems: 'center',
            }}
          >
            <div
              className="search-box"
              style={{
                background: 'var(--bg-surface)',
                border: '1px solid var(--border)',
                padding: '6px 12px',
                borderRadius: 8,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <Search size={15} style={{ color: 'var(--text-muted)' }} />
              <input
                type="text"
                className="search-input"
                placeholder="Search name, phone, email..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{
                  background: 'none',
                  border: 'none',
                  width: '100%',
                  fontSize: '0.85rem',
                  color: 'var(--text-primary)',
                  outline: 'none',
                }}
              />
            </div>
            <Dropdown
              value={draftStatus}
              onChange={setDraftStatus}
              placeholder="All followup statuses"
              options={STATUS_OPTIONS.map((o) => ({
                value: o.value,
                label: o.label,
                colour: o.value ? STATUS_COLORS[o.value]?.dot : undefined,
              }))}
            />
            <Dropdown
              value={draftCallResult}
              onChange={setDraftCallResult}
              placeholder="All call results"
              options={[
                { value: '', label: 'All call results' },
                ...dispositionTags.map((t) => {
                  const key = t.name.toLowerCase();
                  return {
                    value: t.name,
                    label: t.name,
                    colour: t.color || RESULT_COLORS[key]?.fg,
                  };
                }),
              ]}
            />
            <Dropdown
              value={draftPriority}
              onChange={setDraftPriority}
              placeholder="All priorities"
              options={PRIORITY_OPTIONS}
            />
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                type="button"
                onClick={applyFilters}
                disabled={!hasUnapplied}
                style={{
                  height: 36,
                  padding: '0 14px',
                  fontSize: 13,
                  fontWeight: 600,
                  borderRadius: 8,
                  border: 'none',
                  cursor: hasUnapplied ? 'pointer' : 'not-allowed',
                  background: hasUnapplied ? '#4f46e5' : '#cbd5e1',
                  color: '#fff',
                  transition: 'background 120ms',
                }}
              >
                Apply
              </button>
              <button
                type="button"
                onClick={resetFilters}
                disabled={!hasActiveFilters}
                style={{
                  height: 36,
                  padding: '0 12px',
                  fontSize: 13,
                  fontWeight: 500,
                  borderRadius: 8,
                  border: '1px solid #cbd5e1',
                  cursor: hasActiveFilters ? 'pointer' : 'not-allowed',
                  background: '#fff',
                  color: hasActiveFilters ? '#475569' : '#cbd5e1',
                }}
              >
                Reset
              </button>
            </div>
          </div>

          <div className="card" style={{ overflow: 'hidden' }}>
            <div className="table-container">
              <table className="table" style={{ width: '100%', tableLayout: 'fixed', borderCollapse: 'separate', borderSpacing: 0 }}>
                <colgroup>
                  <col style={{ width: '32%' }} />
                  <col style={{ width: '13%' }} />
                  <col style={{ width: '14%' }} />
                  <col style={{ width: '14%' }} />
                  <col style={{ width: '12%' }} />
                  <col style={{ width: '15%' }} />
                </colgroup>
                <thead style={{ background: 'var(--bg-elevated)' }}>
                  <tr>
                    <th style={{ padding: '14px 20px', textAlign: 'left', fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.06em', fontWeight: 600 }}>Lead</th>
                    <th style={{ padding: '14px 16px', textAlign: 'left', fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.06em', fontWeight: 600 }}>Followup Status</th>
                    <th style={{ padding: '14px 16px', textAlign: 'left', fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.06em', fontWeight: 600 }}>Call Result</th>
                    <th style={{ padding: '14px 16px', textAlign: 'left', fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.06em', fontWeight: 600 }}>Campaign</th>
                    <th style={{ padding: '14px 16px', textAlign: 'left', fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.06em', fontWeight: 600 }}>Last Called</th>
                    <th style={{ padding: '14px 20px', textAlign: 'right', fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.06em', fontWeight: 600 }}>Actions</th>
                  </tr>
                </thead>
                <tbody style={{ background: 'var(--bg-surface)' }}>
                  {isLoading ? (
                    <tr><td colSpan={6}><div className="empty-state">Loading your leads...</div></td></tr>
                  ) : filteredLeads.length === 0 ? (
                    <tr><td colSpan={6}><div className="empty-state">No leads match the current filters.</div></td></tr>
                  ) : (
                    filteredLeads.map((lead) => {
                      const colors = STATUS_COLORS[lead.status] || STATUS_COLORS.uncontacted;
                      const isActiveCall = callState.activeLeadId === lead.id && ['dialing', 'ringing', 'in_call'].includes(callState.callStatus);
                      const isBlocked = !!callState.activeLeadId && callState.activeLeadId !== lead.id && ['dialing', 'ringing', 'in_call'].includes(callState.callStatus);
                      return (
                      <tr key={lead.id} className="table-row-hover" style={{ borderBottom: '1px solid var(--border)', transition: 'background 0.2s' }}>
                        <td style={{ padding: '14px 20px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                            <div className="avatar avatar--sm" style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff', flexShrink: 0, fontWeight: 700 }}>
                              {lead.name?.charAt(0).toUpperCase() || <User size={14} />}
                            </div>
                            <div style={{ minWidth: 0, flex: 1 }}>
                              <div style={{ fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{lead.name || 'Unknown'}</span>
                                {lead.priority === 'high' && (
                                  <span style={{ background: '#fef2f2', color: '#dc2626', fontSize: '0.6rem', fontWeight: 700, padding: '2px 6px', borderRadius: 4, letterSpacing: '0.05em', flexShrink: 0 }}>HIGH</span>
                                )}
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                <Phone size={11} style={{ flexShrink: 0 }} /> {lead.phone}
                                {lead.email && <span style={{ opacity: 0.4 }}>•</span>}
                                {lead.email && <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{lead.email}</span>}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td style={{ padding: '14px 16px' }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: colors.bg, color: colors.fg, fontSize: '0.7rem', fontWeight: 600, padding: '4px 10px', borderRadius: 999, textTransform: 'capitalize' }}>
                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: colors.dot }} />
                            {STATUS_LABELS[lead.status] || lead.status.replace('_', ' ')}
                          </span>
                        </td>
                        <td style={{ padding: '14px 16px' }}>
                          {lead.lastCallResult ? (() => {
                            const r = RESULT_COLORS[lead.lastCallResult.toLowerCase()] || { bg: '#f1f5f9', fg: '#475569' };
                            return (
                              <span style={{ display: 'inline-block', background: r.bg, color: r.fg, fontSize: '0.7rem', fontWeight: 600, padding: '4px 10px', borderRadius: 999, textTransform: 'capitalize', whiteSpace: 'nowrap' }}>
                                {lead.lastCallResult}
                              </span>
                            );
                          })() : (
                            <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', fontStyle: 'italic' }}>—</span>
                          )}
                        </td>
                        <td style={{ padding: '14px 16px' }}>
                          <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'inline-block', maxWidth: '100%' }}>
                            {lead.campaign?.name || 'Standard'}
                          </span>
                        </td>
                        <td style={{ padding: '14px 16px' }}>
                          {lead.lastCalledAt ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                              <Clock size={13} /> {new Date(lead.lastCalledAt).toLocaleDateString()}
                            </div>
                          ) : (
                            <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', fontStyle: 'italic' }}>Never</span>
                          )}
                        </td>
                        <td style={{ padding: '14px 20px', textAlign: 'right' }}>
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            <button
                              style={{
                                display: 'inline-flex', alignItems: 'center', gap: 6,
                                padding: '7px 14px', fontSize: '0.8rem', fontWeight: 600,
                                background: isActiveCall ? '#16a34a' : '#6366f1',
                                color: '#fff', border: 'none', borderRadius: 8,
                                cursor: isBlocked ? 'not-allowed' : 'pointer',
                                opacity: isBlocked ? 0.5 : 1,
                                boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                              }}
                              disabled={isBlocked}
                              onClick={() => void handleCall(lead)}
                            >
                              <PhoneCall size={13} /> {isActiveCall ? 'Calling' : 'Call'}
                            </button>
                            <button
                              style={{
                                display: 'inline-flex', alignItems: 'center', gap: 6,
                                padding: '7px 12px', fontSize: '0.8rem', fontWeight: 500,
                                background: 'transparent', color: 'var(--text-secondary)',
                                border: '1px solid var(--border)', borderRadius: 8,
                                cursor: 'pointer',
                              }}
                              onClick={() => {
                                setSelectedLeadId(lead.id);
                                setIsModalOpen(true);
                              }}
                            >
                              <ExternalLink size={13} /> View
                            </button>
                          </div>
                        </td>
                      </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            {total > PAGE_SIZE && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 20px',
                  borderTop: '1px solid var(--border)',
                  background: 'var(--bg-surface)',
                  fontSize: '0.8rem',
                  color: 'var(--text-secondary)',
                }}
              >
                <div>
                  Page <strong style={{ color: 'var(--text-primary)' }}>{page}</strong> of{' '}
                  <strong style={{ color: 'var(--text-primary)' }}>{totalPages}</strong>
                  {isFetching && <span style={{ marginLeft: 10, opacity: 0.6 }}>Loading…</span>}
                </div>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page <= 1}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 4,
                      padding: '6px 10px', fontSize: '0.8rem', fontWeight: 500,
                      background: 'var(--bg-surface)', color: 'var(--text-primary)',
                      border: '1px solid var(--border)', borderRadius: 6,
                      cursor: page <= 1 ? 'not-allowed' : 'pointer',
                      opacity: page <= 1 ? 0.4 : 1,
                    }}
                  >
                    <ChevronLeft size={14} /> Prev
                  </button>
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 4,
                      padding: '6px 10px', fontSize: '0.8rem', fontWeight: 500,
                      background: 'var(--bg-surface)', color: 'var(--text-primary)',
                      border: '1px solid var(--border)', borderRadius: 6,
                      cursor: page >= totalPages ? 'not-allowed' : 'pointer',
                      opacity: page >= totalPages ? 0.4 : 1,
                    }}
                  >
                    Next <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {isModalOpen && selectedLeadId && (
        <LeadDetailsModal 
          leadId={selectedLeadId} 
          onClose={() => {
            setIsModalOpen(false);
            setSelectedLeadId(null);
          }} 
        />
      )}

      <style>{`
        .table-row-hover:hover {
          background: var(--bg-hover) !important;
        }
        .search-box:focus-within {
          border-color: var(--accent) !important;
          box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.15) !important;
        }
      `}</style>
    </AppLayout>
  );
}

function LeadDetailsModal({ leadId, onClose }: { leadId: string, onClose: () => void }) {
  const qc = useQueryClient();
  const [newComment, setNewComment] = useState('');
  const [activeTab, setActiveTab] = useState<'history' | 'comments'>('comments');

  const { data: leadData, isLoading: isLeadLoading } = useQuery({
    queryKey: ['lead-details', leadId],
    queryFn: () => leadsService.get(leadId),
  });

  const { data: historyData, isLoading: isHistoryLoading } = useQuery({
    queryKey: ['lead-history', leadId],
    queryFn: () => callsService.list({ leadId }),
  });

  const addCommentMutation = useMutation({
    mutationFn: (content: string) => leadsService.addComment(leadId, content),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['lead-details', leadId] });
      toast.success('Comment added successfully');
      setNewComment('');
    },
    onError: () => toast.error('Failed to save comment')
  });

  const lead = leadData?.data?.data;
  const history = historyData?.data?.data?.logs || [];
  const comments = lead?.comments || [];

  const overlayStyle: React.CSSProperties = {
    position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: 20, zIndex: 1200,
  };

  if (isLeadLoading || !lead) {
    return (
      <div style={overlayStyle} onClick={onClose}>
        <div onClick={(e) => e.stopPropagation()} style={{
          background: '#fff', borderRadius: 14, padding: 40,
          fontSize: 14, color: '#475569',
        }}>
          Loading customer data...
        </div>
      </div>
    );
  }

  const statusKey = (lead.status || 'uncontacted') as keyof typeof STATUS_COLORS;
  const statusTheme = STATUS_COLORS[statusKey] || STATUS_COLORS.uncontacted;
  const statusLabel = STATUS_LABELS[lead.status] || (lead.status || 'uncontacted').replace('_', ' ');

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#fff', borderRadius: 14, width: 'min(960px, 100%)',
          maxHeight: '92vh', display: 'flex', flexDirection: 'column',
          overflow: 'hidden', boxShadow: '0 30px 80px rgba(0,0,0,0.25)',
          fontFamily: 'system-ui, -apple-system, sans-serif',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '18px 24px', borderBottom: '1px solid #f1f5f9',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div>
            <div style={{ fontSize: 11, textTransform: 'uppercase', color: '#94a3b8', fontWeight: 600, letterSpacing: '0.06em' }}>
              Customer Profile
            </div>
            <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2, fontFamily: 'ui-monospace, monospace' }}>
              Lead ID: {lead.id}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent', border: 'none', cursor: 'pointer',
              color: '#64748b', padding: 6, borderRadius: 6, display: 'flex',
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = '#f1f5f9'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
          >
            <span style={{ fontSize: 20, lineHeight: 1 }}>×</span>
          </button>
        </div>

        {/* Body */}
        <div style={{
          display: 'grid', gridTemplateColumns: '300px 1fr',
          flex: 1, overflow: 'hidden',
        }}>
          {/* Left: Profile */}
          <div style={{
            padding: 24, background: '#f8fafc', borderRight: '1px solid #f1f5f9',
            display: 'flex', flexDirection: 'column', gap: 22,
            overflowY: 'auto',
          }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{
                width: 72, height: 72, margin: '0 auto 12px',
                borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                color: '#fff', fontSize: 26, fontWeight: 700,
              }}>
                {(lead.name?.charAt(0) || 'U').toUpperCase()}
              </div>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#0f172a' }}>
                {lead.name || 'Unknown'}
              </div>
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                marginTop: 8, padding: '4px 10px', borderRadius: 999,
                background: statusTheme.bg, color: statusTheme.fg,
                fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em',
              }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: statusTheme.dot }} />
                {statusLabel}
              </div>
            </div>

            {[
              { icon: <Phone size={13} />, label: 'Phone', value: lead.phone },
              { icon: <Mail size={13} />, label: 'Email', value: lead.email || 'Not provided' },
              { icon: <Hash size={13} />, label: 'Campaign', value: lead.campaign?.name || 'N/A' },
              { icon: <Calendar size={13} />, label: 'Registered', value: new Date(lead.createdAt).toLocaleDateString() },
            ].map((item, i) => (
              <div key={i}>
                <div style={{
                  fontSize: 10, color: '#94a3b8', textTransform: 'uppercase',
                  fontWeight: 700, letterSpacing: '0.06em',
                  display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5,
                }}>
                  {item.icon} {item.label}
                </div>
                <div style={{ fontWeight: 500, fontSize: 13, color: '#0f172a' }}>
                  {item.value}
                </div>
              </div>
            ))}
          </div>

          {/* Right: Tabs */}
          <div style={{
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
          }}>
            <div style={{
              display: 'flex', borderBottom: '1px solid #f1f5f9', padding: '0 20px',
            }}>
              {[
                { key: 'comments' as const, label: `Internal Notes (${comments.length})`, Icon: MessageSquare },
                { key: 'history' as const, label: `Call Logs (${history.length})`, Icon: History },
              ].map(({ key, label, Icon }) => {
                const active = activeTab === key;
                return (
                  <button
                    key={key}
                    onClick={() => setActiveTab(key)}
                    style={{
                      padding: '14px 16px', fontSize: 13, fontWeight: 600,
                      background: 'transparent', border: 'none',
                      borderBottom: active ? '2px solid #6366f1' : '2px solid transparent',
                      color: active ? '#6366f1' : '#64748b', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', gap: 8,
                    }}
                  >
                    <Icon size={14} /> {label}
                  </button>
                );
              })}
            </div>

            <div style={{ flex: 1, padding: 20, overflowY: 'auto', background: '#fff' }}>
              {activeTab === 'comments' ? (
                comments.length === 0 ? (
                  <EmptyState icon={<MessageSquare size={20} />} text="No internal notes yet." />
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {comments.map((comment: any) => (
                      <div key={comment.id} style={{
                        background: '#f8fafc', border: '1px solid #e2e8f0',
                        padding: 14, borderRadius: 10,
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                          <span style={{ fontWeight: 700, fontSize: 12, color: '#6366f1' }}>
                            {comment.agent.name}
                          </span>
                          <span style={{ fontSize: 11, color: '#94a3b8' }}>
                            {new Date(comment.createdAt).toLocaleString()}
                          </span>
                        </div>
                        <div style={{ fontSize: 13, color: '#334155', lineHeight: 1.5 }}>
                          {comment.content}
                        </div>
                      </div>
                    ))}
                  </div>
                )
              ) : isHistoryLoading ? (
                <EmptyState text="Loading logs..." />
              ) : history.length === 0 ? (
                <EmptyState icon={<History size={20} />} text="No call logs found." />
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {history.map((log: any) => (
                    <div key={log.id} style={{
                      background: '#f8fafc', border: '1px solid #e2e8f0',
                      padding: 14, borderRadius: 10,
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                        <span style={{
                          background: '#dcfce7', color: '#15803d',
                          padding: '2px 8px', borderRadius: 999,
                          fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
                        }}>
                          {log.dispositionTag}
                        </span>
                        <span style={{ fontSize: 11, color: '#94a3b8' }}>
                          {new Date(log.calledAt).toLocaleString()}
                        </span>
                      </div>
                      <div style={{ fontSize: 12, color: '#334155', marginBottom: 4 }}>
                        Agent: <strong>{log.agent.name}</strong> · Duration: {log.durationSeconds}s
                      </div>
                      {log.notes && (
                        <div style={{ fontSize: 12, color: '#64748b', fontStyle: 'italic' }}>
                          "{log.notes}"
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {activeTab === 'comments' && (
              <div style={{
                padding: 16, borderTop: '1px solid #f1f5f9', background: '#f8fafc',
              }}>
                <textarea
                  rows={3}
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  placeholder="Type a new internal note..."
                  style={{
                    width: '100%', padding: '10px 12px', fontSize: 13,
                    border: '1px solid #cbd5e1', borderRadius: 8,
                    background: '#fff', color: '#0f172a',
                    resize: 'none', fontFamily: 'inherit', outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
                  <button
                    disabled={!newComment.trim() || addCommentMutation.isPending}
                    onClick={() => addCommentMutation.mutate(newComment)}
                    style={{
                      padding: '8px 22px', fontSize: 13, fontWeight: 600,
                      background: newComment.trim() ? '#6366f1' : '#cbd5e1',
                      color: '#fff', border: 'none', borderRadius: 8,
                      cursor: newComment.trim() && !addCommentMutation.isPending ? 'pointer' : 'not-allowed',
                    }}
                  >
                    {addCommentMutation.isPending ? 'Saving...' : 'Save Note'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function EmptyState({ icon, text }: { icon?: React.ReactNode; text: string }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: '60px 20px', color: '#94a3b8', fontSize: 13, gap: 10,
    }}>
      {icon && <div style={{ color: '#cbd5e1' }}>{icon}</div>}
      {text}
    </div>
  );
}

