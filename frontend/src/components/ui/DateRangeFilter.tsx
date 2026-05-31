import { useEffect, useMemo, useRef, useState } from 'react';
import { Calendar, ChevronDown } from 'lucide-react';

export type DateRangePreset = 'all_time' | 'today' | 'yesterday' | 'this_month' | 'last_7_days' | 'custom';

export interface DateRangeValue {
  preset: DateRangePreset;
  from: string; // YYYY-MM-DD (IST)
  to: string;   // YYYY-MM-DD (IST)
}

// IST-local date helpers. JavaScript's toISOString gives UTC; we want
// the date the user perceives in India (IST, +05:30).
function toIstYmd(d: Date): string {
  const ist = new Date(d.getTime() + 5.5 * 60 * 60 * 1000);
  return ist.toISOString().slice(0, 10);
}

export function computeRange(preset: DateRangePreset, customFrom?: string, customTo?: string): { from: string; to: string } {
  const now = new Date();
  const today = toIstYmd(now);
  if (preset === 'all_time') return { from: '', to: '' };
  if (preset === 'today') return { from: today, to: today };
  if (preset === 'yesterday') {
    const y = toIstYmd(new Date(now.getTime() - 24 * 60 * 60 * 1000));
    return { from: y, to: y };
  }
  if (preset === 'this_month') {
    const istNow = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
    const first = `${istNow.toISOString().slice(0, 7)}-01`;
    return { from: first, to: today };
  }
  if (preset === 'last_7_days') {
    const start = toIstYmd(new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000));
    return { from: start, to: today };
  }
  // custom
  return { from: customFrom || today, to: customTo || today };
}

const PRESET_LABELS: Record<DateRangePreset, string> = {
  all_time: 'All Time',
  today: 'Today',
  yesterday: 'Yesterday',
  this_month: 'This Month',
  last_7_days: 'Last 7 Days',
  custom: 'Custom Range',
};

function formatRangeLabel(value: DateRangeValue): string {
  if (value.preset === 'all_time') return PRESET_LABELS.all_time;
  if (value.preset !== 'custom') return PRESET_LABELS[value.preset];
  if (value.from === value.to) return value.from;
  return `${value.from} → ${value.to}`;
}

export default function DateRangeFilter({
  value,
  onChange,
  includeAllTime = false,
  allTimeLabel = 'All Time',
  fullWidth = false,
}: {
  value: DateRangeValue;
  onChange: (next: DateRangeValue) => void;
  includeAllTime?: boolean;
  allTimeLabel?: string;
  fullWidth?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [draftFrom, setDraftFrom] = useState(value.from);
  const [draftTo, setDraftTo] = useState(value.to);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setDraftFrom(value.from);
    setDraftTo(value.to);
  }, [value.from, value.to]);

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

  const presets: DateRangePreset[] = useMemo(
    () => (
      includeAllTime
        ? ['all_time', 'today', 'yesterday', 'last_7_days', 'this_month']
        : ['today', 'yesterday', 'last_7_days', 'this_month']
    ),
    [includeAllTime],
  );

  const pickPreset = (p: DateRangePreset) => {
    if (p === 'all_time') {
      onChange({ preset: 'all_time', from: '', to: '' });
      setOpen(false);
      return;
    }

    const r = computeRange(p);
    onChange({ preset: p, from: r.from, to: r.to });
    setOpen(false);
  };

  const presetLabels: Record<DateRangePreset, string> = {
    ...PRESET_LABELS,
    all_time: allTimeLabel,
  };

  const applyCustom = () => {
    if (!draftFrom || !draftTo) return;
    const [from, to] = draftFrom > draftTo ? [draftTo, draftFrom] : [draftFrom, draftTo];
    onChange({ preset: 'custom', from, to });
    setOpen(false);
  };

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          width: fullWidth ? '100%' : undefined,
          padding: '8px 12px', height: 38, borderRadius: 8,
          border: `1px solid ${open ? '#4f46e5' : 'var(--border, #cbd5e1)'}`,
          background: '#fff', color: '#0f172a', fontSize: 13, fontWeight: 500,
          cursor: 'pointer',
          boxShadow: open ? '0 0 0 3px rgba(79,70,229,0.15)' : 'none',
          transition: 'border-color 120ms, box-shadow 120ms',
        }}
      >
        <Calendar size={15} style={{ color: '#64748b' }} />
        <span>{value.preset === 'all_time' ? allTimeLabel : formatRangeLabel(value)}</span>
        <ChevronDown
          size={15}
          style={{ marginLeft: 'auto', color: '#64748b', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 120ms' }}
        />
      </button>
      {open && (
        <div
          style={{
            position: 'absolute', top: 'calc(100% + 6px)', right: 0,
            width: 320, padding: 8,
            background: '#fff', border: '1px solid #e2e8f0',
            borderRadius: 10, boxShadow: '0 16px 32px rgba(15,23,42,0.14)',
            zIndex: 200,
          }}
        >
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, padding: 4 }}>
            {presets.map((p) => {
              const active = value.preset === p;
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => pickPreset(p)}
                  style={{
                    padding: '8px 10px', fontSize: 13, borderRadius: 6,
                    border: 'none', cursor: 'pointer', textAlign: 'left',
                    background: active ? '#eef2ff' : 'transparent',
                    color: active ? '#4338ca' : '#0f172a',
                    fontWeight: active ? 600 : 500,
                  }}
                  onMouseEnter={(e) => { if (!active) (e.currentTarget as HTMLButtonElement).style.background = '#f8fafc'; }}
                  onMouseLeave={(e) => { if (!active) (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
                >
                  {presetLabels[p]}
                </button>
              );
            })}
          </div>
          <div style={{ height: 1, background: '#e2e8f0', margin: '6px 4px' }} />
          <div style={{ padding: 4 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
              Custom Range
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              <input
                type="date"
                value={draftFrom}
                max={draftTo || undefined}
                onChange={(e) => setDraftFrom(e.target.value)}
                style={{
                  padding: '7px 8px', fontSize: 13, border: '1px solid #cbd5e1',
                  borderRadius: 6, color: '#0f172a', background: '#fff',
                }}
              />
              <input
                type="date"
                value={draftTo}
                min={draftFrom || undefined}
                onChange={(e) => setDraftTo(e.target.value)}
                style={{
                  padding: '7px 8px', fontSize: 13, border: '1px solid #cbd5e1',
                  borderRadius: 6, color: '#0f172a', background: '#fff',
                }}
              />
            </div>
            <button
              type="button"
              onClick={applyCustom}
              disabled={!draftFrom || !draftTo}
              style={{
                marginTop: 8, width: '100%', height: 34,
                background: !draftFrom || !draftTo ? '#cbd5e1' : '#4f46e5',
                color: '#fff', border: 'none', borderRadius: 6,
                fontSize: 13, fontWeight: 600,
                cursor: !draftFrom || !draftTo ? 'not-allowed' : 'pointer',
              }}
            >
              Apply Custom Range
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
