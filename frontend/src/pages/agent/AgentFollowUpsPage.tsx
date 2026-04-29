import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { followUpsService } from '../../services/crm.service';
import AppLayout from '../../components/layout/AppLayout';
import { Calendar, PhoneCall, RefreshCw, CheckCircle, Clock } from 'lucide-react';
import toast from 'react-hot-toast';

export default function AgentFollowUpsPage() {
  const { data: followUpsData, isLoading, refetch } = useQuery({
    queryKey: ['agent-follow-ups'],
    queryFn: () => followUpsService.list({ status: 'pending' }),
  });

  const followUps = followUpsData?.data?.data?.followUps || [];

  const handleComplete = async (id: string) => {
    try {
      await followUpsService.update(id, { status: 'done' });
      toast.success('Follow-up marked as done');
      refetch();
    } catch (err: any) {
      toast.error('Failed to update follow-up');
    }
  };

  return (
    <AppLayout>
      <div className="page-container">
        <div className="page-header">
          <div>
            <h1 className="page-title">My Follow-ups</h1>
            <p className="page-subtitle">Scheduled calls and reminders</p>
          </div>
          <button className="btn btn-secondary" onClick={() => refetch()} disabled={isLoading}>
            <RefreshCw size={16} className={isLoading ? 'spin' : ''} /> Refresh
          </button>
        </div>

        <div className="card">
          <div className="table-header">
            <div className="table-col">Lead</div>
            <div className="table-col">Scheduled For</div>
            <div className="table-col">Notes</div>
            <div className="table-col">Status</div>
            <div className="table-col">Actions</div>
          </div>
          
          {isLoading && (
            <div className="empty-state">
              <RefreshCw className="spin" size={24} />
              <p>Loading follow-ups...</p>
            </div>
          )}

          {!isLoading && followUps.length === 0 && (
            <div className="empty-state">
              <Calendar size={48} style={{ opacity: 0.2, marginBottom: 16 }} />
              <p>You have no pending follow-ups scheduled.</p>
            </div>
          )}

          {followUps.map((f: any) => (
            <div key={f.id} className="table-row">
              <div className="table-cell">
                <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{f.lead?.name || 'Unknown Lead'}</div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  {f.lead?.phone ? f.lead.phone.slice(0, -4).replace(/[0-9]/g, 'X') + f.lead.phone.slice(-4) : ''}
                </div>
              </div>
              <div className="table-cell">
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--accent)' }}>
                  <Clock size={14} />
                  <span>{new Date(f.scheduledAt).toLocaleString()}</span>
                </div>
              </div>
              <div className="table-cell" style={{ color: 'var(--text-secondary)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {f.notes || '—'}
              </div>
              <div className="table-cell">
                <span className="badge" style={{ background: '#a16207', color: '#fde047' }}>Pending</span>
              </div>
              <div className="table-cell" style={{ display: 'flex', gap: 8 }}>
                <button 
                  className="btn btn-primary" 
                  style={{ padding: '4px 12px', fontSize: '0.85rem' }}
                  onClick={() => {
                    // Quick dial logic or navigate to lead details
                    toast.success('Initiating call...');
                  }}
                >
                  <PhoneCall size={14} /> Call
                </button>
                <button 
                  className="btn btn-secondary" 
                  style={{ padding: '4px 12px', fontSize: '0.85rem' }}
                  onClick={() => handleComplete(f.id)}
                >
                  <CheckCircle size={14} /> Done
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </AppLayout>
  );
}
