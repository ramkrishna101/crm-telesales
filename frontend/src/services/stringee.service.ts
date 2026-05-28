import axios from 'axios';
import { api } from './api';
import { useAuthStore } from '../store/authStore';

function extractApiError(err: unknown, fallback: string): Error {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as
      | { message?: string; error?: string | { code?: string; message?: string } }
      | undefined;
    const nested = typeof data?.error === 'object' ? data?.error?.message : (data?.error as string | undefined);
    return new Error(data?.message || nested || err.message || fallback);
  }
  return err instanceof Error ? err : new Error(fallback);
}

function extractHotlinesPayload(data: unknown): string[] {
  if (Array.isArray((data as { data?: { hotlines?: unknown } } | undefined)?.data?.hotlines)) {
    return ((data as { data: { hotlines: unknown[] } }).data.hotlines)
      .filter((value): value is string => typeof value === 'string' && value.trim().length > 0);
  }

  if (Array.isArray((data as { hotlines?: unknown } | undefined)?.hotlines)) {
    return ((data as { hotlines: unknown[] }).hotlines)
      .filter((value): value is string => typeof value === 'string' && value.trim().length > 0);
  }

  if (typeof data === 'string' && /<!doctype html|<html/i.test(data)) {
    throw new Error('Stringee numbers endpoint returned HTML instead of JSON');
  }

  throw new Error('Stringee numbers endpoint returned an invalid response');
}

type ConnectionStatus = 'idle' | 'loading-sdk' | 'fetching-token' | 'connecting' | 'connected' | 'failed';
type CallStatus = 'idle' | 'dialing' | 'ringing' | 'in_call' | 'ended' | 'failed';

interface StringeeSnapshot {
  visible: boolean;
  enabled: boolean;
  sdkReady: boolean;
  connectionStatus: ConnectionStatus;
  callStatus: CallStatus;
  error: string | null;
  activeLeadId: string | null;
  activeLeadName: string | null;
  activePhone: string | null;
  muted: boolean;
  canMute: boolean;
  elapsedSeconds: number;
  hotlines: string[];
  selectedHotline: string | null;
  loadingHotlines: boolean;
  lastCall: LastCallSummary | null;
  showOutcome: boolean;
}

export interface LastCallSummary {
  leadId: string;
  leadName: string | null;
  phone: string | null;
  fromNumber: string | null;
  startedAt: string;
  answeredAt: string | null;
  endedAt: string;
  durationSeconds: number;
  answered: boolean;
  endReason: string;
  telephonyRef: string | null;
}

const SDK_URL = 'https://cdn.stringee.com/sdk/web/latest/stringee-web-sdk.min.js';

const initialSnapshot: StringeeSnapshot = {
  visible: false,
  enabled: true,
  sdkReady: false,
  connectionStatus: 'idle',
  callStatus: 'idle',
  error: null,
  activeLeadId: null,
  activeLeadName: null,
  activePhone: null,
  muted: false,
  canMute: false,
  elapsedSeconds: 0,
  hotlines: [],
  selectedHotline: null,
  loadingHotlines: false,
  lastCall: null,
  showOutcome: false,
};

declare global {
  interface Window {
    StringeeClient?: any;
    StringeeCall?: any;
  }
}

class StringeeService {
  private snapshot: StringeeSnapshot = initialSnapshot;
  private listeners = new Set<() => void>();
  private sdkPromise: Promise<void> | null = null;
  private client: any = null;
  private call: any = null;
  private currentUserId: string | null = null;
  private serverAddrs: string[] | null = null;
  private hotlines: string[] | null = null;
  private timerId: number | null = null;
  private connectPromise: Promise<void> | null = null;
  private remoteAudioEl: HTMLAudioElement | null = null;
  private callStartedAt: number | null = null;
  private callAnsweredAt: number | null = null;
  private currentCallId: string | null = null;
  private currentFromNumber: string | null = null;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = () => this.snapshot;

