import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { leadsService, callsService } from '../../services/crm.service';
import AppLayout from '../../components/layout/AppLayout';
import { 
  Search, User, Phone, Calendar, MessageSquare, 
  ExternalLink, ChevronRight, Mail, Hash, Clock, History
} from 'lucide-react';
import toast from 'react-hot-toast';

interface Lead {
  id: string;
  name: string | null;
  phone: string; // Masked
  email: string | null;
  status: string;
  priority: string;
  createdAt: string;
  lastCalledAt: string | null;
  campaign?: { name: string };
}

export default function AgentLeadsPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['agent-interested-leads'],
    queryFn: () => leadsService.list({ status: 'lead' }),
  });

  const leads: Lead[] = data?.data?.data?.leads || [];
  const filteredLeads = leads.filter(l => 
    l.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    l.phone.includes(searchTerm)
  );

  return (
    <AppLayout>
      <div className="page-container">
        <div className="page-header">
          <div>
            <h1 className="page-title">Interested Leads</h1>
            <p className="page-subtitle">Your pipeline of high-potential customers</p>
          </div>
        </div>

        <div className="card" style={{ border: 'none', background: 'transparent' }}>
          <div className="search-box" style={{ 
            maxWidth: '100%', 
            marginBottom: 20, 
            background: 'var(--bg-surface)', 
            border: '1px solid var(--border)',
            padding: '12px 16px',
            borderRadius: 'var(--radius-lg)',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            boxShadow: 'var(--shadow)'
          }}>
            <Search size={20} style={{ color: 'var(--accent)' }} />
            <input 
              type="text" 
              className="search-input" 
              placeholder="Filter by name, phone, or email..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{ background: 'none', border: 'none', width: '100%', fontSize: '1rem', color: 'var(--text-primary)', outline: 'none' }}
            />
          </div>

          <div className="card" style={{ overflow: 'hidden' }}>
            <div className="table-container">
              <table className="table">
                <thead style={{ background: 'var(--bg-elevated)' }}>
                  <tr>
                    <th style={{ padding: '16px 20px', textAlign: 'left', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Lead Information</th>
                    <th style={{ padding: '16px 20px', textAlign: 'left', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Campaign</th>
                    <th style={{ padding: '16px 20px', textAlign: 'left', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Last Activity</th>
                    <th style={{ padding: '16px 20px', textAlign: 'right', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Actions</th>
                  </tr>
                </thead>
                <tbody style={{ background: 'var(--bg-surface)' }}>
                  {isLoading ? (
                    <tr><td colSpan={4}><div className="empty-state">Loading your leads...</div></td></tr>
                  ) : filteredLeads.length === 0 ? (
                    <tr><td colSpan={4}><div className="empty-state">No matching leads found.</div></td></tr>
                  ) : (
                    filteredLeads.map((lead) => (
                      <tr key={lead.id} className="table-row-hover" style={{ borderBottom: '1px solid var(--border)', transition: 'background 0.2s' }}>
                        <td style={{ padding: '16px 20px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <div className="avatar avatar--sm" style={{ background: 'var(--accent-subtle)', color: 'var(--accent)' }}>
                              {lead.name?.charAt(0) || <User size={14} />}
                            </div>
                            <div>
                              <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{lead.name || 'Unknown'}</div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 2 }}>
                                <Phone size={12} /> {lead.phone}
                                {lead.email && <span style={{ opacity: 0.5 }}>•</span>}
                                {lead.email && <span>{lead.email}</span>}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td style={{ padding: '16px 20px' }}>
                          <span className="badge" style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)', border: '1px solid var(--border-subtle)' }}>
                            {lead.campaign?.name || 'Standard'}
                          </span>
                        </td>
                        <td style={{ padding: '16px 20px' }}>
                          <div style={{ fontSize: '0.875rem' }}>
                            {lead.lastCalledAt ? (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-secondary)' }}>
                                <Clock size={14} /> {new Date(lead.lastCalledAt).toLocaleDateString()}
                              </div>
                            ) : (
                              <span style={{ color: 'var(--text-muted)' }}>Never called</span>
                            )}
                          </div>
                        </td>
                        <td style={{ padding: '16px 20px', textAlign: 'right' }}>
                          <button 
                            className="btn btn-primary btn-sm"
                            style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                            onClick={() => {
                              setSelectedLeadId(lead.id);
                              setIsModalOpen(true);
                            }}
                          >
                            <ExternalLink size={14} /> View File
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
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

  if (isLeadLoading) return (
    <div className="modal-overlay"><div className="modal-content"><div className="empty-state">Loading customer data...</div></div></div>
  );

  return (
    <div className="modal-overlay" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div className="modal-content" style={{ 
        maxWidth: 900, 
        width: '100%', 
        maxHeight: '90vh', 
        display: 'flex', 
        flexDirection: 'column',
        borderRadius: 'var(--radius-xl)',
        boxShadow: 'var(--shadow-lg)'
      }}>
        <div className="modal-header" style={{ padding: '20px 24px' }}>
          <div>
            <h3 className="modal-title" style={{ fontSize: '1.25rem' }}>Customer Profile</h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Lead ID: {lead.id}</p>
          </div>
          <button className="btn-icon" onClick={onClose} style={{ fontSize: '1.5rem' }}>&times;</button>
        </div>
        
        <div className="modal-body" style={{ 
          display: 'grid', 
          gridTemplateColumns: '320px 1fr', 
          gap: 0, 
          padding: 0, 
          overflow: 'hidden',
          flex: 1
        }}>
          {/* Left Panel: Info */}
          <div style={{ 
            padding: 24, 
            background: 'var(--bg-elevated)', 
            borderRight: '1px solid var(--border)',
            display: 'flex',
            flexDirection: 'column',
            gap: 20
          }}>
            <div style={{ textAlign: 'center', marginBottom: 12 }}>
              <div className="avatar" style={{ width: 64, height: 64, margin: '0 auto 12px', fontSize: '1.5rem', background: 'linear-gradient(135deg, var(--accent), var(--purple))' }}>
                {lead.name?.charAt(0) || <User size={28} />}
              </div>
              <h4 style={{ fontSize: '1.1rem', fontWeight: 700 }}>{lead.name || 'Unknown'}</h4>
              <span className="badge" style={{ marginTop: 6, background: 'var(--green-subtle)', color: 'var(--green)' }}>
                {lead.status.replace('_', ' ').toUpperCase()}
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {[
                { icon: <Phone size={14} />, label: 'Phone', value: lead.phone },
                { icon: <Mail size={14} />, label: 'Email', value: lead.email || 'Not provided' },
                { icon: <Hash size={14} />, label: 'Campaign', value: lead.campaign?.name || 'N/A' },
                { icon: <Calendar size={14} />, label: 'Registered', value: new Date(lead.createdAt).toLocaleDateString() },
              ].map((item, i) => (
                <div key={i}>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    {item.icon} {item.label}
                  </div>
                  <div style={{ fontWeight: 500, fontSize: '0.9rem' }}>{item.value}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Right Panel: History & Comments */}
          <div style={{ 
            padding: 0, 
            display: 'flex', 
            flexDirection: 'column', 
            background: 'var(--bg-surface)',
            height: '100%',
            overflow: 'hidden'
          }}>
            {/* Tabs */}
            <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', padding: '0 24px' }}>
              <button 
                onClick={() => setActiveTab('comments')}
                style={{ 
                  padding: '16px 20px', 
                  fontSize: '0.875rem', 
                  fontWeight: 600,
                  background: 'none',
                  border: 'none',
                  borderBottom: activeTab === 'comments' ? '2px solid var(--accent)' : '2px solid transparent',
                  color: activeTab === 'comments' ? 'var(--accent)' : 'var(--text-muted)',
                  cursor: 'pointer'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <MessageSquare size={16} /> Internal Notes ({comments.length})
                </div>
              </button>
              <button 
                onClick={() => setActiveTab('history')}
                style={{ 
                  padding: '16px 20px', 
                  fontSize: '0.875rem', 
                  fontWeight: 600,
                  background: 'none',
                  border: 'none',
                  borderBottom: activeTab === 'history' ? '2px solid var(--accent)' : '2px solid transparent',
                  color: activeTab === 'history' ? 'var(--accent)' : 'var(--text-muted)',
                  cursor: 'pointer'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <History size={16} /> Call Logs ({history.length})
                </div>
              </button>
            </div>

            {/* List Content */}
            <div style={{ flex: 1, padding: 24, overflowY: 'auto' }}>
              {activeTab === 'comments' ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {comments.length === 0 ? (
                    <div className="empty-state">No internal notes yet.</div>
                  ) : (
                    comments.map((comment: any) => (
                      <div key={comment.id} style={{ background: 'var(--bg-elevated)', padding: 16, borderRadius: 'var(--radius)', border: '1px solid var(--border-subtle)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                          <span style={{ fontWeight: 700, fontSize: '0.8rem', color: 'var(--accent)' }}>{comment.agent.name}</span>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{new Date(comment.createdAt).toLocaleString()}</span>
                        </div>
                        <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>{comment.content}</div>
                      </div>
                    ))
                  )}
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {isHistoryLoading ? (
                    <div className="empty-state">Loading logs...</div>
                  ) : history.length === 0 ? (
                    <div className="empty-state">No call logs found.</div>
                  ) : (
                    history.map((log: any) => (
                      <div key={log.id} style={{ background: 'var(--bg-elevated)', padding: 16, borderRadius: 'var(--radius)', border: '1px solid var(--border-subtle)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                          <span className="badge" style={{ background: 'rgba(34,197,94,0.1)', color: 'var(--green)', fontSize: '0.65rem' }}>{log.dispositionTag.toUpperCase()}</span>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{new Date(log.calledAt).toLocaleString()}</span>
                        </div>
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-primary)', marginBottom: 4 }}>
                          Agent: <strong>{log.agent.name}</strong> • Duration: {log.durationSeconds}s
                        </div>
                        {log.notes && <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>"{log.notes}"</div>}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* Note Input Footer (Only in comments tab) */}
            {activeTab === 'comments' && (
              <div style={{ 
                padding: 20, 
                borderTop: '1px solid var(--border)', 
                background: 'var(--bg-elevated)'
              }}>
                <div className="form-group">
                  <textarea 
                    className="form-input" 
                    rows={3} 
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    placeholder="Type a new internal note..."
                    style={{ background: 'var(--bg-surface)', resize: 'none' }}
                  />
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
                    <button 
                      className="btn btn-primary" 
                      disabled={!newComment.trim() || addCommentMutation.isPending}
                      onClick={() => addCommentMutation.mutate(newComment)}
                      style={{ padding: '10px 24px' }}
                    >
                      {addCommentMutation.isPending ? 'Saving...' : 'Save Note'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
