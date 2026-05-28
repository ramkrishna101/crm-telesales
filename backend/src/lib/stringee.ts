import crypto from 'crypto';

const DEFAULT_SERVER_ADDRS = [
  'wss://india-s1.stringee.com:31082/',
  'wss://india-s2.stringee.com:31082/',
  'wss://india-s3.stringee.com:31082/',
];

const DEFAULT_TOKEN_TTL_SECONDS = 3600;

function encodeBase64Url(value: Buffer | string): string {
  return Buffer.from(value)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

export function isStringeeEnabled(): boolean {
  return process.env.STRINGEE_ENABLED !== 'false';
}

export function getStringeeServerAddrs(): string[] {
  const raw = process.env.STRINGEE_SERVER_ADDRS;
  if (!raw) return DEFAULT_SERVER_ADDRS;

  return raw
    .split(',')
    .map((addr) => addr.trim())
    .filter(Boolean);
}

export function getStringeeTokenTtlSeconds(): number {
  const parsed = parseInt(process.env.STRINGEE_TOKEN_TTL_SECONDS || '', 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_TOKEN_TTL_SECONDS;
  return parsed;
}

export function createStringeeAccessToken(userId: string): string {
  const apiSid = process.env.STRINGEE_API_SID;
  const apiSecret = process.env.STRINGEE_API_SECRET;

  if (!apiSid || !apiSecret) {
    throw new Error('Stringee credentials are not configured');
  }

  const now = Math.floor(Date.now() / 1000);
  const payload = {
    jti: `${apiSid}-${crypto.randomUUID()}`,
    iss: apiSid,
    exp: now + getStringeeTokenTtlSeconds(),
    userId,
    // Required for PCC (Programmable Contact Center) routing.
    // Without this, calls fail with CALL_NOT_ALLOWED_BY_YOUR_SERVER
    // unless the project has an Answer URL configured.
    icc_api: true,
  };

  const header = {
    typ: 'JWT',
    alg: 'HS256',
    cty: 'stringee-api;v=1',
  };

  const encodedHeader = encodeBase64Url(JSON.stringify(header));
  const encodedPayload = encodeBase64Url(JSON.stringify(payload));
  const signature = crypto
    .createHmac('sha256', apiSecret)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest();

  return `${encodedHeader}.${encodedPayload}.${encodeBase64Url(signature)}`;
}

// REST API token for server-to-server calls (e.g. PCC callout endpoint).
// Uses `rest_api: true` instead of `userId`, and is short-lived.
export function createStringeeRestApiToken(ttlSeconds = 60): string {
  const apiSid = process.env.STRINGEE_API_SID;
  const apiSecret = process.env.STRINGEE_API_SECRET;
  if (!apiSid || !apiSecret) throw new Error('Stringee credentials are not configured');

  const now = Math.floor(Date.now() / 1000);
  const payload = {
    jti: `${apiSid}-${crypto.randomUUID()}`,
    iss: apiSid,
    exp: now + ttlSeconds,
    rest_api: true,
  };
  const header = { typ: 'JWT', alg: 'HS256', cty: 'stringee-api;v=1' };
  const encodedHeader = encodeBase64Url(JSON.stringify(header));
  const encodedPayload = encodeBase64Url(JSON.stringify(payload));
  const signature = crypto
    .createHmac('sha256', apiSecret)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest();
  return `${encodedHeader}.${encodedPayload}.${encodeBase64Url(signature)}`;
}

export function getStringeeHotline(): string | null {
  const v = (process.env.STRINGEE_HOTLINE || '').trim();
  return v || null;
}

// ── Stringee CDR fetch ─────────────────────────────────────────────────
// Fetches the Call Detail Record for a given Stringee callId. Returns the
// server-side authoritative call duration, status, and timestamps.
// Tries the documented v1/v2 endpoints in order; the first one to return r=0
// wins. Returns null if every attempt fails so callers can fall back to
// client-side timings.

export interface StringeeCdr {
  callId: string;
  fromNumber: string | null;
  toNumber: string | null;
  startedAt: string | null;      // ISO
  answeredAt: string | null;     // ISO
  endedAt: string | null;        // ISO
  durationSeconds: number;       // talk time
  ringSeconds: number | null;
  status: string | null;         // e.g. ANSWERED, NO_ANSWER, BUSY, FAILED
  hangupCause: string | null;
  recordingUrl: string | null;
  raw: any;
}

const CDR_ENDPOINTS = [
  // StringeeX call history (preferred for PCC accounts)
  (id: string) => `https://api.stringee.com/v1/call2/cdrs?call_id=${encodeURIComponent(id)}`,
  (id: string) => `https://api.stringee.com/v1/call/cdrs?call_id=${encodeURIComponent(id)}`,
  (id: string) => `https://api.stringee.com/v1/call2/${encodeURIComponent(id)}`,
  (id: string) => `https://api.stringee.com/v1/call/${encodeURIComponent(id)}`,
];

function parseCdrPayload(callId: string, json: any): StringeeCdr | null {
  // Stringee returns either { r:0, cdrs:[…] } or a flat object.
  const record =
    (Array.isArray(json?.cdrs) && json.cdrs[0]) ||
    (Array.isArray(json?.data) && json.data[0]) ||
    json?.cdr ||
    json?.call ||
    json;
  if (!record || typeof record !== 'object') return null;

  const toIso = (v: unknown): string | null => {
    if (!v) return null;
    if (typeof v === 'number') return new Date(v < 1e12 ? v * 1000 : v).toISOString();
    if (typeof v === 'string') {
      const n = Number(v);
      if (Number.isFinite(n) && n > 0) return new Date(n < 1e12 ? n * 1000 : n).toISOString();
      const d = new Date(v);
      return isNaN(d.getTime()) ? null : d.toISOString();
    }
    return null;
  };

  const duration = Number(record.duration ?? record.talkDuration ?? record.talk_duration ?? 0) || 0;
  const ring = Number(record.ringDuration ?? record.ring_duration ?? 0) || null;

  return {
    callId,
    fromNumber: record.from ?? record.from_number ?? record.caller ?? null,
    toNumber: record.to ?? record.to_number ?? record.callee ?? null,
    startedAt: toIso(record.startTime ?? record.start_time ?? record.createdAt),
    answeredAt: toIso(record.answerTime ?? record.answer_time),
    endedAt: toIso(record.endTime ?? record.end_time),
    durationSeconds: Math.max(0, Math.round(duration)),
    ringSeconds: ring,
    status: record.status ?? record.callStatus ?? record.disposition ?? null,
    hangupCause: record.hangupCause ?? record.hangup_cause ?? record.reason ?? null,
    recordingUrl: record.recordUrl ?? record.record_url ?? record.recordingUrl ?? record.recording_url ?? null,
    raw: record,
  };
}

export async function fetchStringeeCdr(callId: string): Promise<StringeeCdr | null> {
  const token = createStringeeRestApiToken(60);
  for (const build of CDR_ENDPOINTS) {
    const url = build(callId);
    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: { 'X-STRINGEE-AUTH': token },
      });
      const text = await res.text();
      if (!text) continue;
      let json: any;
      try { json = JSON.parse(text); } catch { continue; }
      // Stringee uses r=0 for success
      if (json?.r !== undefined && json.r !== 0) continue;
      const cdr = parseCdrPayload(callId, json);
      if (cdr && (cdr.durationSeconds || cdr.endedAt || cdr.status)) return cdr;
    } catch {
      // try next endpoint
    }
  }
  return null;
}

