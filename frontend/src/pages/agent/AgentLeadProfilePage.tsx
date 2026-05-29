import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Calendar, Hash, History, Mail, MessageSquare, Phone } from 'lucide-react';
import toast from 'react-hot-toast';
import AppLayout from '../../components/layout/AppLayout';
import { callsService, leadsService } from '../../services/crm.service';

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
  uncontacted: 'Uncontacted',
  contacted: 'Contacted',
  lead: 'Interested',
  callback: 'Callback',
  not_interested: 'Not Interested',
  dnd: 'DND',
  invalid: 'Invalid',
};

type ActiveTab = 'comments' | 'history';

export default function AgentLeadProfilePage() {
  const navigate = useNavigate();
  const { leadId = '' } = useParams();
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<ActiveTab>('comments');
  const [newComment, setNewComment] = useState('');

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

  const addCommentMutation = useMutation({
    mutationFn: (content: string) => leadsService.addComment(leadId, content),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['lead-details', leadId] });
      toast.success('Comment added successfully');
      setNewComment('');
    },
    onError: () => toast.error('Failed to save comment'),
  });

  const lead = leadData?.data?.data;
  const history = historyData?.data?.data?.logs || [];
  const comments = lead?.comments || [];

  const statusTheme = useMemo(() => {
    const statusKey = (lead?.status || 'uncontacted') as keyof typeof STATUS_COLORS;
    return STATUS_COLORS[statusKey] || STATUS_COLORS.uncontacted;
  }, [lead?.status]);

  const statusLabel = STATUS_LABELS[lead?.status || 'uncontacted'] || (lead?.status || 'uncontacted').replace('_', ' ');

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
                  <div className="agent-mobile-lead-phone">{lead.phone}</div>
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
                    <div className="agent-mobile-detail-label"><Hash size={14} /> Campaign</div>
                    <div className="agent-mobile-detail-value">{lead.campaign?.name || 'N/A'}</div>
                  </div>
                  <div className="agent-mobile-detail-item">
                    <div className="agent-mobile-detail-label"><Calendar size={14} /> Registered</div>
                    <div className="agent-mobile-detail-value">{new Date(lead.createdAt).toLocaleDateString()}</div>
                  </div>
                  <div className="agent-mobile-detail-item">
                    <div className="agent-mobile-detail-label"><Mail size={14} /> Email</div>
                    <div className="agent-mobile-detail-value">{lead.email || 'Not provided'}</div>
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
                    className={`agent-mobile-tab ${activeTab === 'comments' ? 'agent-mobile-tab--active' : ''}`}
                    onClick={() => setActiveTab('comments')}
                  >
                    <MessageSquare size={14} /> Internal Notes ({comments.length})
                  </button>
                  <button
                    type="button"
                    className={`agent-mobile-tab ${activeTab === 'history' ? 'agent-mobile-tab--active' : ''}`}
                    onClick={() => setActiveTab('history')}
                  >
                    <History size={14} /> Call Logs ({history.length})
                  </button>
                </div>

                <div className="agent-mobile-profile-content">
                  {activeTab === 'comments' ? (
                    comments.length === 0 ? (
                      <EmptyState text="No internal notes yet." icon={<MessageSquare size={20} />} />
                    ) : (
                      <div className="agent-mobile-log-list">
                        {comments.map((comment: any) => (
                          <div key={comment.id} className="agent-mobile-log-card">
                            <div className="agent-mobile-log-card__top">
                              <span className="agent-mobile-log-card__actor">{comment.agent.name}</span>
                              <span className="agent-mobile-log-card__time">{new Date(comment.createdAt).toLocaleString()}</span>
                            </div>
                            <div className="agent-mobile-log-card__body">{comment.content}</div>
                          </div>
                        ))}
                      </div>
                    )
                  ) : isHistoryLoading ? (
                    <EmptyState text="Loading logs..." />
                  ) : history.length === 0 ? (
                    <EmptyState text="No call logs found." icon={<History size={20} />} />
                  ) : (
                    <div className="agent-mobile-log-list">
                      {history.map((log: any) => (
                        <div key={log.id} className="agent-mobile-log-card">
                          <div className="agent-mobile-log-card__top">
                            <span className="agent-mobile-log-card__tag">{log.dispositionTag}</span>
                            <span className="agent-mobile-log-card__time">{new Date(log.calledAt).toLocaleString()}</span>
                          </div>
                          <div className="agent-mobile-log-card__meta">
                            Agent: <strong>{log.agent.name}</strong> · Duration: {log.durationSeconds}s
                          </div>
                          {log.notes ? <div className="agent-mobile-log-card__body">"{log.notes}"</div> : null}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </section>

              {activeTab === 'comments' && (
                <section className="card card--mobile agent-mobile-note-composer">
                  <div className="agent-mobile-detail-label"><MessageSquare size={14} /> Add internal note</div>
                  <textarea
                    rows={4}
                    value={newComment}
                    onChange={(event) => setNewComment(event.target.value)}
                    placeholder="Type a new internal note..."
                    className="agent-mobile-note-input"
                  />
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={!newComment.trim() || addCommentMutation.isPending}
                    onClick={() => addCommentMutation.mutate(newComment)}
                  >
                    {addCommentMutation.isPending ? 'Saving...' : 'Save Note'}
                  </button>
                </section>
              )}
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