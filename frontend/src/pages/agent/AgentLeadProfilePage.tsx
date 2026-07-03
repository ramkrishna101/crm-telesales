import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Calendar, Check, Copy, Hash, History, Languages, Mail, MessageSquare, Phone, X } from 'lucide-react';
import toast from 'react-hot-toast';
import AppLayout from '../../components/layout/AppLayout';
import Dropdown from '../../components/ui/Dropdown';
import { callsService, leadsService, tagsService } from '../../services/crm.service';

const STATUS_COLORS: Record<string, { bg: string; fg: string; dot: string }> = {
  uncontacted: { bg: '#eef2f7', fg: '#475569', dot: '#94a3b8' },
  contacted: { bg: '#e0f2fe', fg: '#0369a1', dot: '#0ea5e9' },
  lead: { bg: '#dcfce7', fg: '#15803d', dot: '#22c55e' },
  callback: { bg: '#fef9c3', fg: '#a16207', dot: '#eab308' },
  not_interested: { bg: '#fee2e2', fg: '#b91c1c', dot: '#ef4444' },
  dnd: { bg: '#fce7f3', fg: '#9d174d', dot: '#ec4899' },
  invalid: { bg: '#f1f5f9', fg: '#64748b', dot: '#94a3b8' },
};

const STATUS_LABELS: Record<string, string> = {
  uncontacted: 'New Lead',
  contacted: 'Contacted',
  lead: 'Interested',
  callback: 'Callback',
  not_interested: 'Not Interested',
  dnd: 'DND',
  invalid: 'Invalid',
};

type ActiveTab = 'comments' | 'history';

const FOLLOWUP_STATUS_OPTIONS = [
  { value: 'uncontacted', label: 'New Lead' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'lead', label: 'Interested' },
  { value: 'callback', label: 'Callback' },
  { value: 'not_interested', label: 'Not Interested' },
  { value: 'dnd', label: 'DND' },
  { value: 'invalid', label: 'Invalid' },
] as const;

const COMMON_LANGUAGE_OPTIONS = ['Hindi', 'Kannada', 'Telugu', 'Tamil', 'Malayalam', 'Not Required', 'Other'];

function maskPhone(phone?: string | null) {
  if (!phone) return '—';
  return phone.slice(0, -4).replace(/[0-9]/g, 'X') + phone.slice(-4);
}

function isFreshLead(lead?: { status?: string | null; lastCalledAt?: string | Date | null }, latestCallResult?: string | null) {
  return (lead?.status || 'uncontacted') === 'uncontacted' && !lead?.lastCalledAt && !latestCallResult;
}

