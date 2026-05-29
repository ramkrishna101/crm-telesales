import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { MicOff, Phone, PhoneOff, X } from 'lucide-react';
import { stringeeService } from '../../services/stringee.service';
import { useIsMobile } from '../../hooks/useIsMobile';
import Dropdown from '../ui/Dropdown';

const POPUP_WIDTH = 360;
const VIEWPORT_MARGIN = 20;

function formatDuration(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function getStatusLabel(state: ReturnType<typeof stringeeService.getSnapshot>) {
  if (state.callStatus === 'dialing') return 'Dialing...';
  if (state.callStatus === 'ringing') return 'Ringing...';
  if (state.callStatus === 'in_call') return 'In call';
  if (state.callStatus === 'ended') return 'Call ended';
  if (state.callStatus === 'failed') return 'Call failed';
  if (state.connectionStatus === 'loading-sdk') return 'Loading SDK...';
  if (state.connectionStatus === 'fetching-token') return 'Authenticating...';
  if (state.connectionStatus === 'connecting') return 'Connecting...';
  if (state.connectionStatus === 'connected') return 'Ready to call';
  return 'Not connected';
}

export default function StringeeCallPopup() {
  const state = useSyncExternalStore(stringeeService.subscribe, stringeeService.getSnapshot);
  const isMobile = useIsMobile();
  const popupRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ pointerOffsetX: number; pointerOffsetY: number } | null>(null);
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!state.visible) {
      setPosition(null);
      dragRef.current = null;
    }
  }, [state.visible]);

  const busy =
    state.callStatus === 'dialing' ||
    state.callStatus === 'ringing' ||
    state.callStatus === 'in_call';

  const canDial =
    !busy &&
    !!state.activePhone &&
    state.hotlines.length > 0 &&
    !!state.selectedHotline;

  const dotColor =
    state.callStatus === 'failed'
      ? '#ef4444'
      : state.callStatus === 'in_call'
        ? '#22c55e'
        : busy
          ? '#f59e0b'
          : state.connectionStatus === 'connected'
            ? '#22c55e'
            : '#94a3b8';

  const clampPosition = (nextX: number, nextY: number) => {
    const popupHeight = popupRef.current?.offsetHeight || 0;
    const maxX = Math.max(VIEWPORT_MARGIN, window.innerWidth - POPUP_WIDTH - VIEWPORT_MARGIN);
    const maxY = Math.max(VIEWPORT_MARGIN, window.innerHeight - popupHeight - VIEWPORT_MARGIN);

    return {
      x: Math.min(Math.max(VIEWPORT_MARGIN, nextX), maxX),
      y: Math.min(Math.max(VIEWPORT_MARGIN, nextY), maxY),
    };
  };

  const handleHeaderPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    if ((event.target as HTMLElement).closest('button')) return;

    const popup = popupRef.current;
    if (!popup) return;

    const rect = popup.getBoundingClientRect();
    dragRef.current = {
      pointerOffsetX: event.clientX - rect.left,
      pointerOffsetY: event.clientY - rect.top,
    };

    setPosition({ x: rect.left, y: rect.top });
    event.preventDefault();
  };

  const popupPositionStyle = position
    ? { top: position.y, left: position.x }
    : isMobile
      ? { left: 10, right: 10, bottom: 88 }
      : { bottom: VIEWPORT_MARGIN, right: VIEWPORT_MARGIN };

  useEffect(() => {
    if (!position) return;

    const handlePointerMove = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      setPosition(clampPosition(event.clientX - drag.pointerOffsetX, event.clientY - drag.pointerOffsetY));
    };

    const handlePointerUp = () => {
      dragRef.current = null;
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [position]);

  if (!state.visible) return null;

  const hotlineOptions = state.hotlines.map((hotline) => ({ value: hotline, label: `+${hotline}` }));

  if (isMobile) {
    return (
      <div
        ref={popupRef}
        className="agent-mobile-call-widget"
        style={{
          position: 'fixed',
          left: 10,
          right: 10,
          bottom: 88,
          zIndex: 1200,
          overflow: 'hidden',
        }}
      >
        <div className="agent-mobile-call-widget__topbar">
          <div className="agent-mobile-call-widget__topbar-status">
            <span className="agent-mobile-call-widget__status" style={{ width: 8, height: 8, borderRadius: '50%', background: dotColor }} />
            <span>{getStatusLabel(state)}</span>
          </div>
          <button
            onClick={() => stringeeService.dismiss()}
            disabled={busy}
            className="agent-mobile-call-widget__close"
            style={{ opacity: busy ? 0.45 : 1 }}
          >
            <X size={14} />
          </button>
        </div>

        <div className="agent-mobile-call-widget__panel">
          <div className="agent-mobile-call-widget__hero">
            <div className="agent-mobile-call-widget__eyebrow">{state.callStatus === 'in_call' ? 'In Call' : getStatusLabel(state)}</div>
            <div className="agent-mobile-call-widget__lead">{state.activeLeadName || 'Lead'}</div>
            <div className="agent-mobile-call-widget__phone">{state.activePhone || 'Loading number…'}</div>
            <div className="agent-mobile-call-widget__timer">
              {busy ? formatDuration(state.elapsedSeconds) : '00:00'}
            </div>
          </div>

          <div className="agent-mobile-call-widget__field-group">
            <div className="agent-mobile-call-widget__field-label">From Number</div>
            {state.loadingHotlines ? (
              <div className="agent-mobile-call-widget__selector agent-mobile-call-widget__selector--readonly">
                Loading numbers…
              </div>
            ) : state.hotlines.length === 0 ? (
              <div className="agent-mobile-call-widget__selector agent-mobile-call-widget__selector--readonly">
                No numbers available
              </div>
            ) : busy ? (
              <div className="agent-mobile-call-widget__selector agent-mobile-call-widget__selector--readonly">
                {state.selectedHotline ? `+${state.selectedHotline}` : 'No number selected'}
              </div>
            ) : (
              <Dropdown
                value={state.selectedHotline || ''}
                onChange={(value) => stringeeService.setSelectedHotline(value)}
                options={hotlineOptions}
                placeholder="Select a number"
                height={40}
              />
            )}
          </div>

          {state.error && (
            <div className="agent-mobile-call-widget__error">
              <span>{state.error}</span>
              <button
                onClick={() => stringeeService.clearError()}
                className="agent-mobile-call-widget__error-dismiss"
              >
                Dismiss
              </button>
            </div>
          )}

          <div className="agent-mobile-call-widget__actions">
            {busy ? (
              <>
                <button
                  onClick={() => stringeeService.toggleMute()}
                  disabled={!state.canMute}
                  title={state.muted ? 'Unmute' : 'Mute'}
                  className="agent-mobile-call-widget__button agent-mobile-call-widget__button--muted"
                  style={{ opacity: state.canMute ? 1 : 0.5 }}
                >
                  <MicOff size={15} />
                </button>
                <button
                  onClick={() => void stringeeService.hangup()}
                  title="Hang up"
                  className="agent-mobile-call-widget__button agent-mobile-call-widget__button--danger"
                >
                  <PhoneOff size={16} />
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => void stringeeService.placeCall()}
                  disabled={!canDial}
                  title="Call"
                  className="agent-mobile-call-widget__button agent-mobile-call-widget__button--call"
                  style={{ opacity: canDial ? 1 : 0.55 }}
                >
                  <Phone size={16} />
                </button>
                <button
                  onClick={() => stringeeService.dismiss()}
                  title="Cancel"
                  className="agent-mobile-call-widget__button agent-mobile-call-widget__button--muted"
                >
                  <X size={15} />
                </button>
              </>
            )}

            {state.activeLeadId && (
              <button
                onClick={() => stringeeService.openOutcomeForActiveLead()}
                title="Log call outcome"
                className="agent-mobile-call-widget__log"
              >
                Log
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={popupRef}
      className={undefined}
      style={{
        position: 'fixed',
        width: isMobile ? 'auto' : POPUP_WIDTH,
        background: isMobile ? 'linear-gradient(180deg, #ffffff 0%, #f8fbff 100%)' : '#fff',
        borderRadius: isMobile ? 24 : 14,
        boxShadow: isMobile ? '0 20px 40px rgba(24, 33, 77, 0.18)' : '0 20px 60px rgba(0,0,0,0.18)',
        zIndex: 1200,
        overflow: 'hidden',
        border: isMobile ? '1px solid rgba(91, 141, 239, 0.16)' : '1px solid #e5e7eb',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        ...popupPositionStyle,
      }}
    >
      {/* Header */}
      <div
        onPointerDown={handleHeaderPointerDown}
        className={isMobile ? 'agent-mobile-call-widget__header' : undefined}
        style={{
          display: 'flex',
          flexDirection: isMobile ? 'column' : 'row',
          justifyContent: 'space-between',
          alignItems: isMobile ? 'stretch' : 'center',
          padding: isMobile ? '10px 14px 8px' : '12px 16px',
          borderBottom: isMobile ? 'none' : '1px solid #f1f5f9',
          cursor: isMobile ? 'default' : 'move',
          userSelect: 'none',
        }}
      >
        {isMobile ? (
          <>
            <span className="agent-mobile-call-widget__handle" />
            <div className="agent-mobile-call-widget__header-row">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="agent-mobile-call-widget__status" style={{ width: 8, height: 8, borderRadius: '50%', background: dotColor }} />
                <span style={{ fontSize: 12, fontWeight: 700, color: '#295ebf' }}>{getStatusLabel(state)}</span>
              </div>
              <button
                onClick={() => stringeeService.dismiss()}
                disabled={busy}
                style={{
                  background: 'transparent', border: 'none',
                  color: '#94a3b8', cursor: busy ? 'not-allowed' : 'pointer',
                  padding: 4, borderRadius: 6, opacity: busy ? 0.4 : 1,
                }}
              >
                <X size={18} />
              </button>
            </div>
          </>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: dotColor }} />
              <span style={{ fontSize: 12, fontWeight: 600, color: '#475569' }}>{getStatusLabel(state)}</span>
            </div>
            <button
              onClick={() => stringeeService.dismiss()}
              disabled={busy}
              style={{
                background: 'transparent', border: 'none',
                color: '#94a3b8', cursor: busy ? 'not-allowed' : 'pointer',
                padding: 4, borderRadius: 6, opacity: busy ? 0.4 : 1,
              }}
            >
              <X size={16} />
            </button>
          </>
        )}
      </div>

      {/* Body */}
      <div className={isMobile ? 'agent-mobile-call-widget__body' : undefined} style={{ padding: isMobile ? '10px 14px 14px' : '18px 16px', background: isMobile ? 'transparent' : '#f8fafc' }}>
        <div style={{ textAlign: 'center', marginBottom: 16 }}>
          <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#94a3b8', fontWeight: 600 }}>
            {state.callStatus === 'in_call' ? 'IN CALL' : 'TO'}
          </div>
          <div className={isMobile ? 'agent-mobile-call-widget__lead' : undefined} style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', marginTop: 4 }}>
            {state.activeLeadName || 'Lead'}
          </div>
          <div className={isMobile ? 'agent-mobile-call-widget__phone' : undefined} style={{ fontFamily: 'ui-monospace, monospace', fontSize: 14, color: '#475569', marginTop: 2 }}>
            {state.activePhone || 'Loading number…'}
          </div>
          {busy && (
            <div className={isMobile ? 'agent-mobile-call-widget__timer' : undefined} style={{ fontFamily: 'ui-monospace, monospace', fontSize: 22, fontWeight: 700, color: '#0f172a', marginTop: 10 }}>
              {formatDuration(state.elapsedSeconds)}
            </div>
          )}
        </div>

        {!busy && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#64748b', fontWeight: 600, marginBottom: 6 }}>
              From Number
            </div>
            {state.loadingHotlines ? (
              <div
                className={isMobile ? 'agent-mobile-call-widget__selector' : undefined}
                style={{
                  width: '100%',
                  height: 40,
                  padding: '0 12px',
                  background: '#fff',
                  border: '1px solid #cbd5e1',
                  borderRadius: 8,
                  fontSize: 14,
                  color: '#94a3b8',
                  display: 'flex',
                  alignItems: 'center',
                  fontFamily: 'ui-monospace, monospace',
                }}
              >
                Loading numbers…
              </div>
            ) : state.hotlines.length === 0 ? (
              <div
                className={isMobile ? 'agent-mobile-call-widget__selector' : undefined}
                style={{
                  width: '100%',
                  height: 40,
                  padding: '0 12px',
                  background: '#fff',
                  border: '1px solid #cbd5e1',
                  borderRadius: 8,
                  fontSize: 14,
                  color: '#94a3b8',
                  display: 'flex',
                  alignItems: 'center',
                  fontFamily: 'ui-monospace, monospace',
                }}
              >
                No numbers available
              </div>
            ) : (
              <Dropdown
                value={state.selectedHotline || ''}
                onChange={(value) => stringeeService.setSelectedHotline(value)}
                options={state.hotlines.map((hotline) => ({ value: hotline, label: `+${hotline}` }))}
                placeholder="Select a number"
                height={40}
              />
            )}
          </div>
        )}

        {state.error && (
          <div
            className={isMobile ? 'agent-mobile-call-widget__error' : undefined}
            style={{
              padding: '8px 12px',
              background: '#fef2f2',
              border: '1px solid #fecaca',
              color: '#991b1b',
              borderRadius: 8,
              fontSize: 12,
              display: 'flex',
              justifyContent: 'space-between',
              gap: 8,
              alignItems: 'center',
              marginBottom: 10,
            }}
          >
            <span>{state.error}</span>
            <button
              onClick={() => stringeeService.clearError()}
              style={{ background: 'transparent', border: 'none', color: '#991b1b', cursor: 'pointer', fontSize: 11, fontWeight: 600 }}
            >
              Dismiss
            </button>
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div className={isMobile ? 'agent-mobile-call-widget__actions' : undefined} style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: isMobile ? 10 : 16, padding: isMobile ? '10px 14px 14px' : '16px', background: isMobile ? 'transparent' : '#fff', borderTop: isMobile ? 'none' : '1px solid #f1f5f9', position: 'relative' }}>
        {busy ? (
          <>
            <button
              onClick={() => stringeeService.toggleMute()}
              disabled={!state.canMute}
              title={state.muted ? 'Unmute' : 'Mute'}
              className={isMobile ? 'agent-mobile-call-widget__button agent-mobile-call-widget__button--muted' : undefined}
              style={{
                width: isMobile ? 36 : 48, height: isMobile ? 36 : 48, borderRadius: '50%',
                background: state.muted ? '#f59e0b' : '#e2e8f0',
                color: state.muted ? '#fff' : '#475569',
                border: 'none',
                cursor: state.canMute ? 'pointer' : 'not-allowed',
                opacity: state.canMute ? 1 : 0.5,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <MicOff size={isMobile ? 16 : 20} />
            </button>
            <button
              onClick={() => void stringeeService.hangup()}
              title="Hang up"
              className={isMobile ? 'agent-mobile-call-widget__button agent-mobile-call-widget__button--danger' : undefined}
              style={{
                width: isMobile ? 36 : 56, height: isMobile ? 36 : 56, borderRadius: '50%',
                background: '#ef4444', color: '#fff', border: 'none',
                cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 4px 12px rgba(239,68,68,0.35)',
              }}
            >
              <PhoneOff size={isMobile ? 16 : 22} />
            </button>
          </>
        ) : (
          <>
            <button
              onClick={() => void stringeeService.placeCall()}
              disabled={!canDial}
              title="Call"
              className={isMobile ? 'agent-mobile-call-widget__button agent-mobile-call-widget__button--call' : undefined}
              style={{
                width: isMobile ? 42 : 56, height: isMobile ? 42 : 56, borderRadius: '50%',
                background: canDial ? '#22c55e' : '#94a3b8', color: '#fff', border: 'none',
                cursor: canDial ? 'pointer' : 'not-allowed',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: canDial ? '0 4px 12px rgba(34,197,94,0.35)' : 'none',
                transition: 'all 0.2s',
              }}
            >
              <Phone size={isMobile ? 18 : 22} />
            </button>
            <button
              onClick={() => stringeeService.dismiss()}
              title="Cancel"
              className={isMobile ? 'agent-mobile-call-widget__button' : undefined}
              style={{
                width: isMobile ? 36 : 48, height: isMobile ? 36 : 48, borderRadius: '50%',
                background: '#e2e8f0', color: '#475569', border: 'none',
                cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <X size={isMobile ? 16 : 20} />
            </button>
          </>
        )}

        {/* Small Log button to open the outcome modal manually */}
        {state.activeLeadId && (
          <button
            onClick={() => stringeeService.openOutcomeForActiveLead()}
            title="Log call outcome"
            className={isMobile ? 'agent-mobile-call-widget__log' : undefined}
            style={{
              position: isMobile ? 'static' : 'absolute', right: 14, top: '50%', transform: isMobile ? 'none' : 'translateY(-50%)',
              padding: isMobile ? '4px 10px' : '6px 12px', fontSize: isMobile ? 11 : 12, fontWeight: 600,
              background: '#eff6ff', color: '#1d4ed8',
              border: '1px solid #bfdbfe', borderRadius: 6,
              cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 4,
            }}
          >
            Log
          </button>
        )}
      </div>
    </div>
  );
}
