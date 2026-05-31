import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Check, ChevronDown, Phone, X } from 'lucide-react';
import { useIsMobile } from '../../hooks/useIsMobile';
import { stringeeService } from '../../services/stringee.service';
import { tagsService, callsService, followUpsService, leadsService } from '../../services/crm.service';

const STATUS_LABELS: Record<string, { label: string; bg: string; fg: string }> = {
  uncontacted:    { label: 'New Lead',       bg: '#eef2f7', fg: '#475569' },
  contacted:      { label: 'Contacted',      bg: '#e0f2fe', fg: '#0369a1' },
  lead:           { label: 'Interested',     bg: '#dcfce7', fg: '#15803d' },
  callback:       { label: 'Callback',       bg: '#fef9c3', fg: '#a16207' },
  not_interested: { label: 'Not Interested', bg: '#fee2e2', fg: '#b91c1c' },
  dnd:            { label: 'DND',            bg: '#fce7f3', fg: '#9d174d' },
  invalid:        { label: 'Invalid',        bg: '#f1f5f9', fg: '#64748b' },
};

const LANGUAGE_OPTIONS = [
  'English',
  'Hindi',
  'Telugu',
  'Tamil',
  'Kannada',
  'Marathi',
  'Bengali',
  'Other',
];

const FOLLOWUP_STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: '',               label: 'Keep current' },
  { value: 'contacted',      label: 'Contacted' },
  { value: 'lead',           label: 'Interested' },
  { value: 'callback',       label: 'Callback' },
  { value: 'not_interested', label: 'Not Interested' },
  { value: 'dnd',            label: 'DND' },
  { value: 'invalid',        label: 'Invalid' },
];

function pad(n: number) {
  return String(n).padStart(2, '0');
}