  private emit() {
    this.listeners.forEach((listener) => listener());
  }

  private update(patch: Partial<StringeeSnapshot>) {
    this.snapshot = { ...this.snapshot, ...patch };
    this.emit();
  }

  private clearTimer() {
    if (this.timerId !== null) {
      window.clearInterval(this.timerId);
      this.timerId = null;
    }
  }

  // Lazily create a hidden <audio autoplay> element the Stringee remote
  // MediaStream can be piped into. Without this, SIP 183 early-media
  // (ringback) and post-answer voice are received over WebRTC but never
  // rendered, so the agent hears silence.
  private ensureRemoteAudio(): HTMLAudioElement {
    if (this.remoteAudioEl) return this.remoteAudioEl;
    const el = document.createElement('audio');
    el.autoplay = true;
    el.setAttribute('playsinline', 'true');
    el.style.display = 'none';
    document.body.appendChild(el);
    this.remoteAudioEl = el;
    return el;
  }

  private detachRemoteAudio() {
    if (this.remoteAudioEl) {
      try {
        this.remoteAudioEl.srcObject = null;
      } catch {
        // ignore
      }
    }
  }

  private startTimer() {
    this.clearTimer();
    this.update({ elapsedSeconds: 0 });
    this.timerId = window.setInterval(() => {
      this.update({ elapsedSeconds: this.snapshot.elapsedSeconds + 1 });
    }, 1000);
  }

  private async loadSdk(): Promise<void> {
    if (window.StringeeClient && window.StringeeCall) {
      this.update({ sdkReady: true });
      return;
    }
    if (this.sdkPromise) return this.sdkPromise;

    this.update({ connectionStatus: 'loading-sdk' });
    this.sdkPromise = new Promise<void>((resolve, reject) => {
      const existing = document.querySelector(`script[src="${SDK_URL}"]`) as HTMLScriptElement | null;
      if (existing) {
        existing.addEventListener('load', () => resolve());
        existing.addEventListener('error', () => reject(new Error('Failed to load Stringee SDK')));
        return;
      }
      const script = document.createElement('script');
      script.src = SDK_URL;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Failed to load Stringee SDK'));
      document.head.appendChild(script);
    }).then(() => {
      this.update({ sdkReady: true });
    });

    return this.sdkPromise;
  }

  private async fetchConfig() {
    if (this.serverAddrs) return;
    try {
      const res = await api.get('/stringee/config');
      this.serverAddrs = res.data.data.serverAddrs as string[];
    } catch (err) {
      throw extractApiError(err, 'Failed to load Stringee config');
    }
  }

  private async fetchHotlines(): Promise<string[]> {
    if (this.hotlines && this.hotlines.length) {
      // Make sure the snapshot reflects the cached list.
      if (this.snapshot.hotlines.length !== this.hotlines.length) {
        this.update({ hotlines: this.hotlines, selectedHotline: this.snapshot.selectedHotline || this.hotlines[0] });
      }
      return this.hotlines;
    }
    this.update({ loadingHotlines: true });
    try {
      const res = await api.get('/stringee/numbers');
      this.hotlines = extractHotlinesPayload(res.data);
    } catch (err) {
      this.update({ loadingHotlines: false });
      throw extractApiError(err, 'Failed to load Stringee hotlines');
    }
    if (!this.hotlines.length) {
      this.update({ loadingHotlines: false });
      throw new Error('No Stringee hotlines configured');
    }
    this.update({
      hotlines: this.hotlines,
      selectedHotline: this.snapshot.selectedHotline || this.hotlines[0],
      loadingHotlines: false,
    });
    return this.hotlines;
  }

  setSelectedHotline = (n: string) => {
    if (this.snapshot.hotlines.includes(n)) {
      this.update({ selectedHotline: n });
    }
  };