export default function AgentLeadProfilePage() {
  const navigate = useNavigate();
  const { leadId = '' } = useParams();
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<ActiveTab>('comments');
  const [newComment, setNewComment] = useState('');
  const [statusDraft, setStatusDraft] = useState('');
  const [callResultDraft, setCallResultDraft] = useState('');
  const [languageDraft, setLanguageDraft] = useState('');

  const copyPhone = async () => {
    try {
      const response = await leadsService.getPhone(leadId);
      const phone = response.data?.data?.phone;
      if (!phone) {
        toast.error('Phone number unavailable');
        return;
      }

      await navigator.clipboard.writeText(phone);
      toast.success(`Copied: ${phone}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Clipboard not available';
      toast.error(message);
    }
  };

  const { data: leadData, isLoading: isLeadLoading } = useQuery({
    queryKey: ['lead-details', leadId],
    queryFn: () => leadsService.get(leadId),
    enabled: !!leadId,
  });

  const { data: historyData, isLoading: isHistoryLoading } = useQuery({
    queryKey: ['lead-history', leadId],
    queryFn: () => callsService.list({ leadId }),
    enabled: !!leadId,
  });

  const { data: tagsData } = useQuery({
    queryKey: ['disposition-tags'],
    queryFn: () => tagsService.list(),
    staleTime: 5 * 60 * 1000,
  });

  const addCommentMutation = useMutation({
    mutationFn: (content: string) => leadsService.addComment(leadId, content),
    onMutate: () => {
      setNewComment('');
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['lead-details', leadId] });
      toast.success('Comment added successfully');
    },
    onError: () => toast.error('Failed to save comment'),
  });

  const updateStatusMutation = useMutation({
    mutationFn: (status: string) => leadsService.updateStatus(leadId, status),
    onMutate: async (status) => {
      await qc.cancelQueries({ queryKey: ['lead-details', leadId] });
      const previous = qc.getQueryData(['lead-details', leadId]);
      qc.setQueryData(['lead-details', leadId], (old: any) =>
        old ? { ...old, data: { ...old.data, data: { ...old.data.data, status } } } : old);
      return { previous };
    },
    onSuccess: () => {
      toast.success('Follow-up status updated');
    },
    onError: (_err, _vars, ctx: any) => {
      if (ctx?.previous) qc.setQueryData(['lead-details', leadId], ctx.previous);
      toast.error('Failed to update follow-up status');
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['lead-details', leadId] });
      qc.invalidateQueries({ queryKey: ['agent-leads'] });
    },
  });

  const updateCallResultMutation = useMutation({
    mutationFn: (dispositionTag: string) => leadsService.updateCallResult(leadId, dispositionTag),
    onMutate: async (dispositionTag) => {
      await qc.cancelQueries({ queryKey: ['lead-details', leadId] });
      const previous = qc.getQueryData(['lead-details', leadId]);
      qc.setQueryData(['lead-details', leadId], (old: any) => {
        if (!old) return old;
        const lead = old.data.data;
        const callLogs = Array.isArray(lead.callLogs) && lead.callLogs.length
          ? [{ ...lead.callLogs[0], dispositionTag }, ...lead.callLogs.slice(1)]
          : lead.callLogs;
        return { ...old, data: { ...old.data, data: { ...lead, callLogs } } };
      });
      return { previous };
    },
    onSuccess: () => {
      toast.success('Call result updated');
    },
    onError: (error: any, _vars, ctx: any) => {
      if (ctx?.previous) qc.setQueryData(['lead-details', leadId], ctx.previous);
      toast.error(error?.response?.data?.error?.message || 'Failed to update call result');
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['lead-details', leadId] });
      qc.invalidateQueries({ queryKey: ['lead-history', leadId] });
      qc.invalidateQueries({ queryKey: ['agent-leads'] });
    },
  });

  const updateLanguageMutation = useMutation({
    mutationFn: (language: string) => leadsService.updateLanguage(leadId, language),
    onMutate: async (language) => {
      await qc.cancelQueries({ queryKey: ['lead-details', leadId] });
      const previous = qc.getQueryData(['lead-details', leadId]);
      qc.setQueryData(['lead-details', leadId], (old: any) =>
        old ? { ...old, data: { ...old.data, data: { ...old.data.data, language } } } : old);
      return { previous };
    },
    onSuccess: () => {
      toast.success('Language updated');
    },
    onError: (error: any, _vars, ctx: any) => {
      if (ctx?.previous) qc.setQueryData(['lead-details', leadId], ctx.previous);
      toast.error(error?.response?.data?.error?.message || 'Failed to update language');
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['lead-details', leadId] });
      qc.invalidateQueries({ queryKey: ['agent-leads'] });
    },
  });

  const lead = leadData?.data?.data;
  const history = historyData?.data?.data?.logs || [];
  const comments = lead?.comments || [];
  const dispositionTags: { name: string; color?: string | null }[] = tagsData?.data?.data || tagsData?.data || [];
  const currentLanguage = lead?.language || lead?.lastCallLanguage || '';
  const availableLanguageOptions = Array.from(
    new Map(
      [...COMMON_LANGUAGE_OPTIONS, currentLanguage, languageDraft]
        .filter((value): value is string => Boolean(value && value.trim()))
        .map((value) => [value.toLowerCase(), value]),
    ).values(),
  ).sort((left, right) => left.localeCompare(right));
  const latestCallResult = history[0]?.dispositionTag || '';
  const showNewLeadState = isFreshLead(lead, latestCallResult);
  const hasStatusChange = Boolean(statusDraft && statusDraft !== (lead?.status || ''));
  const hasCallResultChange = Boolean(callResultDraft && callResultDraft !== latestCallResult);
  const hasLanguageChange = Boolean(languageDraft && languageDraft !== currentLanguage);

  useEffect(() => {
    setStatusDraft(lead?.status || '');
  }, [lead?.status]);

  useEffect(() => {
    setCallResultDraft(latestCallResult);
  }, [latestCallResult]);

  useEffect(() => {
    setLanguageDraft(currentLanguage);
  }, [currentLanguage]);

  const statusTheme = useMemo(() => {
    const statusKey = (lead?.status || 'uncontacted') as keyof typeof STATUS_COLORS;
    return STATUS_COLORS[statusKey] || STATUS_COLORS.uncontacted;
  }, [lead?.status]);

  const statusLabel = showNewLeadState
    ? 'New Lead'
    : (STATUS_LABELS[lead?.status || 'uncontacted'] || (lead?.status || 'uncontacted').replace('_', ' '));

  const mobilePairGridStyle = {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 0.85fr) minmax(0, 1.15fr)',
    columnGap: 14,
    rowGap: 8,
    width: '100%',
    alignItems: 'start',
  } as const;

  const mobileControlRowStyle = {
    display: 'flex',
    gap: 4,
    alignItems: 'center',
    width: '100%',
    minWidth: 0,
  } as const;

  const mobileActionGroupStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: 3,
    width: 38,
    minWidth: 38,
    justifyContent: 'flex-end',
  } as const;

  const mobileActionButtonStyle = {
    width: 17,
    height: 17,
    borderRadius: 4,
    border: 'none',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
  } as const;

  return (
    <AppLayout>
      <div className="agent-mobile-stack agent-mobile-profile-page">
        <section className="agent-mobile-summary-card">
          <button type="button" className="agent-mobile-back-btn" onClick={() => navigate('/agent/leads')}>
            <ArrowLeft size={16} /> Back to leads
          </button>

          <div className="section-eyebrow" style={{ marginTop: 12 }}>Customer Profile</div>

          {isLeadLoading || !lead ? (
            <div className="card--mobile" style={{ marginTop: 14 }}>
              <div className="empty-state">Loading customer data...</div>
            </div>
          ) : (
            <>
              <div className="agent-mobile-profile-hero">
                <div className="agent-mobile-profile-avatar agent-mobile-profile-avatar--lg">
                  {(lead.name?.charAt(0) || 'U').toUpperCase()}
                </div>
                <div className="agent-mobile-profile-hero__copy">
                  <h1 className="agent-mobile-section-title">{lead.name || 'Unknown'}</h1>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div className="agent-mobile-lead-phone">{maskPhone(lead.phone)}</div>
                    <button
                      type="button"
                      onClick={() => void copyPhone()}
                      aria-label="Copy phone number"
                      title="Copy phone number"
                      style={{
                        border: 'none',
                        background: 'transparent',
                        color: '#94a3b8',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: 0,
                        cursor: 'pointer',
                      }}
                    >
                      <Copy size={14} />
                    </button>
                  </div>
                  <div
                    className="agent-mobile-profile-status"
                    style={{ background: statusTheme.bg, color: statusTheme.fg }}
                  >
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: statusTheme.dot }} />
                    {statusLabel}
                  </div>
                </div>
              </div>

              <section className="card card--mobile">
                <div className="agent-mobile-detail-list">
                  <div className="agent-mobile-detail-item">
                    <div style={mobilePairGridStyle}>
                      <div className="agent-mobile-detail-label"><Phone size={14} /> Phone</div>
                      <div className="agent-mobile-detail-label">Follow-up Status</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                        <div className="agent-mobile-detail-value">{maskPhone(lead.phone)}</div>
                        <button
                          type="button"
                          onClick={() => void copyPhone()}
                          aria-label="Copy phone number"
                          title="Copy phone number"
                          style={{ border: 'none', background: 'transparent', color: '#94a3b8', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 0, cursor: 'pointer' }}
                        >
                          <Copy size={14} />
                        </button>
                      </div>
                      <div style={mobileControlRowStyle}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <Dropdown
                            value={statusDraft}
                            onChange={setStatusDraft}
                            options={FOLLOWUP_STATUS_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
                            placeholder="Status"
                            height={30}
                          />
                        </div>
                        <div style={mobileActionGroupStyle}>
                          <button
                            type="button"
                            aria-label="Save follow-up status"
                            title="Save follow-up status"
                            disabled={!hasStatusChange || updateStatusMutation.isPending}
                            onClick={() => {
                              if (hasStatusChange) updateStatusMutation.mutate(statusDraft);
                            }}
                            style={{ ...mobileActionButtonStyle, background: '#dcfce7', color: '#15803d', cursor: hasStatusChange ? 'pointer' : 'default', opacity: hasStatusChange ? (updateStatusMutation.isPending ? 0.45 : 1) : 0, pointerEvents: hasStatusChange ? 'auto' : 'none' }}
                          >
                            <Check size={10} />
                          </button>
                          <button
                            type="button"
                            aria-label="Reset follow-up status"
                            title="Reset follow-up status"
                            disabled={!hasStatusChange}
                            onClick={() => {
                              if (hasStatusChange) setStatusDraft(lead.status || '');
                            }}
                            style={{ ...mobileActionButtonStyle, background: '#f1f5f9', color: '#64748b', cursor: hasStatusChange ? 'pointer' : 'default', opacity: hasStatusChange ? 1 : 0, pointerEvents: hasStatusChange ? 'auto' : 'none' }}
                          >
                            <X size={10} />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="agent-mobile-detail-item">
                    <div style={mobilePairGridStyle}>
                      <div className="agent-mobile-detail-label"><Mail size={14} /> Email</div>
                      <div className="agent-mobile-detail-label">Call Result</div>
                      <div className="agent-mobile-detail-value">{lead.email || 'Not provided'}</div>
                      <div style={mobileControlRowStyle}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <Dropdown
                            value={callResultDraft}
                            onChange={setCallResultDraft}
                            options={dispositionTags.map((tag) => ({ value: tag.name, label: tag.name, colour: tag.color || undefined }))}
                            placeholder={showNewLeadState ? 'New Lead' : 'Select call result'}
                            height={30}
                          />
                        </div>
                        <div style={mobileActionGroupStyle}>
                          <button
                            type="button"
                            aria-label="Save call result"
                            title="Save call result"
                            disabled={!hasCallResultChange || updateCallResultMutation.isPending}
                            onClick={() => {
                              if (hasCallResultChange) updateCallResultMutation.mutate(callResultDraft);
                            }}
                            style={{ ...mobileActionButtonStyle, background: '#dcfce7', color: '#15803d', cursor: hasCallResultChange ? 'pointer' : 'default', opacity: hasCallResultChange ? (updateCallResultMutation.isPending ? 0.45 : 1) : 0, pointerEvents: hasCallResultChange ? 'auto' : 'none' }}
                          >
                            <Check size={10} />
                          </button>
                          <button
                            type="button"
                            aria-label="Reset call result"
                            title="Reset call result"
                            disabled={!hasCallResultChange}
                            onClick={() => {
                              if (hasCallResultChange) setCallResultDraft(latestCallResult);
                            }}
                            style={{ ...mobileActionButtonStyle, background: '#f1f5f9', color: '#64748b', cursor: hasCallResultChange ? 'pointer' : 'default', opacity: hasCallResultChange ? 1 : 0, pointerEvents: hasCallResultChange ? 'auto' : 'none' }}
                          >
                            <X size={10} />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="agent-mobile-detail-item">
                    <div style={mobilePairGridStyle}>
                      <div className="agent-mobile-detail-label"><Hash size={14} /> Campaign</div>
                      <div className="agent-mobile-detail-label"><Languages size={14} /> Language</div>
                      <div className="agent-mobile-detail-value">{lead.campaign?.name || 'N/A'}</div>
                      <div style={mobileControlRowStyle}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <Dropdown
                            value={languageDraft}
                            onChange={setLanguageDraft}
                            options={availableLanguageOptions.map((language) => ({ value: language, label: language }))}
                            placeholder="Select language"
                            height={30}
                          />
                        </div>
                        <div style={mobileActionGroupStyle}>
                          <button
                            type="button"
                            aria-label="Save language"
                            title="Save language"
                            disabled={!hasLanguageChange || updateLanguageMutation.isPending}
                            onClick={() => {
                              if (hasLanguageChange) updateLanguageMutation.mutate(languageDraft);
                            }}
                            style={{ ...mobileActionButtonStyle, background: '#dcfce7', color: '#15803d', cursor: hasLanguageChange ? 'pointer' : 'default', opacity: hasLanguageChange ? (updateLanguageMutation.isPending ? 0.45 : 1) : 0, pointerEvents: hasLanguageChange ? 'auto' : 'none' }}
                          >
                            <Check size={10} />
                          </button>
                          <button
                            type="button"
                            aria-label="Reset language"
                            title="Reset language"
                            disabled={!hasLanguageChange}
                            onClick={() => {
                              if (hasLanguageChange) setLanguageDraft(currentLanguage);
                            }}
                            style={{ ...mobileActionButtonStyle, background: '#f1f5f9', color: '#64748b', cursor: hasLanguageChange ? 'pointer' : 'default', opacity: hasLanguageChange ? 1 : 0, pointerEvents: hasLanguageChange ? 'auto' : 'none' }}
                          >
                            <X size={10} />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="agent-mobile-detail-item">
                    <div className="agent-mobile-detail-label"><Calendar size={14} /> Registered</div>
                    <div className="agent-mobile-detail-value">{new Date(lead.createdAt).toLocaleDateString()}</div>
                  </div>
                  <div className="agent-mobile-detail-item">
                    <div className="agent-mobile-detail-label"><Phone size={14} /> Lead ID</div>
                    <div className="agent-mobile-detail-value" style={{ fontFamily: 'ui-monospace, monospace' }}>{lead.id}</div>
                  </div>
                </div>
              </section>

              <section className="card card--mobile">
                <div className="agent-mobile-tab-row">
                  <button
                    type="button"
                    className={activeTab === 'comments' ? 'btn btn-primary' : 'btn btn-secondary'}
                    onClick={() => setActiveTab('comments')}
                  >
                    <MessageSquare size={14} /> Notes
                  </button>
                  <button
                    type="button"
                    className={activeTab === 'history' ? 'btn btn-primary' : 'btn btn-secondary'}
                    onClick={() => setActiveTab('history')}
                  >
                    <History size={14} /> Call History
                  </button>
                </div>

                <div style={{ marginTop: 16 }}>
                  {activeTab === 'comments' ? (
                    comments.length === 0 ? (
                      <EmptyState icon={<MessageSquare size={20} />} text="No internal notes yet." />
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {comments.map((comment: any) => (
                          <div
                            key={comment.id}
                            style={{
                              background: '#f8fafc',
                              border: '1px solid #e2e8f0',
                              padding: 14,
                              borderRadius: 10,
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, gap: 8 }}>
                              <span style={{ fontWeight: 700, fontSize: 12, color: '#6366f1' }}>
                                {comment.agent?.name || 'Agent'}
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
                        <div
                          key={log.id}
                          style={{
                            background: '#f8fafc',
                            border: '1px solid #e2e8f0',
                            padding: 14,
                            borderRadius: 10,
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, gap: 8 }}>
                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                              <span
                                style={{
                                  background: '#dcfce7',
                                  color: '#15803d',
                                  padding: '2px 8px',
                                  borderRadius: 999,
                                  fontSize: 10,
                                  fontWeight: 700,
                                  textTransform: 'uppercase',
                                }}
                              >
                                {log.dispositionTag || 'Unknown'}
                              </span>
                              {log.isManual ? (
                                <span style={{ background: '#fff1f2', color: '#be123c', padding: '2px 8px', borderRadius: 999, fontSize: 10, fontWeight: 700, textTransform: 'uppercase' }}>
                                  Manual Log
                                </span>
                              ) : null}
                            </div>
                            <span style={{ fontSize: 11, color: '#94a3b8' }}>
                              {new Date(log.calledAt).toLocaleString()}
                            </span>
                          </div>
                          <div style={{ fontSize: 12, color: '#334155', marginBottom: log.notes ? 4 : 0 }}>
                            Agent: <strong>{log.agent?.name || 'Unknown'}</strong> · Duration: {log.durationSeconds || 0}s
                          </div>
                          {log.notes ? (
                            <div style={{ fontSize: 12, color: '#64748b', fontStyle: 'italic' }}>
                              "{log.notes}"
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {activeTab === 'comments' ? (
                  <div style={{ marginTop: 16, borderTop: '1px solid #f1f5f9', paddingTop: 16 }}>
                    <textarea
                      rows={3}
                      value={newComment}
                      onChange={(event) => setNewComment(event.target.value)}
                      placeholder="Type a new internal note..."
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        fontSize: 13,
                        border: '1px solid #cbd5e1',
                        borderRadius: 8,
                        background: '#fff',
                        color: '#0f172a',
                        resize: 'none',
                        fontFamily: 'inherit',
                        outline: 'none',
                        boxSizing: 'border-box',
                      }}
                    />
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
                      <button
                        type="button"
                        className="btn btn-primary"
                        disabled={!newComment.trim() || addCommentMutation.isPending}
                        onClick={() => addCommentMutation.mutate(newComment)}
                      >
                        {addCommentMutation.isPending ? 'Saving...' : 'Save Note'}
                      </button>
                    </div>
                  </div>
                ) : null}
              </section>
            </>
          )}
        </section>
      </div>
    </AppLayout>
  );
}

function EmptyState({ icon, text }: { icon?: React.ReactNode; text: string }) {
  return (
    <div className="empty-state" style={{ padding: '40px 20px' }}>
      {icon ? <div style={{ marginBottom: 10, color: '#cbd5e1' }}>{icon}</div> : null}
      {text}
    </div>
  );
}