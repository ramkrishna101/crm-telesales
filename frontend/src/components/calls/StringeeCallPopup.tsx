import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { MicOff, Phone, PhoneOff, X } from 'lucide-react';
import { stringeeService } from '../../services/stringee.service';
import { useIsMobile } from '../../hooks/useIsMobile';
import Dropdown from '../ui/Dropdown';

const FLOATING_PANEL_WIDTH = 320;
const FLOATING_PANEL_MARGIN = 20;

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
  const floatingPanelRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ pointerOffsetX: number; pointerOffsetY: number } | null>(null);
  const [floatingPosition, setFloatingPosition] = useState<{ x: number; y: number } | null>(null);

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

  useEffect(() => {
    if (!state.visible || !busy || isMobile) {
      setFloatingPosition(null);
      dragRef.current = null;
    }
  }, [busy, isMobile, state.visible]);

  const clampFloatingPosition = (nextX: number, nextY: number) => {
    const panelHeight = floatingPanelRef.current?.offsetHeight || 0;
    const maxX = Math.max(FLOATING_PANEL_MARGIN, window.innerWidth - FLOATING_PANEL_WIDTH - FLOATING_PANEL_MARGIN);
    const maxY = Math.max(FLOATING_PANEL_MARGIN, window.innerHeight - panelHeight - FLOATING_PANEL_MARGIN);

    return {
      x: Math.min(Math.max(FLOATING_PANEL_MARGIN, nextX), maxX),
      y: Math.min(Math.max(FLOATING_PANEL_MARGIN, nextY), maxY),
    };
  };

  const handleFloatingHeaderPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    if ((event.target as HTMLElement).closest('button')) return;

    const panel = floatingPanelRef.current;
    if (!panel) return;

    const rect = panel.getBoundingClientRect();
    dragRef.current = {
      pointerOffsetX: event.clientX - rect.left,
      pointerOffsetY: event.clientY - rect.top,
    };
    setFloatingPosition({ x: rect.left, y: rect.top });
    event.preventDefault();
  };

  useEffect(() => {
    if (!floatingPosition) return;

    const handlePointerMove = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      setFloatingPosition(clampFloatingPosition(event.clientX - drag.pointerOffsetX, event.clientY - drag.pointerOffsetY));
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
  }, [floatingPosition]);

  if (!state.visible) return null;

  const hotlineOptions = state.hotlines.map((hotline) => ({ value: hotline, label: `+${hotline}` }));
  const statusLabel = getStatusLabel(state);
  const timerLabel = busy ? formatDuration(state.elapsedSeconds) : '--:--';
  const hotlineLabel = state.selectedHotline ? `+${state.selectedHotline}` : 'No number selected';
  const surfaceStyle: React.CSSProperties = {
    minHeight: 52,
    borderRadius: 16,
    border: '1px solid #dddfea',
    background: 'linear-gradient(180deg, #ffffff 0%, #f7f7fb 100%)',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.9)',
  };

  const hotlineControl = state.loadingHotlines ? (
    <div className="agent-mobile-call-widget__selector agent-mobile-call-widget__selector--readonly" style={surfaceStyle}>
      Loading numbers...
    </div>
  ) : state.hotlines.length === 0 ? (
    <div className="agent-mobile-call-widget__selector agent-mobile-call-widget__selector--readonly" style={surfaceStyle}>
      No numbers available
    </div>
  ) : busy ? (
    <div className="agent-mobile-call-widget__selector agent-mobile-call-widget__selector--readonly" style={surfaceStyle}>
      {hotlineLabel}
    </div>
  ) : (
    <div className="agent-mobile-call-widget__dropdown-wrap" style={surfaceStyle}>
      <Dropdown
        value={state.selectedHotline || ''}
        onChange={(value) => stringeeService.setSelectedHotline(value)}
        options={hotlineOptions}
        placeholder="Select a number"
        height={52}
      />
    </div>
  );

  const logButton = state.activeLeadId ? (
    <button
      type="button"
      onClick={() => stringeeService.openOutcomeForActiveLead()}
      title="Open log"
      className="agent-mobile-call-widget__log"
    >
      Open Log
    </button>
  ) : null;

  const floatingPanelStyle: React.CSSProperties = floatingPosition
    ? { top: floatingPosition.y, left: floatingPosition.x }
    : { bottom: FLOATING_PANEL_MARGIN, right: FLOATING_PANEL_MARGIN };

  if (isMobile) {
    return (
      <div
        className="agent-mobile-call-widget-backdrop"
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 1200,
          background: 'linear-gradient(180deg, rgba(91,141,239,0.04) 0%, rgba(24,33,77,0.14) 100%)',
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'center',
          paddingTop: 80,
        }}
      >
        <div
          className="agent-mobile-call-widget"
          style={{
            margin: '0 10px',
            width: '100%',
            maxHeight: 'calc(100vh - 96px)',
            borderRadius: '28px 28px 0 0',
            overflow: 'hidden',
            border: '1px solid #dddfea',
            background: 'linear-gradient(180deg, #ffffff 0%, #f7f7fb 100%)',
            boxShadow: '0 -18px 36px rgba(24, 33, 77, 0.16)',
            backdropFilter: 'blur(18px)',
            color: '#1f2430',
          }}
        >
          <div className="agent-mobile-call-widget__topbar">
            <span className="agent-mobile-call-widget__handle" />
            <div className="agent-mobile-call-widget__topbar-row">
              <div className="agent-mobile-call-widget__topbar-status">
                <span className="agent-mobile-call-widget__status" style={{ background: dotColor }} />
                <span>{statusLabel}</span>
              </div>
              <button
                type="button"
                onClick={() => stringeeService.dismiss()}
                disabled={busy}
                className="agent-mobile-call-widget__close"
              >
                <X size={16} />
              </button>
            </div>
          </div>

          <div className="agent-mobile-call-widget__panel">
            <div className="agent-mobile-call-widget__halo" />
            <div className="agent-mobile-call-widget__hero-card">
              <div className="agent-mobile-call-widget__avatar">{(state.activeLeadName || 'L').slice(0, 1).toUpperCase()}</div>
              <div className="agent-mobile-call-widget__eyebrow">{busy ? 'Live Call' : 'Ready To Call'}</div>
              <div className="agent-mobile-call-widget__lead">{state.activeLeadName || 'Lead'}</div>
              <div className="agent-mobile-call-widget__phone">{state.activePhone || 'Loading number...'}</div>
              <div className="agent-mobile-call-widget__timer">{timerLabel}</div>
            </div>

            <div className="agent-mobile-call-widget__field-group">
              <div className="agent-mobile-call-widget__field-label">From Number</div>
              {hotlineControl}
            </div>

            {state.error && (
              <div className="agent-mobile-call-widget__error">
                <span>{state.error}</span>
                <button
                  type="button"
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
                    type="button"
                    onClick={() => stringeeService.toggleMute()}
                    disabled={!state.canMute}
                    title={state.muted ? 'Unmute' : 'Mute'}
                    className="agent-mobile-call-widget__button agent-mobile-call-widget__button--muted"
                    style={{ opacity: state.canMute ? 1 : 0.45 }}
                  >
                    <MicOff size={18} />
                  </button>
                  <button
                    type="button"
                    onClick={() => void stringeeService.hangup()}
                    title="Hang up"
                    className="agent-mobile-call-widget__button agent-mobile-call-widget__button--danger"
                  >
                    <PhoneOff size={22} />
                  </button>
                  {logButton}
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => void stringeeService.placeCall()}
                    disabled={!canDial}
                    title="Call"
                    className="agent-mobile-call-widget__button agent-mobile-call-widget__button--call"
                    style={{ opacity: canDial ? 1 : 0.55 }}
                  >
                    <Phone size={22} />
                  </button>
                  <button
                    type="button"
                    onClick={() => stringeeService.dismiss()}
                    title="Cancel"
                    className="agent-mobile-call-widget__button agent-mobile-call-widget__button--muted"
                  >
                    <X size={18} />
                  </button>
                  {logButton}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (busy) {
    return (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 1200,
          pointerEvents: 'none',
        }}
      >
        <div
          ref={floatingPanelRef}
          style={{
            position: 'absolute',
            width: FLOATING_PANEL_WIDTH,
            borderRadius: 22,
            border: '1px solid rgba(91,141,239,0.18)',
            background: 'linear-gradient(180deg, #ffffff 0%, #f7f7fb 100%)',
            boxShadow: '0 20px 44px rgba(24, 33, 77, 0.16)',
            backdropFilter: 'blur(14px)',
            color: '#1f2430',
            overflow: 'hidden',
            fontFamily: 'system-ui, -apple-system, sans-serif',
            pointerEvents: 'auto',
            ...floatingPanelStyle,
          }}
        >
          <div
            onPointerDown={handleFloatingHeaderPointerDown}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              gap: 12,
              padding: '14px 14px 10px',
              cursor: dragRef.current ? 'grabbing' : 'grab',
              userSelect: 'none',
              touchAction: 'none',
              background: 'linear-gradient(180deg, rgba(91,141,239,0.12) 0%, rgba(255,255,255,0) 100%)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, minWidth: 0 }}>
              <span style={{ width: 9, height: 9, borderRadius: '50%', marginTop: 4, background: dotColor, boxShadow: `0 0 0 6px ${dotColor}22` }} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#5b8def' }}>
                  {statusLabel}
                </div>
                <div style={{ fontSize: 12, color: '#7d8394', marginTop: 2 }}>
                  Drag to keep working in CRM
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => stringeeService.openOutcomeForActiveLead()}
              title="Open log"
              style={{
                minWidth: 88,
                height: 34,
                padding: '0 14px',
                borderRadius: 999,
                border: '1px solid rgba(91,141,239,0.24)',
                background: '#ffffff',
                color: '#5b8def',
                fontSize: 12,
                fontWeight: 800,
                    cursor: 'pointer',
                boxShadow: '0 8px 18px rgba(24, 33, 77, 0.06)',
              }}
            >
              Open Log
                </button>
              </div>

              <div style={{ padding: '0 14px 14px' }}>
                <div style={{ borderRadius: 18, border: '1px solid rgba(91,141,239,0.14)', background: 'linear-gradient(180deg, #ffffff 0%, #f4f7ff 100%)', boxShadow: '0 10px 20px rgba(24, 33, 77, 0.06)', padding: '16px 14px 14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 54, height: 54, borderRadius: '50%', background: 'linear-gradient(180deg, #5b8def, #4f84e8)', color: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 800, boxShadow: '0 12px 24px rgba(91,141,239,0.24)' }}>
                      {(state.activeLeadName || 'L').slice(0, 1).toUpperCase()}
                    </div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 18, fontWeight: 800, color: '#1f2430', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {state.activeLeadName || 'Lead'}
                      </div>
                      <div style={{ marginTop: 2, fontSize: 13, color: '#4f5565', fontFamily: 'ui-monospace, monospace' }}>
                        {state.activePhone || 'Loading number...'}
                      </div>
                    </div>
                  </div>

                  <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                    <div>
                      <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#7d8394', fontWeight: 700 }}>
                        From Number
                      </div>
                      <div style={{ marginTop: 4, fontSize: 13, fontWeight: 700, color: '#1f2430' }}>
                        {hotlineLabel}
                      </div>
                    </div>
                    <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 92, padding: '8px 14px', borderRadius: 999, background: '#ffffff', border: '1px solid rgba(91,141,239,0.18)', boxShadow: '0 8px 18px rgba(24, 33, 77, 0.06)', fontFamily: 'ui-monospace, monospace', fontSize: 20, fontWeight: 800, color: '#1f2430' }}>
                      {timerLabel}
                    </div>
                  </div>
                </div>

                {state.error && (
                  <div style={{ marginTop: 12, padding: '10px 12px', borderRadius: 14, border: '1px solid rgba(248,113,113,0.22)', background: '#fff5f5', color: '#b42318', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, fontSize: 12 }}>
                    <span>{state.error}</span>
                    <button
                      type="button"
                      onClick={() => stringeeService.clearError()}
                      style={{ border: 'none', background: 'transparent', color: '#b42318', cursor: 'pointer', fontSize: 11, fontWeight: 700 }}
                    >
                      Dismiss
                    </button>
                  </div>
                )}

                <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14 }}>
                  <button
                    type="button"
                    onClick={() => stringeeService.toggleMute()}
                    disabled={!state.canMute}
                    title={state.muted ? 'Unmute' : 'Mute'}
                    style={{
                      width: 54,
                      height: 54,
                      borderRadius: '50%',
                      border: '1px solid rgba(91,141,239,0.16)',
                      background: state.muted ? 'rgba(245,158,11,0.9)' : '#ffffff',
                      color: state.muted ? '#f8fafc' : '#1f2430',
                      cursor: state.canMute ? 'pointer' : 'not-allowed',
                      opacity: state.canMute ? 1 : 0.45,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      boxShadow: state.muted ? '0 14px 28px rgba(245,158,11,0.22)' : '0 10px 20px rgba(24, 33, 77, 0.06)',
                    }}
                  >
                    <MicOff size={22} />
                  </button>
                  <button
                    type="button"
                    onClick={() => void stringeeService.hangup()}
                    title="Hang up"
                    style={{
                      width: 68,
                      height: 68,
                      borderRadius: '50%',
                      border: 'none',
                      background: 'linear-gradient(180deg, #ef4444 0%, #dc2626 100%)',
                      color: '#fff',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      boxShadow: '0 18px 30px rgba(239, 68, 68, 0.24)',
                    }}
                  >
                    <PhoneOff size={24} />
                  </button>
                </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1200,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        background: 'radial-gradient(circle at top, rgba(91,141,239,0.14) 0%, rgba(16,26,45,0.26) 56%, rgba(16,26,45,0.38) 100%)',
        backdropFilter: 'blur(4px)',
      }}
      onClick={() => {
        if (!busy) stringeeService.dismiss();
      }}
    >
      <div
        style={{
          width: 'min(392px, calc(100vw - 40px))',
          maxHeight: 'min(660px, calc(100vh - 56px))',
          overflow: 'hidden',
          borderRadius: 26,
          border: '1px solid #dddfea',
          background: 'linear-gradient(180deg, #ffffff 0%, #f7f7fb 100%)',
          boxShadow: '0 22px 56px rgba(24, 33, 77, 0.16)',
          backdropFilter: 'blur(16px)',
          color: '#1f2430',
          position: 'relative',
          fontFamily: 'system-ui, -apple-system, sans-serif',
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
          <div style={{ position: 'absolute', top: -74, left: '50%', transform: 'translateX(-50%)', width: 220, height: 220, borderRadius: '50%', background: 'rgba(91,141,239,0.18)', filter: 'blur(36px)' }} />
          <div style={{ position: 'absolute', inset: 1, borderRadius: 25, border: '1px solid rgba(255,255,255,0.75)' }} />
        </div>

        <div style={{ position: 'relative', zIndex: 1, padding: '16px 18px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
              <span style={{ width: 9, height: 9, borderRadius: '50%', background: dotColor, boxShadow: `0 0 0 6px ${dotColor}22` }} />
              <div>
                <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#5b8def' }}>{statusLabel}</div>
                <div style={{ fontSize: 12, color: '#7d8394', marginTop: 2 }}>{busy ? 'Live connection active' : 'Call workspace ready'}</div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => stringeeService.dismiss()}
              disabled={busy}
              style={{
                width: 36,
                height: 36,
                borderRadius: 12,
                border: '1px solid #dddfea',
                background: '#f7f7fb',
                color: '#4f5565',
                cursor: busy ? 'not-allowed' : 'pointer',
                opacity: busy ? 0.42 : 1,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <X size={18} />
            </button>
          </div>

          <div style={{ marginTop: 16, padding: '22px 18px 18px', borderRadius: 22, background: 'linear-gradient(180deg, #ffffff 0%, #f4f7ff 100%)', border: '1px solid rgba(91,141,239,0.18)', textAlign: 'center', boxShadow: '0 12px 24px rgba(24, 33, 77, 0.06), inset 0 1px 0 rgba(255,255,255,0.9)' }}>
            <div style={{ width: 74, height: 74, borderRadius: '50%', margin: '0 auto', background: 'linear-gradient(180deg, #5b8def, #4f84e8)', color: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, fontWeight: 800, boxShadow: '0 14px 28px rgba(91,141,239,0.28)' }}>
              {(state.activeLeadName || 'L').slice(0, 1).toUpperCase()}
            </div>
            <div style={{ marginTop: 14, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#9fc0ff', fontWeight: 800 }}>
              {busy ? 'Connected Workspace' : 'Outgoing Dialer'}
            </div>
            <div style={{ marginTop: 8, fontSize: 24, lineHeight: 1.15, fontWeight: 800, color: '#1f2430' }}>
              {state.activeLeadName || 'Lead'}
            </div>
            <div style={{ marginTop: 6, fontSize: 14, color: '#4f5565', fontFamily: 'ui-monospace, monospace' }}>
              {state.activePhone || 'Loading number...'}
            </div>
            <div style={{ marginTop: 14, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 116, padding: '9px 16px', borderRadius: 999, background: '#ffffff', border: '1px solid rgba(91,141,239,0.18)', boxShadow: '0 8px 18px rgba(24, 33, 77, 0.06)', fontFamily: 'ui-monospace, monospace', fontSize: 24, fontWeight: 800, color: '#1f2430' }}>
              {timerLabel}
            </div>
          </div>

          <div style={{ marginTop: 16 }}>
            <div style={{ marginBottom: 8, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#7d8394', fontWeight: 700 }}>
              From Number
            </div>
            {hotlineControl}
          </div>

          {state.error && (
            <div style={{ marginTop: 16, padding: '12px 14px', borderRadius: 16, border: '1px solid rgba(248,113,113,0.32)', background: 'rgba(127,29,29,0.26)', color: '#fecaca', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, fontSize: 13 }}>
              <span>{state.error}</span>
              <button
                type="button"
                onClick={() => stringeeService.clearError()}
                style={{ border: 'none', background: 'transparent', color: '#fee2e2', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}
              >
                Dismiss
              </button>
            </div>
          )}

          <div style={{ marginTop: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, flexWrap: 'wrap' }}>
            {busy ? (
              <>
                <button
                  type="button"
                  onClick={() => stringeeService.toggleMute()}
                  disabled={!state.canMute}
                  title={state.muted ? 'Unmute' : 'Mute'}
                  style={{
                    width: 58,
                    height: 58,
                    borderRadius: '50%',
                    border: '1px solid rgba(91,141,239,0.16)',
                    background: state.muted ? 'rgba(245,158,11,0.9)' : '#ffffff',
                    color: state.muted ? '#f8fafc' : '#1f2430',
                    cursor: state.canMute ? 'pointer' : 'not-allowed',
                    opacity: state.canMute ? 1 : 0.45,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: state.muted ? '0 14px 28px rgba(245,158,11,0.22)' : '0 10px 20px rgba(24, 33, 77, 0.06)',
                  }}
                >
                  <MicOff size={24} />
                </button>
                <button
                  type="button"
                  onClick={() => void stringeeService.hangup()}
                  title="Hang up"
                  style={{
                    width: 74,
                    height: 74,
                    borderRadius: '50%',
                    border: 'none',
                    background: 'linear-gradient(180deg, #ef4444 0%, #dc2626 100%)',
                    color: '#fff',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 20px 34px rgba(239,68,68,0.3)',
                  }}
                >
                  <PhoneOff size={28} />
                </button>
                {logButton}
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => void stringeeService.placeCall()}
                  disabled={!canDial}
                  title="Call"
                  style={{
                    width: 74,
                    height: 74,
                    borderRadius: '50%',
                    border: 'none',
                    background: canDial ? 'linear-gradient(180deg, #22c55e 0%, #16a34a 100%)' : 'linear-gradient(180deg, #64748b 0%, #475569 100%)',
                    color: '#fff',
                    cursor: canDial ? 'pointer' : 'not-allowed',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: canDial ? '0 20px 34px rgba(34,197,94,0.26)' : 'none',
                    opacity: canDial ? 1 : 0.55,
                  }}
                >
                  <Phone size={28} />
                </button>
                <button
                  type="button"
                  onClick={() => stringeeService.dismiss()}
                  title="Cancel"
                  style={{
                    width: 58,
                    height: 58,
                    borderRadius: '50%',
                    border: '1px solid rgba(91,141,239,0.16)',
                    background: '#ffffff',
                    color: '#1f2430',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 10px 20px rgba(24, 33, 77, 0.06)',
                  }}
                >
                  <X size={24} />
                </button>
                {logButton}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