  private async fetchAgentToken(): Promise<{ authToken: string; accountId: string | null; email: string }> {
    this.update({ connectionStatus: 'fetching-token' });
    let res;
    try {
      res = await api.post('/stringee/agent-token');
    } catch (err) {
      throw extractApiError(err, 'Failed to fetch StringeeX token');
    }
    const data = res.data.data as { authToken: string; accountId: string | null; stringeeEmail: string };

    // Reflect accountId back into the auth store if returned.
    if (data.accountId) {
      const auth = useAuthStore.getState();
      if (auth.user && auth.user.stringeeAccountId !== data.accountId) {
        auth.updateUser?.({ ...auth.user, stringeeAccountId: data.accountId });
      }
    }

    return { authToken: data.authToken, accountId: data.accountId, email: data.stringeeEmail };
  }

  private attachClientEvents(client: any, resolve: () => void, reject: (err: Error) => void) {
    let settled = false;
    const timeout = window.setTimeout(() => {
      if (!settled) {
        settled = true;
        reject(new Error('Stringee connection timed out'));
      }
    }, 15000);

    client.on('connect', () => {
      this.update({ connectionStatus: 'connected', error: null });
    });
    client.on('authen', (res: any) => {
      if (res?.r === 0) {
        if (!settled) {
          settled = true;
          window.clearTimeout(timeout);
          resolve();
        }
      } else {
        if (!settled) {
          settled = true;
          window.clearTimeout(timeout);
          reject(new Error(res?.message || 'Stringee authentication failed'));
        }
      }
    });
    client.on('disconnect', () => {
      this.update({ connectionStatus: 'idle' });
    });
    client.on('requestnewtoken', async () => {
      try {
        const fresh = await this.fetchAgentToken();
        client.connect(fresh.authToken);
      } catch (err) {
        this.update({ error: err instanceof Error ? err.message : 'Failed to refresh token' });
      }
    });
    client.on('incomingcall', (incoming: any) => {
      // We dial outbound via StringeeCall.makeCall (client-side), so any
      // incoming call here is unsolicited — reject it.
      try {
        incoming.reject();
      } catch {
        // ignore
      }
    });
  }

  private async ensureConnected(): Promise<void> {
    if (this.client && this.snapshot.connectionStatus === 'connected') return;
    if (this.connectPromise) return this.connectPromise;

    this.connectPromise = (async () => {
      await this.loadSdk();
      await this.fetchConfig();
      const session = await this.fetchAgentToken();
      this.currentUserId = session.accountId || session.email;

      this.update({ connectionStatus: 'connecting', error: null });
      const client = new window.StringeeClient(this.serverAddrs || undefined);
      this.client = client;

      await new Promise<void>((resolve, reject) => {
        this.attachClientEvents(client, resolve, reject);
        client.connect(session.authToken);
      });
    })();

    try {
      await this.connectPromise;
    } finally {
      this.connectPromise = null;
    }
  }

