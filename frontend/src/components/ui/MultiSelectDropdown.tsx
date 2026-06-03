import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, X } from 'lucide-react';
import type { DropdownOption } from './Dropdown';

function arraysEqual(left: string[], right: string[]) {
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}

export default function MultiSelectDropdown({
  values,
  onChange,
  options,
  placeholder,
  height = 36,
}: {
  values: string[];
  onChange: (next: string[]) => void;
  options: DropdownOption[];
  placeholder: string;
  height?: number;
}) {
  const [open, setOpen] = useState(false);
  const [menuPlacement, setMenuPlacement] = useState<'top' | 'bottom'>('bottom');
  const [menuMaxHeight, setMenuMaxHeight] = useState(320);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || !ref.current || typeof window === 'undefined') return;

    const rect = ref.current.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const spaceBelow = viewportHeight - rect.bottom - 12;
    const spaceAbove = rect.top - 12;
    const shouldOpenUp = spaceBelow < 220 && spaceAbove > spaceBelow;
    const availableSpace = Math.max(160, shouldOpenUp ? spaceAbove : spaceBelow);

    setMenuPlacement(shouldOpenUp ? 'top' : 'bottom');
    setMenuMaxHeight(Math.min(320, availableSpace));
  }, [open, options.length]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  const selectedOptions = useMemo(
    () => options.filter((option) => values.includes(option.value)),
    [options, values],
  );

  const buttonLabel = useMemo(() => {
    if (selectedOptions.length === 0) return placeholder;
    if (selectedOptions.length === 1) return selectedOptions[0].label;
    if (selectedOptions.length === 2) return selectedOptions.map((option) => option.label).join(', ');
    return `${selectedOptions.length} selected`;
  }, [placeholder, selectedOptions]);

  const toggleValue = (value: string) => {
    const next = values.includes(value)
      ? values.filter((currentValue) => currentValue !== value)
      : [...values, value];
    onChange(next);
  };

  const clearAll = () => {
    if (values.length === 0) return;
    onChange([]);
  };

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        style={{
          width: '100%',
          height,
          padding: '0 10px',
          fontSize: 13,
          border: `1px solid ${open ? '#3b82f6' : '#cbd5e1'}`,
          borderRadius: 8,
          background: '#fff',
          color: selectedOptions.length > 0 ? '#0f172a' : '#94a3b8',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          cursor: 'pointer',
          textAlign: 'left',
          boxShadow: open ? '0 0 0 3px rgba(59,130,246,0.15)' : 'none',
          transition: 'border-color 120ms, box-shadow 120ms',
          gap: 8,
        }}
      >
        <span
          style={{
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            flex: 1,
          }}
        >
          {buttonLabel}
        </span>
        <ChevronDown
          size={16}
          style={{
            color: '#64748b',
            transition: 'transform 120ms',
            transform: open ? 'rotate(180deg)' : 'none',
            flexShrink: 0,
          }}
        />
      </button>
      {open && (
        <div
          style={{
            position: 'absolute',
            ...(menuPlacement === 'bottom'
              ? { top: 'calc(100% + 4px)' }
              : { bottom: 'calc(100% + 4px)' }),
            left: 0,
            right: 0,
            maxHeight: menuMaxHeight,
            overflowY: 'auto',
            background: '#fff',
            border: '1px solid #e2e8f0',
            borderRadius: 8,
            boxShadow: '0 12px 28px rgba(15,23,42,0.12)',
            zIndex: 100,
            padding: 4,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 8px 8px' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              {values.length > 0 ? `${values.length} selected` : 'No selection'}
            </div>
            <button
              type="button"
              onClick={clearAll}
              disabled={values.length === 0}
              style={{
                border: 'none',
                background: 'transparent',
                color: values.length > 0 ? '#64748b' : '#cbd5e1',
                cursor: values.length > 0 ? 'pointer' : 'not-allowed',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                fontSize: 12,
                fontWeight: 600,
                padding: 0,
              }}
            >
              <X size={12} /> Clear
            </button>
          </div>
          {options.length === 0 && (
            <div style={{ padding: '10px 12px', fontSize: 13, color: '#94a3b8' }}>
              No options
            </div>
          )}
          {options.map((opt) => {
            const active = values.includes(opt.value);
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => toggleValue(opt.value)}
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  fontSize: 13,
                  background: active ? '#eff6ff' : 'transparent',
                  color: active ? '#1d4ed8' : '#0f172a',
                  border: 'none',
                  borderRadius: 6,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  textAlign: 'left',
                  fontWeight: active ? 600 : 400,
                  gap: 8,
                }}
                onMouseEnter={(e) => {
                  if (!active) (e.currentTarget as HTMLButtonElement).style.background = '#f8fafc';
                }}
                onMouseLeave={(e) => {
                  if (!active) (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                  {opt.colour && (
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        background: opt.colour,
                        flexShrink: 0,
                      }}
                    />
                  )}
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{opt.label}</span>
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