// Returns the ordered list of hotlines the client may dial from.
// Reads STRINGEE_HOTLINES (comma-separated). Falls back to single STRINGEE_HOTLINE.
export function getStringeeHotlines(): string[] {
  const raw = (process.env.STRINGEE_HOTLINES || '').trim();
  const list = raw
    ? raw.split(',').map((s) => s.trim()).filter(Boolean)
    : [];
  const primary = getStringeeHotline();
  if (primary && !list.includes(primary)) list.unshift(primary);
  return list;
}

// ── StringeeX agent credential storage (AES-256-GCM) ───────────────────

function getCredKey(): Buffer {
  const hex = process.env.STRINGEE_CRED_KEY;
  if (!hex) throw new Error('STRINGEE_CRED_KEY not configured (32-byte hex)');
  const key = Buffer.from(hex, 'hex');
  if (key.length !== 32) throw new Error('STRINGEE_CRED_KEY must be a 32-byte (64-hex-char) value');
  return key;
}

export function encryptCredential(plaintext: string): string {
  const key = getCredKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}.${enc.toString('base64')}.${tag.toString('base64')}`;
}

export function decryptCredential(payload: string): string {
  const key = getCredKey();
  const [ivB64, encB64, tagB64] = payload.split('.');
  if (!ivB64 || !encB64 || !tagB64) throw new Error('Malformed encrypted credential');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  const dec = Buffer.concat([decipher.update(Buffer.from(encB64, 'base64')), decipher.final()]);
  return dec.toString('utf8');
}

// ── StringeeX agent session token exchange ─────────────────────────────

const STRINGEEX_API_BASE = process.env.STRINGEEX_API_BASE || 'https://api.stringeex.com';

export interface StringeeXAgentSession {
  authToken: string;
  accountId: string | null;
  raw: unknown;
}

export async function exchangeStringeeXAgentToken(
  email: string,
  password: string,
): Promise<StringeeXAgentSession> {
  const response = await fetch(`${STRINGEEX_API_BASE}/v1/account`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  const text = await response.text();
  let json: any;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`StringeeX returned non-JSON response (${response.status}): ${text.slice(0, 200)}`);
  }

  if (json.r !== 0) {
    throw new Error(`StringeeX login failed (r=${json.r}): ${json.msg || 'unknown'}`);
  }

  const portal = Array.isArray(json.portals) && json.portals.length ? json.portals[0] : null;
  const authToken: string | undefined = portal?.auth_token || json.auth_token;
  if (!authToken) {
    throw new Error('StringeeX login response did not include auth_token');
  }

  const accountId: string | null =
    portal?.account_id || portal?.user_id || json.account_id || json.id || null;

  return { authToken, accountId, raw: json };
}