  private attachCallEvents(call: any) {
    call.on('signalingstate', (state: any) => {
      const code = state?.code;
      // 1=calling, 2=ringing, 3=answered, 4=busy, 5=ended, 6=rejected
      if (code === 1) this.update({ callStatus: 'dialing' });
      else if (code === 2) this.update({ callStatus: 'ringing' });
      else if (code === 3) {
        this.callAnsweredAt = Date.now();
        this.update({ callStatus: 'in_call', canMute: true });
        this.startTimer();
      } else if (code === 4 || code === 6) {
        this.clearTimer();
        this.detachRemoteAudio();
        const reason = state?.reason || (code === 4 ? 'Busy' : 'Rejected');
        this.finaliseCall(false, reason);
        this.update({ callStatus: 'failed', error: reason, canMute: false });
      } else if (code === 5) {
        this.clearTimer();
        this.detachRemoteAudio();
        const wasAnswered = !!this.callAnsweredAt;
        const reason = state?.reason || (wasAnswered ? 'AGENT_END_CALL' : 'NO_ANSWER');
        this.finaliseCall(wasAnswered, reason);
        this.update({ callStatus: 'ended', canMute: false });
      }
    });

    call.on('mediastate', (_state: any) => {
      // could surface audio state here if needed
    });

    // Pipe the carrier-side audio (ringback during 183, voice after 200 OK)
    // into a hidden <audio> element so the agent actually hears the call.
    call.on('addremotestream', (stream: MediaStream) => {
      const el = this.ensureRemoteAudio();
      try {
        el.srcObject = stream;
        // Some browsers need an explicit play() kick when srcObject is reset.
        const p = el.play();
        if (p && typeof p.catch === 'function') p.catch(() => {});
      } catch {
        // ignore — best effort
      }
    });

    // We don't need to render local mic, but accepting the event prevents
    // SDK warnings on some versions.
    call.on('addlocalstream', (_stream: MediaStream) => {
      // no-op
    });

    call.on('info', (_info: any) => {
      // ignore
    });

    call.on('otherdevice', () => {
      this.clearTimer();
      this.detachRemoteAudio();
      this.finaliseCall(!!this.callAnsweredAt, 'OTHER_DEVICE');
      this.update({ callStatus: 'ended' });
    });
  }

  // Builds a LastCallSummary from the in-flight call timing and exposes it
  // via the snapshot so the post-call outcome modal can open. Only fires the
  // outcome modal if we actually had an active lead (a placed call).
  private finaliseCall(answered: boolean, reason: string) {
    const { activeLeadId, activeLeadName, activePhone } = this.snapshot;
    if (!activeLeadId) return;
    const now = Date.now();
    const startedAt = this.callStartedAt || now;
    const answeredAt = this.callAnsweredAt || null;
    const durationSeconds = answeredAt ? Math.max(0, Math.round((now - answeredAt) / 1000)) : 0;
    const summary: LastCallSummary = {
      leadId: activeLeadId,
      leadName: activeLeadName,
      phone: activePhone,
      fromNumber: this.currentFromNumber,
      startedAt: new Date(startedAt).toISOString(),
      answeredAt: answeredAt ? new Date(answeredAt).toISOString() : null,
      endedAt: new Date(now).toISOString(),
      durationSeconds,
      answered,
      endReason: reason,
      telephonyRef: this.currentCallId,
    };
    this.callStartedAt = null;
    this.callAnsweredAt = null;
    this.update({ lastCall: summary, showOutcome: true });
  }

  dismissOutcome = () => {
    this.update({ showOutcome: false });
  };

  // Manually open the post-call outcome modal for the currently active lead
  // without an actual call having taken place — useful when the agent dialled
  // from the desk phone or wants to log an outcome before/after the SDK call.
  openOutcomeForActiveLead = () => {
    const { activeLeadId, activeLeadName, activePhone, selectedHotline, lastCall } = this.snapshot;
    if (!activeLeadId) return;
    // Reuse the most recent in-flight summary if we have one for the same lead,
    // otherwise synthesise a stub so the modal has the fields it needs.
    const summary: LastCallSummary = lastCall && lastCall.leadId === activeLeadId
      ? lastCall
      : {
          leadId: activeLeadId,
          leadName: activeLeadName,
          phone: activePhone,
          fromNumber: selectedHotline,
          startedAt: new Date().toISOString(),
          answeredAt: null,
          endedAt: new Date().toISOString(),
          durationSeconds: 0,
          answered: false,
          endReason: 'MANUAL_LOG',
          telephonyRef: null,
        };
    this.update({ lastCall: summary, showOutcome: true });
  };

