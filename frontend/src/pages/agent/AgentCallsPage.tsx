import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowUpRight, Copy, PhoneCall, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import AppLayout from '../../components/layout/AppLayout';
import { callsService, leadsService } from '../../services/crm.service';
import { useIsMobile } from '../../hooks/useIsMobile';

function getTodayRange() {
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  return {
    from: start.toISOString(),
    to: now.toISOString(),
  };
}

export default function AgentCallsPage() {
  const isMobile = useIsMobile();
  const todayRange = useMemo(() => getTodayRange(), []);
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['agent-calls-page'],
    queryFn: () => callsService.list({ page: 1, limit: 20 }),
  });
  const { data: summaryData } = useQuery({
    queryKey: ['agent-calls-summary', todayRange.from, todayRange.to],
    queryFn: () => callsService.summary(todayRange),
  });

  const logs = data?.data?.data?.logs || [];
  const summary = summaryData?.data?.data;
  const totalCalls = summary?.dailyTotals?.reduce((sum: number, item: { count: number }) => sum + item.count, 0) || 0;
  const connectedCalls = summary?.agentLeaderboard?.reduce((sum: number, item: { connected: number }) => sum + item.connected, 0) || 0;
  const callbackCount = summary?.tagBreakdown?.find((tag: { tag: string; count: number }) => tag.tag === 'Callback')?.count || 0;
  const interestedCount = summary?.tagBreakdown?.find((tag: { tag: string; count: number }) => tag.tag === 'Interested')?.count || 0;

  const copyPhone = async (leadId?: string) => {
    if (!leadId) {
      toast.error('Phone number unavailable');
      return;
    }

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

  if (isMobile) {
    return (
      <AppLayout>
        <div className="agent-mobile-stack">
          <section className="agent-mobile-summary-card">
            <div>
              <div className="section-eyebrow">Today summary</div>
              <h1 className="agent-mobile-section-title">Calls</h1>
              <p className="page-subtitle" style={{ marginTop: 6 }}>Live call outcomes from today&apos;s activity</p>
            </div>

            <div className="agent-mobile-stats-grid">
              {[
                { label: 'Total Calls', value: totalCalls },
                { label: 'Connected', value: connectedCalls },
                { label: 'Callback', value: callbackCount },
                { label: 'Interested', value: interestedCount },
              ].map(({ label, value }) => (
                <div key={label} className="agent-mobile-stat-tile">
                  <div className="agent-mobile-stat-value">{value}</div>
                  <div className="agent-mobile-stat-label">{label}</div>
                </div>
              ))}
            </div>

            <div className="agent-mobile-inline-actions">
              <button className="btn btn-secondary" onClick={() => refetch()} disabled={isLoading}>
                <RefreshCw size={16} className={isLoading ? 'spin' : ''} /> Refresh
              </button>
              <div className="agent-mobile-info-pill">
                <ArrowUpRight size={14} /> Most recent first
              </div>
            </div>
          </section>

          <section className="card card--mobile">
            <div className="card-header card-header--dense">
              <div>
                <div className="card-kicker">Recent activity</div>
                <h2 className="card-title">Latest call logs</h2>
              </div>
            </div>

            {isLoading ? (
              <div className="empty-state"><RefreshCw className="spin" size={24} /><p>Loading call history...</p></div>
            ) : logs.length === 0 ? (
              <div className="empty-state"><PhoneCall size={36} style={{ opacity: 0.2 }} /><p>No call logs available.</p></div>
            ) : (
              <div className="agent-mobile-list">
                {logs.map((log: any) => (
                  <div key={log.id} className="agent-mobile-followup-card">
                    <div className="agent-mobile-call-log-head">
                      <div>
                        <div className="agent-mobile-list-title">{log.lead?.name || 'Unknown Lead'}</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div className="agent-mobile-list-subtitle">{log.lead?.phoneMasked || log.lead?.phone || 'No phone available'}</div>
                          {log.lead?.id ? (
                            <button
                              type="button"
                              onClick={() => void copyPhone(log.lead?.id)}
                              aria-label="Copy phone number"
                              title="Copy phone number"
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                width: 24,
                                height: 24,
                                borderRadius: 999,
                                border: '1px solid var(--border)',
                                background: '#fff',
                                color: 'var(--text-secondary)',
                                cursor: 'pointer',
                                padding: 0,
                              }}
                            >
                              <Copy size={12} />
                            </button>
                          ) : null}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                        <span className="agent-mobile-status-chip">{log.dispositionTag || 'Pending'}</span>
                        {log.isManual ? (
                          <span className="agent-mobile-status-chip" style={{ background: '#fff1f2', color: '#be123c' }}>Manual Log</span>
                        ) : null}
                      </div>
                    </div>
                    <div className="agent-mobile-followup-time">
                      <PhoneCall size={14} />
                      <span>{new Date(log.calledAt).toLocaleString()}</span>
                    </div>
                    <div className="agent-mobile-muted">{log.notes || 'No notes added for this call.'}</div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="page-container">
        <section className="page-header">
          <div>
            <div className="section-eyebrow">Call history</div>
            <h1 className="page-title">Calls</h1>
            <p className="page-subtitle" style={{ marginTop: 6 }}>Recent call activity and outcomes</p>
          </div>
          <button className="btn btn-secondary" onClick={() => refetch()} disabled={isLoading}>
            <RefreshCw size={16} className={isLoading ? 'spin' : ''} /> Refresh
          </button>
        </section>

        <section className="card">
          {isLoading ? (
            <div className="empty-state"><RefreshCw className="spin" size={24} /><p>Loading call history...</p></div>
          ) : logs.length === 0 ? (
            <div className="empty-state"><PhoneCall size={36} style={{ opacity: 0.2 }} /><p>No call logs available.</p></div>
          ) : (
            <div className="agent-mobile-list">
              {logs.map((log: any) => (
                <div key={log.id} className="followup-row">
                  <div className="agent-mobile-list-title">{log.lead?.name || 'Unknown Lead'}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div className="agent-mobile-list-subtitle">{log.lead?.phoneMasked || log.lead?.phone || 'No phone available'}</div>
                    {log.lead?.id ? (
                      <button
                        type="button"
                        onClick={() => void copyPhone(log.lead?.id)}
                        aria-label="Copy phone number"
                        title="Copy phone number"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          width: 24,
                          height: 24,
                          borderRadius: 999,
                          border: '1px solid var(--border)',
                          background: '#fff',
                          color: 'var(--text-secondary)',
                          cursor: 'pointer',
                          padding: 0,
                        }}
                      >
                        <Copy size={12} />
                      </button>
                    ) : null}
                  </div>
                  <div className="agent-mobile-followup-time">
                    <PhoneCall size={14} />
                    <span>{new Date(log.calledAt).toLocaleString()}</span>
                  </div>
                  <div className="agent-mobile-muted">
                    {log.dispositionTag || 'No disposition'}{log.isManual ? ' · Manual Log' : ''}{log.notes ? ` · ${log.notes}` : ''}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </AppLayout>
  );
}