import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { agentService, callsService, tagsService, followUpsService } from '../../services/crm.service';
import AppLayout from '../../components/layout/AppLayout';
import toast from 'react-hot-toast';
import {
  Phone, PhoneOff, Coffee, Clock, CheckCircle,
  ChevronRight, RefreshCw, Calendar, AlertCircle, PhoneCall
} from 'lucide-react';

interface Lead {
  id: string; name: string | null; phoneMasked: string; email: string | null;
  status: string; priority: string; isDnd: boolean;
  campaign?: { id: string; name: string; script?: string | null };
}
interface Tag { id: string; name: string; colour: string; }
interface FollowUp {
  id: string; leadId: string; scheduledAt: string; status: string; notes?: string;
  lead: { id: string; name: string | null; phone: string; };
}

// ── Call Timer ────────────────────────────────────────────────────────

function CallTimer({ active }: { active: boolean }) {
  const [seconds, setSeconds] = useState(0);
  const ref = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (active) {
      setSeconds(0);
      ref.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    } else {
      if (ref.current) clearInterval(ref.current);
    }
    return () => { if (ref.current) clearInterval(ref.current); };
  }, [active]);
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = (seconds % 60).toString().padStart(2, '0');
  return <span className="call-timer">{m}:{s}</span>;
}

// ── Break Timer ───────────────────────────────────────────────────────

function BreakTimer({ startedAt }: { startedAt: string }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const start = new Date(startedAt).getTime();
    const tick = () => setElapsed(Math.floor((Date.now() - start) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startedAt]);
  const m = Math.floor(elapsed / 60).toString().padStart(2, '0');
  const s = (elapsed % 60).toString().padStart(2, '0');
  return <span>{m}:{s}</span>;
}

// ── Disposition Panel ─────────────────────────────────────────────────

function DispositionPanel({
  lead, tags, onLog, onClose,
}: { lead: Lead; tags: Tag[]; onLog: (tag: string, notes: string, duration: number, scheduledAt?: string) => void; onClose: () => void; }) {
  const [selectedTag, setSelectedTag] = useState('');
  const [notes, setNotes] = useState('');
  const [scheduleDate, setScheduleDate] = useState('');
  const [callDuration, setCallDuration] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    timerRef.current = setInterval(() => setCallDuration((d) => d + 1), 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  const needsCallback = selectedTag === 'Callback';

  return (
    <div className="disposition-panel">
      <div className="disposition-panel__header">
        <div>
          <div className="disposition-panel__name">{lead.name || 'Unknown'}</div>
          <div className="disposition-panel__phone">{lead.phoneMasked}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Duration</div>
          <CallTimer active={true} />
        </div>
      </div>

      {lead.campaign?.script && (
        <div className="script-box">
          <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--accent)', marginBottom: 4 }}>📜 CALL SCRIPT</div>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>{lead.campaign.script}</p>
        </div>
      )}

      <div style={{ marginBottom: 12 }}>
        <div className="form-label" style={{ marginBottom: 8 }}>Disposition</div>
        <div className="tag-grid">
          {tags.map((t) => (
            <button
              key={t.name}
              className={`tag-btn ${selectedTag === t.name ? 'tag-btn--selected' : ''}`}
              style={{ '--tag-colour': t.colour } as React.CSSProperties}
              onClick={() => setSelectedTag(t.name)}
            >
              {t.name}
            </button>
          ))}
        </div>
      </div>

      {needsCallback && (
        <div className="form-group">
          <label className="form-label">Schedule Callback</label>
          <input className="form-input" type="datetime-local" value={scheduleDate} onChange={(e) => setScheduleDate(e.target.value)} min={new Date().toISOString().slice(0, 16)} />
        </div>
      )}

      <div className="form-group">
        <label className="form-label">Notes (optional)</label>
        <textarea className="form-input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Add call notes…" />
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn btn-secondary" onClick={onClose} style={{ flex: 1 }}>Skip</button>
        <button
          className="btn btn-primary" style={{ flex: 2 }}
          disabled={!selectedTag}
          onClick={() => onLog(selectedTag, notes, callDuration, needsCallback ? scheduleDate : undefined)}
        >
          <CheckCircle size={16} /> Save & Next
        </button>
      </div>
    </div>
  );
}

// ── Agent Dashboard ───────────────────────────────────────────────────