  // Opens the dialer popup for a lead, loads phone + hotlines, and kicks off
  // WebSocket authentication in the background so that by the time the agent
  // picks a From Number and clicks the green Call button, the WS is usually
  // ready. If the WS is broken or never connected, placeCall() will (re)auth
  // on demand.
  startCall = async (leadId: string, fallbackName?: string): Promise<void> => {
    if (
      this.snapshot.callStatus === 'dialing' ||
      this.snapshot.callStatus === 'ringing' ||
      this.snapshot.callStatus === 'in_call'
    ) {
      throw new Error('Finish the active call before starting another one');
    }

    this.update({
      visible: true,
      error: null,
      callStatus: 'idle',
      activeLeadId: leadId,
      activeLeadName: fallbackName || 'Lead',
      activePhone: null,
      elapsedSeconds: 0,
      muted: false,
      canMute: false,
    });

    try {
      let callTargetResponse;
      try {
        callTargetResponse = await api.get(`/leads/${leadId}/call-target`);
      } catch (err) {
        throw extractApiError(err, 'Failed to load lead phone');
      }
      const callTarget = callTargetResponse.data.data as { phone: string; name: string | null };
      this.update({
        activeLeadName: callTarget.name || fallbackName || 'Lead',
        activePhone: callTarget.phone,
      });

      // Run hotline fetch + WebSocket auth in parallel so the UI is ready
      // ASAP when the agent picks a number.
      await Promise.all([
        this.fetchHotlines(),
        this.ensureConnected().catch((err) => {
          // Don't fail the prepare step on a transient WS error — placeCall()
          // will retry. Just surface the error.
          this.update({ error: err instanceof Error ? err.message : 'Connection failed' });
        }),
      ]);
    } catch (error) {
      this.update({
        callStatus: 'failed',
        error: error instanceof Error ? error.message : 'Failed to prepare call',
      });
      throw error;
    }
  };

  // Commits the call using the agent-selected hotline. If the WebSocket is
  // not connected (broken / first call), we (re)authenticate transparently
  // before dialing. Falls back through remaining hotlines if Stringee
  // rejects the chosen one (CALL_NOT_ALLOWED_BY_YOUR_SERVER).
  placeCall = async (): Promise<void> => {
    const { activeLeadId, activePhone, selectedHotline, hotlines } = this.snapshot;
    if (!activeLeadId || !activePhone) throw new Error('No lead selected');

    if (
      this.snapshot.callStatus === 'dialing' ||
      this.snapshot.callStatus === 'ringing' ||
      this.snapshot.callStatus === 'in_call'
    ) {
      return; // already in progress
    }

    try {
      // (Re)authenticate WS if needed \u2014 transparent to the agent.
      if (this.snapshot.connectionStatus !== 'connected') {
        await this.ensureConnected();
      }

      if (!this.currentUserId) throw new Error('Stringee user not initialised');
      if (!window.StringeeCall) throw new Error('Stringee SDK not ready');

      const customerNumber = this.normalisePhone(activePhone);
      if (!customerNumber) throw new Error('Invalid customer phone');

      // Put the selected hotline first; keep the rest as fallback in order.
      const list = selectedHotline
        ? [selectedHotline, ...hotlines.filter((h) => h !== selectedHotline)]
        : hotlines;
      if (!list.length) throw new Error('No hotlines available');

      this.update({ callStatus: 'dialing', error: null });
      await this.dialWithFallback(list, customerNumber);
    } catch (error) {
      this.clearTimer();
      const msg = error instanceof Error ? error.message : 'Failed to start call';
      // If signalingstate never fired, surface the failure to the outcome modal anyway.
      if (!this.snapshot.lastCall || this.snapshot.lastCall.leadId !== this.snapshot.activeLeadId) {
        this.finaliseCall(false, msg);
      }
      this.update({
        callStatus: 'failed',
        error: msg,
      });
      throw error;
    }
  };

  // Normalise customer phone to E.164 without the leading `+`, as Stringee
  // expects. A bare 10-digit Indian mobile (starts 6–9) is prefixed with `91`.
  // Without this, the Stringee gateway either misroutes `+...` as an internal
  // SDK user or returns `484 Address Incomplete` for domestic-format numbers.
  private normalisePhone(raw: string): string {
    let n = (raw || '').replace(/[\s\-()]/g, '');
    if (n.startsWith('+')) n = n.slice(1);
    if (n.startsWith('00')) n = n.slice(2);
    if (/^[6-9]\d{9}$/.test(n)) n = '91' + n;
    return n;
  }