function formatDateTime(iso: string) {
  const d = new Date(iso);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}, ${pad(d.getHours())}:${pad(d.getMinutes())} ${d.getHours() >= 12 ? 'PM' : 'AM'}`;
}

function formatShort(iso: string) {
  const d = new Date(iso);
  const hr12 = d.getHours() % 12 || 12;
  const ampm = d.getHours() >= 12 ? 'PM' : 'AM';
  return `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()} ${pad(hr12)}:${pad(d.getMinutes())} ${ampm}`;
}

function formatDateInputValue(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function formatTimeInputValue(date: Date) {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function resolveReminderSchedule(date: string, time: string) {
  if (!date && !time) return null;
  if (!date) throw new Error('Select a reminder date');
  if (!time) throw new Error('Select a reminder time');

  const scheduledAt = new Date(`${date}T${time}:00`);
  if (Number.isNaN(scheduledAt.getTime())) {
    throw new Error('Enter a valid reminder date and time');
  }
  if (scheduledAt <= new Date()) {
    throw new Error('Reminder must be scheduled in the future');
  }

  return scheduledAt.toISOString();
}

function getApiErrorMessage(error: unknown, fallback: string) {
  if (error && typeof error === 'object') {
    const response = (error as { response?: { data?: { message?: string; error?: { message?: string } } } }).response;
    const message = response?.data?.message || response?.data?.error?.message;
    if (message) return message;
  }

  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

export default function PostCallOutcomeModal() {
  const state = useSyncExternalStore(stringeeService.subscribe, stringeeService.getSnapshot);
  const isMobile = useIsMobile();
  const qc = useQueryClient();

  const visible = state.showOutcome && !!state.lastCall;

  const { data: tagsData } = useQuery({
    queryKey: ['disposition-tags'],
    queryFn: () => tagsService.list(),
    enabled: visible,
    staleTime: 5 * 60_000,
  });
  const tags: { id: string; name: string; colour: string }[] = tagsData?.data?.data?.tags || tagsData?.data?.data || [];

  // Pull the live lead so we can show real followup status + previous disposition
  const leadId = state.lastCall?.leadId;
  const { data: leadData } = useQuery({
    queryKey: ['lead-details', leadId],
    queryFn: () => leadsService.get(leadId!),
    enabled: visible && !!leadId,
  });
  const liveLead = leadData?.data?.data;
  const previousDisposition: string | null = liveLead?.callLogs?.[0]?.dispositionTag || null;
  const previousNotes: string | null = liveLead?.callLogs?.[0]?.notes || null;

  const [dispositionTag, setDispositionTag] = useState('');
  const [language, setLanguage] = useState('');
  const [followupStatus, setFollowupStatus] = useState('');
  const [followupDate, setFollowupDate] = useState('');
  const [followupTime, setFollowupTime] = useState('');
  const [description, setDescription] = useState('');

  // Reset form when a new lastCall arrives
  useEffect(() => {
    if (state.lastCall) {
      setDispositionTag('');
      setLanguage('');
      setFollowupStatus('');
      setFollowupDate('');
      setFollowupTime('');
      setDescription('');
    }
  }, [state.lastCall?.endedAt, state.lastCall]);

  // Fetch the server-side CDR from Stringee. The CDR is eventually consistent
  // (usually written within ~3-5s of hangup), so we poll until duration > 0.
  const callIdForCdr = state.lastCall?.telephonyRef || null;
  const { data: cdrData } = useQuery({
    queryKey: ['stringee-cdr', callIdForCdr],
    queryFn: () => callsService.cdr(callIdForCdr!),
    enabled: visible && !!callIdForCdr,
    refetchInterval: (q) => {
      const c = q.state.data?.data?.data;
      return c && c.durationSeconds > 0 ? false : 3000;
    },
    refetchIntervalInBackground: false,
    staleTime: 0,
  });
  const cdr = cdrData?.data?.data || null;

  // Prefer server-side duration when available, otherwise fall back to local
  const effectiveDuration = cdr?.durationSeconds || state.lastCall?.durationSeconds || 0;
  const minutes = Math.floor(effectiveDuration / 60);
  const seconds = effectiveDuration % 60;
  const earliestReminder = new Date(Date.now() + 60 * 1000);
  const minReminderDate = formatDateInputValue(earliestReminder);
  const minReminderTime = formatTimeInputValue(earliestReminder);

  const logMutation = useMutation({
    mutationFn: async () => {
      if (!state.lastCall) return;
      if (!dispositionTag) throw new Error('Call Result is required');

      const scheduledAt = resolveReminderSchedule(followupDate, followupTime);

      const notesParts: string[] = [];
      if (language) notesParts.push(`Language: ${language}`);
      if (description) notesParts.push(description);

      await callsService.log({
        leadId: state.lastCall.leadId,
        dispositionTag,
        durationSeconds: effectiveDuration,
        notes: notesParts.join(' | ') || undefined,
        telephonyRef: state.lastCall.telephonyRef || undefined,
        followupStatus: followupStatus || undefined,
      });

      let reminderError: string | null = null;

      if (scheduledAt) {
        try {
          await followUpsService.create({
            leadId: state.lastCall.leadId,
            scheduledAt,
            notes: description || undefined,
          });
        } catch (error) {
          reminderError = getApiErrorMessage(error, 'Call logged, but reminder could not be created');
        }
      }

      return {
        reminderScheduled: !!scheduledAt && !reminderError,
        reminderError,
      };
    },
    onSuccess: (result) => {
      toast.success('Call logged');
      if (result?.reminderScheduled) {
        toast.success('Reminder scheduled');
      }
      if (result?.reminderError) {
        toast.error(result.reminderError);
      }
      qc.invalidateQueries({ queryKey: ['agent-leads'] });
      qc.invalidateQueries({ queryKey: ['agent-interested-leads'] });
      qc.invalidateQueries({ queryKey: ['agent-follow-ups'] });
      qc.invalidateQueries({ queryKey: ['agent-dashboard'] });
      qc.invalidateQueries({ queryKey: ['lead-history'] });
      qc.invalidateQueries({ queryKey: ['lead-details'] });
      stringeeService.dismissOutcome();
      stringeeService.dismiss();
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Failed to log call');
    },
  });

  const handleRedial = () => {
    stringeeService.dismissOutcome();
    void stringeeService.placeCall();
  };

  if (!visible || !state.lastCall) return null;
  const lc = state.lastCall;
  const currentStatus = STATUS_LABELS[liveLead?.status] || { label: liveLead?.status || 'Unknown', bg: '#f1f5f9', fg: '#475569' };
  const displayLeadName = lc.leadName || state.activeLeadName || liveLead?.name || 'Lead';
  const displayPhone = lc.phone || state.activePhone || null;

  const callInformationBody = (
    <Grid mobile={isMobile} mobileColumns={2}>
      <Field label="Call Start Time" mobile={isMobile} span={2}>
        <ReadOnly value={formatDateTime(lc.startedAt)} mobile={isMobile} />
      </Field>
      <Field label="Call Duration" mobile={isMobile}>
        <div className={isMobile ? 'agent-mobile-outcome-sheet__duration' : undefined} style={{ display: 'flex', gap: 8 }}>
          <ReadOnly value={`${pad(minutes)} min`} mobile={isMobile} />
          <ReadOnly value={`${pad(seconds)} sec`} mobile={isMobile} />
        </div>
      </Field>
      <Field label="Last Call Result" mobile={isMobile}>
        <ReadOnly value={previousDisposition || (lc.answered ? 'Answered' : 'No Answer')} mobile={isMobile} />
      </Field>
      <Field label="Last Call Made On" mobile={isMobile} span={2}>
        <ReadOnly value={formatShort(lc.endedAt)} mobile={isMobile} />
      </Field>
      <Field label="Call End Reason" span={2} mobile={isMobile}>
        <ReadOnly value={`${lc.answered ? 'USER_END_CALL' : 'NO_ANSWER'} | ${lc.endReason}`} mobile={isMobile} />
      </Field>
      <Field label="Last Call Description" span={2} mobile={isMobile}>
        <ReadOnly value={previousNotes || (lc.answered ? 'Answered' : 'Not answered')} mobile={isMobile} />
      </Field>
    </Grid>
  );

  const outcomeBody = (
    <Grid mobile={isMobile}>
      <Field label="Call Result" required mobile={isMobile}>
        <Dropdown
          value={dispositionTag}
          onChange={setDispositionTag}
          options={tags.map((t) => ({ value: t.name, label: t.name, colour: t.colour }))}
          placeholder="Select an option"
          mobile={isMobile}
        />
      </Field>
      <Field label="Language" mobile={isMobile}>
        <Dropdown
          value={language}
          onChange={setLanguage}
          options={LANGUAGE_OPTIONS.map((l) => ({ value: l, label: l }))}
          placeholder="Select an option"
          mobile={isMobile}
        />
      </Field>
      <Field label="Update Followup Status" mobile={isMobile}>
        <Dropdown
          value={followupStatus}
          onChange={setFollowupStatus}
          options={FOLLOWUP_STATUS_OPTIONS.map((s) => ({ value: s.value, label: s.label }))}
          placeholder="Keep current"
          mobile={isMobile}
        />
      </Field>
      <Field label="Next Call Schedule Date" mobile={isMobile}>
        <div className={isMobile ? 'agent-mobile-outcome-sheet__schedule' : undefined} style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 8 }}>
          <input
            type="date"
            value={followupDate}
            onChange={(e) => setFollowupDate(e.target.value)}
            min={minReminderDate}
            className={isMobile ? 'agent-mobile-outcome-sheet__input' : undefined}
            style={{ ...inputStyle, flex: 1 }}
          />
          <input
            type="time"
            value={followupTime}
            onChange={(e) => setFollowupTime(e.target.value)}
            min={followupDate === minReminderDate ? minReminderTime : undefined}
            className={isMobile ? 'agent-mobile-outcome-sheet__input' : undefined}
            style={{ ...inputStyle, width: isMobile ? '100%' : 110 }}
          />
        </div>
      </Field>
      <Field label="Description" span={2} mobile={isMobile}>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Enter description..."
          rows={3}
          className={isMobile ? 'agent-mobile-outcome-sheet__input agent-mobile-outcome-sheet__textarea' : undefined}
          style={{ ...inputStyle, resize: 'vertical', minHeight: 70 }}
        />
      </Field>
    </Grid>
  );

  const callInformationSection = (
    <Section
      title="Call Information"
      mobile={isMobile}
      sectionClassName={isMobile ? 'agent-mobile-outcome-sheet__section--summary' : undefined}
      right={(() => {
        const s = STATUS_LABELS[liveLead?.status] || { label: liveLead?.status || '—', bg: '#f1f5f9', fg: '#475569' };
        return (
          <span className={isMobile ? 'agent-mobile-outcome-sheet__status-row' : undefined} style={{ fontSize: 13, color: '#475569', display: 'inline-flex', alignItems: 'center', flexWrap: 'wrap', gap: 6, justifyContent: isMobile ? 'flex-start' : 'flex-end' }}>
            Followup Status :{' '}
            <span className={isMobile ? 'agent-mobile-outcome-sheet__status-pill' : undefined} style={{
              display: 'inline-block', padding: '3px 12px', borderRadius: 999,
              background: s.bg, color: s.fg,
              fontWeight: 600, fontSize: 12,
            }}>
              {s.label}
            </span>
          </span>
        );
      })()}
    >
      {callInformationBody}
    </Section>
  );

  const outcomeSection = (
    <Section title="Outcome Of Outgoing Call" mobile={isMobile}>
      {outcomeBody}
    </Section>
  );

  return (
    <div
      className={isMobile ? 'agent-mobile-sheet-backdrop' : undefined}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)',
        display: 'flex', alignItems: isMobile ? 'flex-end' : 'center', justifyContent: 'center',
        zIndex: 1300, padding: isMobile ? 0 : 20,
      }}
      onClick={() => stringeeService.dismissOutcome()}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={isMobile ? 'agent-mobile-outcome-sheet' : undefined}
        style={{
          width: isMobile ? '100%' : 'min(960px, 100%)', maxHeight: isMobile ? '94vh' : '92vh', overflowY: 'auto',
          background: '#fff', borderRadius: isMobile ? '28px 28px 0 0' : 14,
          boxShadow: '0 30px 80px rgba(0,0,0,0.25)',
          fontFamily: 'system-ui, -apple-system, sans-serif',
        }}
      >
        {/* Header */}
        <div className={isMobile ? 'agent-mobile-outcome-sheet__header' : undefined} style={{ padding: isMobile ? '12px 16px 14px' : '16px 24px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: isMobile ? 'flex-start' : 'center', gap: 12 }}>
          <div>
            {isMobile && (
              <div className="agent-mobile-outcome-sheet__handle" style={{ width: 42, height: 4, borderRadius: 999, background: '#dbe3ef', margin: '0 auto 12px' }} />
            )}
            <div className={isMobile ? 'agent-mobile-outcome-sheet__eyebrow' : undefined} style={{ fontSize: 11, textTransform: 'uppercase', color: '#94a3b8', fontWeight: 600, letterSpacing: '0.06em' }}>{isMobile ? 'Call Outcome' : 'Post Call'}</div>
            <div className={isMobile ? 'agent-mobile-outcome-sheet__leadline' : undefined} style={{ fontSize: isMobile ? 16 : 18, fontWeight: 700, color: '#0f172a', lineHeight: 1.3 }}>
              {displayLeadName}{displayPhone ? ` · ${displayPhone}` : ''}
            </div>
          </div>
          {isMobile && (
            <div
              className="agent-mobile-outcome-sheet__header-pill"
              style={{ background: currentStatus.bg, color: currentStatus.fg }}
            >
              {currentStatus.label}
            </div>
          )}
          <button
            onClick={() => stringeeService.dismissOutcome()}
            style={{ background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer', padding: 6 }}
          >
            <X size={20} />
          </button>
        </div>

        {isMobile ? (
          <>
            <div className="agent-mobile-outcome-sheet__form-block">{outcomeBody}</div>
          </>
        ) : (
          <>
            {callInformationSection}
            {outcomeSection}
          </>
        )}

        {/* Footer */}
        <div className={isMobile ? 'agent-mobile-outcome-sheet__footer' : undefined} style={{ padding: isMobile ? '14px 16px calc(14px + env(safe-area-inset-bottom))' : '16px 24px', borderTop: '1px solid #f1f5f9', display: 'flex', flexDirection: isMobile ? 'row' : 'row', justifyContent: 'flex-end', gap: 10 }}>
          <button
            onClick={handleRedial}
            className={isMobile ? 'agent-mobile-outcome-sheet__secondary' : undefined}
            style={{
              padding: isMobile ? '12px 18px' : '8px 18px', fontSize: 14, fontWeight: 600,
              background: '#e2e8f0', color: '#334155',
              border: 'none', borderRadius: 8, cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 6,
              justifyContent: 'center',
              width: isMobile ? 108 : 'auto',
            }}
          >
            <Phone size={14} /> Redial
          </button>
          <button
            onClick={() => logMutation.mutate()}
            disabled={logMutation.isPending || !dispositionTag}
            className={isMobile ? 'agent-mobile-outcome-sheet__primary' : undefined}
            style={{
              padding: isMobile ? '12px 22px' : '8px 22px', fontSize: 14, fontWeight: 600,
              background: dispositionTag ? '#3b82f6' : '#94a3b8',
              color: '#fff', border: 'none', borderRadius: 8,
              cursor: dispositionTag && !logMutation.isPending ? 'pointer' : 'not-allowed',
              width: isMobile ? '100%' : 'auto',
            }}
          >
            {logMutation.isPending ? 'Saving…' : 'Log Outcome'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── helpers ───────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 10px', fontSize: 13,
  border: '1px solid #cbd5e1', borderRadius: 6, background: '#fff',
  color: '#0f172a',
};

function Section({ title, right, children, mobile, sectionClassName }: { title: string; right?: React.ReactNode; children: React.ReactNode; mobile?: boolean; sectionClassName?: string }) {
  return (
    <div className={[mobile ? 'agent-mobile-outcome-sheet__section' : '', sectionClassName || ''].filter(Boolean).join(' ')} style={{ borderBottom: '1px solid #f1f5f9' }}>
      <div style={{
        padding: mobile ? '12px 16px' : '12px 24px', display: 'flex', flexDirection: mobile ? 'column' : 'row', justifyContent: 'space-between', alignItems: mobile ? 'flex-start' : 'center', gap: mobile ? 8 : 12,
        background: mobile ? 'transparent' : '#f8fafc',
      }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>{mobile ? title : `▼ ${title}`}</div>
        {right}
      </div>
      <div style={{ padding: mobile ? '16px' : '18px 24px' }}>{children}</div>
    </div>
  );
}

function Grid({ children, mobile, mobileColumns = 1 }: { children: React.ReactNode; mobile?: boolean; mobileColumns?: 1 | 2 }) {
  return (
    <div className={mobile ? 'agent-mobile-outcome-sheet__grid' : undefined} style={{
      display: 'grid', gridTemplateColumns: mobile ? `repeat(${mobileColumns}, minmax(0, 1fr))` : 'repeat(2, 1fr)',
      gap: '14px 32px',
    }}>
      {children}
    </div>
  );
}

function Field({ label, required, span, children, mobile }: { label: string; required?: boolean; span?: number; children: React.ReactNode; mobile?: boolean }) {
  const gridColumn = span === 2 ? 'span 2' : 'span 1';
  return (
    <div className={mobile ? 'agent-mobile-outcome-sheet__field' : undefined} style={{ gridColumn: span ? gridColumn : 'span 1' }}>
      <label className={mobile ? 'agent-mobile-outcome-sheet__label' : undefined} style={{
        display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 5,
      }}>
        {label}{required && <span style={{ color: '#ef4444' }}>*</span>}
      </label>
      {children}
    </div>
  );
}

function ReadOnly({ value, mobile }: { value: string; mobile?: boolean }) {
  return (
    <div className={mobile ? 'agent-mobile-outcome-sheet__readonly' : undefined} style={{
      padding: '8px 10px', fontSize: 13,
      background: '#f1f5f9', border: '1px solid #e2e8f0',
      borderRadius: 6, color: '#0f172a',
      minHeight: 36, display: 'flex', alignItems: 'center',
      fontFamily: 'ui-monospace, monospace',
    }}>
      {value}
    </div>
  );
}

interface DropdownOption {
  value: string;
  label: string;
  colour?: string;
}

function Dropdown({
  value, onChange, options, placeholder, mobile,
}: {
  value: string;
  onChange: (v: string) => void;
  options: DropdownOption[];
  placeholder: string;
  mobile?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', handler);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  const selected = options.find((o) => o.value === value);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={mobile ? 'agent-mobile-outcome-sheet__select' : undefined}
        style={{
          width: '100%', padding: '8px 10px', fontSize: 13,
          border: `1px solid ${open ? '#3b82f6' : '#cbd5e1'}`,
          borderRadius: 6, background: '#fff',
          color: selected ? '#0f172a' : '#94a3b8',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          cursor: 'pointer', textAlign: 'left',
          boxShadow: open ? '0 0 0 3px rgba(59,130,246,0.15)' : 'none',
          transition: 'border-color 120ms, box-shadow 120ms',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {selected?.colour && (
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: selected.colour, flexShrink: 0 }} />
          )}
          {selected?.label || placeholder}
        </span>
        <ChevronDown size={16} style={{ color: '#64748b', transition: 'transform 120ms', transform: open ? 'rotate(180deg)' : 'none' }} />
      </button>
      {open && (
        <div
          className={mobile ? 'agent-mobile-outcome-sheet__menu' : undefined}
          style={{
            position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
            maxHeight: 240, overflowY: 'auto',
            background: '#fff', border: '1px solid #e2e8f0',
            borderRadius: 8, boxShadow: '0 12px 28px rgba(15,23,42,0.12)',
            zIndex: 100, padding: 4,
          }}
        >
          {options.length === 0 && (
            <div style={{ padding: '10px 12px', fontSize: 13, color: '#94a3b8' }}>No options</div>
          )}
          {options.map((opt) => {
            const active = opt.value === value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => { onChange(opt.value); setOpen(false); }}
                style={{
                  width: '100%', padding: '8px 10px', fontSize: 13,
                  background: active ? '#eff6ff' : 'transparent',
                  color: active ? '#1d4ed8' : '#0f172a',
                  border: 'none', borderRadius: 6, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  textAlign: 'left', fontWeight: active ? 600 : 400,
                }}
                onMouseEnter={(e) => { if (!active) (e.currentTarget as HTMLButtonElement).style.background = '#f8fafc'; }}
                onMouseLeave={(e) => { if (!active) (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {opt.colour && (
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: opt.colour }} />
                  )}
                  {opt.label}
                </span>
                {active && <Check size={14} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