export default function AgentWorkspace() {
  const qc = useQueryClient();
  const [activeLead, setActiveLead] = useState<Lead | null>(null);
  const [callActive, setCallActive] = useState(false);
  const [showDisposition, setShowDisposition] = useState(false);

  const { data: dashData, refetch: refetchDash } = useQuery({
    queryKey: ['agent-dashboard'],
    queryFn: () => agentService.dashboard(),
    refetchInterval: 30_000,
  });

  const { data: nextLeadData, refetch: refetchNext } = useQuery({
    queryKey: ['agent-next-lead'],
    queryFn: () => agentService.nextLead(),
    enabled: !activeLead,
  });

  const { data: followUpsData } = useQuery({
    queryKey: ['agent-followups'],
    queryFn: () => followUpsService.list({ status: 'pending' }),
  });

  const { data: tagsData } = useQuery({
    queryKey: ['tags'],
    queryFn: () => tagsService.list(),
  });

  const initCallMutation = useMutation({
    mutationFn: (leadId: string) => agentService.initiateCall(leadId),
    onSuccess: () => { setCallActive(true); toast.success('Call initiated'); },
    onError: () => toast.error('Call initiation failed'),
  });

  const logCallMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => callsService.log(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['agent-dashboard'] });
      qc.invalidateQueries({ queryKey: ['agent-next-lead'] });
      setActiveLead(null); setCallActive(false); setShowDisposition(false);
      toast.success('Call logged ✓');
    },
    onError: () => toast.error('Failed to log call'),
  });

  const breakStartMutation = useMutation({
    mutationFn: () => agentService.breakStart(),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['agent-dashboard'] }); toast.success('Break started'); },
  });

  const breakEndMutation = useMutation({
    mutationFn: () => agentService.breakEnd(),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['agent-dashboard'] });
      toast.success(`Break ended — ${res.data.data.durationMins} min`);
    },
  });

  const followUpDoneMutation = useMutation({
    mutationFn: (id: string) => followUpsService.update(id, { status: 'done' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['agent-followups'] }); toast.success('Follow-up done'); },
  });

  const stats = dashData?.data?.data?.stats;
  const nextLeadResp = nextLeadData?.data?.data;
  const currentLead: Lead = activeLead || (nextLeadResp?.lead as Lead);
  const followUps: FollowUp[] = followUpsData?.data?.data?.followUps || [];
  const tags: Tag[] = tagsData?.data?.data || [];

  const handleLogCall = async (tag: string, notes: string, duration: number, scheduledAt?: string) => {
    if (!currentLead) return;
    await logCallMutation.mutateAsync({ leadId: currentLead.id, dispositionTag: tag, durationSeconds: duration, notes });
    if (scheduledAt) {
      try {
        await followUpsService.create({ leadId: currentLead.id, scheduledAt, notes: `Callback requested` });
        toast.success('Follow-up scheduled');
      } catch {}
    }
  };

  return (
    <AppLayout>
      <div className="page-container">
        {/* Header with break status */}
        <div className="page-header">
          <div>
            <h1 className="page-title">Agent Workspace</h1>
            <p className="page-subtitle">
              {stats?.isOnBreak
                ? <span style={{ color: '#f59e0b' }}>⏸ On Break — <BreakTimer startedAt={stats.breakStartedAt} /></span>
                : <span style={{ color: '#22c55e' }}>🟢 Active</span>
              }
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {stats?.isOnBreak
              ? <button className="btn btn-primary" onClick={() => breakEndMutation.mutate()}>
                  <Coffee size={16} /> End Break
                </button>
              : <button className="btn btn-secondary" onClick={() => breakStartMutation.mutate()}>
                  <Coffee size={16} /> Take Break
                </button>
            }
          </div>
        </div>

        {/* Stats Row */}
        <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
          {[
            { label: 'My Leads', value: stats?.totalLeads || 0, icon: <Phone size={20} />, colour: '#6366f1' },
            { label: 'Pending', value: stats?.pendingLeads || 0, icon: <AlertCircle size={20} />, colour: '#f59e0b' },
            { label: "Today's Calls", value: stats?.callsToday || 0, icon: <PhoneCall size={20} />, colour: '#22c55e' },
            { label: 'Break Mins', value: `${stats?.breakMinutesToday || 0}m`, icon: <Clock size={20} />, colour: '#a78bfa' },
          ].map(({ label, value, icon, colour }) => (
            <div key={label} className="stat-card" style={{ '--card-accent': colour } as React.CSSProperties}>
              <div className="stat-card__icon" style={{ background: colour + '22', color: colour }}>{icon}</div>
              <div className="stat-card__body">
                <div className="stat-card__value">{value}</div>
                <div className="stat-card__label">{label}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="two-col-grid">
          {/* CALL PANEL */}
          <div className="card">
            <div className="card-header">
              <h2 className="card-title">
                {nextLeadResp?.type === 'follow_up' ? '⏰ Overdue Follow-up' : '📞 Next Lead'}
              </h2>
              <button className="btn-icon" onClick={() => refetchNext()}><RefreshCw size={15} /></button>
            </div>

            {currentLead ? (
              showDisposition ? (
                <div style={{ padding: 20 }}>
                  <DispositionPanel
                    lead={currentLead}
                    tags={tags}
                    onLog={handleLogCall}
                    onClose={() => setShowDisposition(false)}
                  />
                </div>
              ) : (
                <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {/* Lead info */}
                  <div className="lead-card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--text-primary)' }}>
                          {currentLead.name || 'Unknown'}
                        </div>
                        <div style={{ fontSize: '1.3rem', fontWeight: 800, letterSpacing: 2, color: 'var(--accent)', margin: '8px 0' }}>
                          {currentLead.phoneMasked}
                        </div>
                        {currentLead.campaign && (
                          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                            📁 {currentLead.campaign.name}
                          </div>
                        )}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
                        <span className="badge" style={{ background: '#6366f122', color: '#6366f1' }}>{currentLead.status}</span>
                        <span className="badge" style={{ background: currentLead.priority === 'high' ? '#ef444422' : '#1e293b', color: currentLead.priority === 'high' ? '#ef4444' : '#64748b' }}>
                          {currentLead.priority}
                        </span>
                      </div>
                    </div>
                    {currentLead.isDnd && (
                      <div className="dnd-warning">⛔ This number is on the DND list</div>
                    )}
                  </div>

                  {/* Call actions */}
                  {callActive ? (
                    <div style={{ display: 'flex', gap: 8 }}>
                      <div style={{ flex: 1, background: '#14532d', border: '1px solid #16a34a', borderRadius: 10, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 10, height: 10, background: '#22c55e', borderRadius: '50%', animation: 'pulse 1.5s infinite' }} />
                        <span style={{ color: '#22c55e', fontWeight: 600 }}>Call in progress…</span>
                        <CallTimer active={callActive} />
                      </div>
                      <button className="btn btn-danger" onClick={() => { setCallActive(false); setShowDisposition(true); }}>
                        <PhoneOff size={16} /> End Call
                      </button>
                    </div>
                  ) : (
                    <button
                      className="btn btn-primary"
                      style={{ width: '100%', padding: '14px', fontSize: '1rem' }}
                      disabled={currentLead.isDnd || initCallMutation.isPending}
                      onClick={() => {
                        initCallMutation.mutate(currentLead.id);
                        setActiveLead(currentLead);
                      }}
                    >
                      <Phone size={18} /> {currentLead.isDnd ? 'DND — Cannot Call' : 'Initiate Call'}
                    </button>
                  )}

                  {!callActive && (
                    <button className="btn btn-secondary" style={{ width: '100%' }} onClick={() => { setShowDisposition(true); setActiveLead(currentLead); }}>
                      Log Manually (No Call)
                    </button>
                  )}
                </div>
              )
            ) : (
              <div className="empty-state">
                <CheckCircle size={36} style={{ color: '#22c55e' }} />
                <p style={{ fontWeight: 600 }}>All caught up!</p>
                <p>No pending leads in your queue.</p>
                <button className="btn btn-secondary" style={{ marginTop: 8 }} onClick={() => refetchNext()}>
                  <RefreshCw size={14} /> Check again
                </button>
              </div>
            )}
          </div>

          {/* FOLLOW-UPS */}
          <div className="card">
            <div className="card-header">
              <h2 className="card-title">Today's Follow-ups</h2>
              <span className="badge" style={{ background: '#1e293b', color: '#a78bfa' }}>
                {followUps.filter(f => new Date(f.scheduledAt) <= new Date()).length} overdue
              </span>
            </div>
            {followUps.length === 0 ? (
              <div className="empty-state"><Calendar size={28} style={{ opacity: 0.4 }} /><p>No follow-ups scheduled</p></div>
            ) : (
              followUps.slice(0, 10).map((fu) => {
                const isOverdue = new Date(fu.scheduledAt) <= new Date();
                return (
                  <div key={fu.id} className="followup-row">
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--text-primary)' }}>{fu.lead.name || 'Unknown'}</div>
                      <div style={{ fontSize: '0.75rem', color: isOverdue ? '#ef4444' : 'var(--text-muted)' }}>
                        {isOverdue ? '⚠ Overdue — ' : '⏰ '}
                        {new Date(fu.scheduledAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button className="btn-icon" title="Load lead" onClick={() => {
                        setActiveLead({ id: fu.leadId, name: fu.lead.name, phoneMasked: '****' + fu.lead.phone.slice(-4), email: null, status: 'callback', priority: 'high', isDnd: false });
                      }}>
                        <ChevronRight size={15} />
                      </button>
                      <button className="btn-icon" title="Mark done" onClick={() => followUpDoneMutation.mutate(fu.id)}>
                        <CheckCircle size={15} style={{ color: '#22c55e' }} />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Today's Tag Stats */}
        {dashData?.data?.data?.tagStats?.length > 0 && (
          <div className="card">
            <div className="card-header">
              <h2 className="card-title">Today's Dispositions</h2>
            </div>
            <div className="card-body">
              {(dashData.data.data.tagStats as { tag: string; count: number }[]).map((t) => (
                <div key={t.tag} className="disposition-row">
                  <span className="disposition-tag">{t.tag}</span>
                  <div className="disposition-bar-wrap">
                    <div className="disposition-bar" style={{ width: `${Math.min(100, (t.count / (stats?.callsToday || 1)) * 100)}%` }} />
                  </div>
                  <span className="disposition-count">{t.count}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