  // Iterates through available hotlines, retrying when Stringee returns
  // CALL_NOT_ALLOWED_BY_YOUR_SERVER (r=4) or similar per-number rejection,
  // mirroring the Zoho widget's tryCall(fromIndex+1) pattern.
  private async dialWithFallback(hotlines: string[], customerNumber: string): Promise<void> {
    let lastError: string | null = null;
    for (let i = 0; i < hotlines.length; i++) {
      const fromNumber = hotlines[i];
      try {
        await this.attemptMakeCall(fromNumber, customerNumber);
        return; // success
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        lastError = msg;
        // Retry only on per-hotline rejection; bail on other errors
        if (!/CALL_NOT_ALLOWED_BY_YOUR_SERVER|not allowed|r=4|r=5/i.test(msg)) {
          throw err;
        }
        // try next hotline
      }
    }
    throw new Error(lastError || 'All hotlines rejected the call');
  }

  private attemptMakeCall(fromNumber: string, toNumber: string): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const call = new window.StringeeCall(
          this.client,
          fromNumber,
          toNumber,
          false, // not a video call
        );
        this.call = call;
        this.currentFromNumber = fromNumber;
        this.callStartedAt = Date.now();
        this.callAnsweredAt = null;
        this.currentCallId = null;
        this.attachCallEvents(call);
        call.makeCall((res: any) => {
          if (res?.r === 0) {
            // makeCall accepted; further state delivered via signalingstate
            this.currentCallId = res?.callId || null;
            resolve();
          } else {
            reject(new Error(res?.message || `makeCall failed (r=${res?.r})`));
          }
        });
      } catch (e) {
        reject(e instanceof Error ? e : new Error('makeCall threw'));
      }
    });
  }

  hangup = async (): Promise<void> => {
    if (this.call) {
      try {
        this.call.hangup(() => {});
      } catch {
        // ignore
      }
    }
    this.clearTimer();
    this.detachRemoteAudio();
    this.update({ callStatus: 'ended', canMute: false });
  };

  toggleMute = () => {
    if (!this.call) return;
    const next = !this.snapshot.muted;
    try {
      this.call.mute(next);
      this.update({ muted: next });
    } catch (err) {
      this.update({ error: err instanceof Error ? err.message : 'Mute failed' });
    }
  };

  dismiss = () => {
    this.clearTimer();
    if (
      this.snapshot.callStatus === 'dialing' ||
      this.snapshot.callStatus === 'ringing' ||
      this.snapshot.callStatus === 'in_call'
    ) {
      this.hangup();
    }
    this.call = null;
    this.update({
      visible: false,
      error: null,
      callStatus: 'idle',
      activeLeadId: null,
      activeLeadName: null,
      activePhone: null,
      elapsedSeconds: 0,
      muted: false,
      canMute: false,
    });
  };

  resetSession = () => {
    this.clearTimer();
    this.detachRemoteAudio();
    if (this.call) {
      try {
        this.call.hangup(() => {});
      } catch {
        // ignore
      }
    }
    if (this.client) {
      try {
        this.client.disconnect?.();
      } catch {
        // ignore
      }
    }

    this.call = null;
    this.client = null;
    this.connectPromise = null;
    this.currentUserId = null;
    this.serverAddrs = null;
    this.hotlines = null;
    this.callStartedAt = null;
    this.callAnsweredAt = null;
    this.currentCallId = null;
    this.currentFromNumber = null;
    this.sdkPromise = null;
    this.snapshot = { ...initialSnapshot };
    this.emit();
  };

  clearError = () => {
    this.update({ error: null });
  };
}

export const stringeeService = new StringeeService();
