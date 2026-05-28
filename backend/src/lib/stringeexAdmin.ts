/**
 * StringeeX tenant admin client.
 *
 * Logs into the tenant's admin portal once with credentials from env
 * (STRINGEEX_ADMIN_EMAIL / STRINGEEX_ADMIN_PASSWORD / STRINGEEX_TENANT),
 * caches the resulting auth_token in Redis, and exposes a helper to look
 * up an agent's `account_id` by email so the CRM can auto-populate
 * `User.stringeeAccountId` (mirroring how Zoho stores it automatically).
 */
import { redis } from './redis';

interface StringeeXAgent {
  id?: string;                 // stringee account_id (e.g. ACLA9XZPD2)
  stringee_user_id?: string;   // duplicate of id
  agent_id?: string;           // tenant agent id (e.g. AGSHJJJQ)
  email?: string;
  name?: string;
  [k: string]: unknown;
}

interface StringeeXNumber {
  number?: string;
  nickname?: string;
  allow_outbound_calls?: number | boolean;
  [k: string]: unknown;
}

const TOKEN_CACHE_KEY = 'stringeex:adminAuthToken';
const TOKEN_TTL_SECONDS = 23 * 3600; // refresh daily
const AGENTS_CACHE_KEY = 'stringeex:agentList';
const AGENTS_TTL_SECONDS = 5 * 60;   // 5 min
const NUMBERS_CACHE_KEY = 'stringeex:numberList';
const NUMBERS_TTL_SECONDS = 5 * 60;  // 5 min

function getTenant(): string {
  const t = process.env.STRINGEEX_TENANT;
  if (!t) throw new Error('STRINGEEX_TENANT not configured');
  return t;
}

function getTenantBaseUrl(): string {
  return `https://${getTenant()}.stringeex.com`;
}

async function loginAndCacheToken(): Promise<string> {
  const email = process.env.STRINGEEX_ADMIN_EMAIL;
  const password = process.env.STRINGEEX_ADMIN_PASSWORD;
  if (!email || !password) {
    throw new Error('STRINGEEX_ADMIN_EMAIL / STRINGEEX_ADMIN_PASSWORD not configured');
  }

  const res = await fetch(`${getTenantBaseUrl()}/v1/account`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      password,
      domain: getTenant(),
      captcha: null,
      code2Fa: '',
      device_id: 'crm-server',
      access_token: '',
    }),
  });

  const text = await res.text();
  let json: any;
  try { json = text ? JSON.parse(text) : {}; }
  catch { throw new Error(`StringeeX admin login: non-JSON (${res.status})`); }

  if (json.r !== 0) {
    throw new Error(`StringeeX admin login failed (r=${json.r}): ${json.msg || 'unknown'}`);
  }

  const portal = Array.isArray(json.portals) && json.portals.length ? json.portals[0] : null;
  const token: string | undefined = portal?.auth_token || json.auth_token;
  if (!token) throw new Error('StringeeX admin login did not return auth_token');

  await redis.setex(TOKEN_CACHE_KEY, TOKEN_TTL_SECONDS, token);
  return token;
}

async function getAdminToken(force = false): Promise<string> {
  if (!force) {
    const cached = await redis.get(TOKEN_CACHE_KEY);
    if (cached) return cached;
  }
  return loginAndCacheToken();
}

/**
 * Fetch all agents from the tenant. Cached briefly in Redis.
 * Retries once with a fresh login if the token expired.
 */
export async function listStringeeXAgents(useCache = true): Promise<StringeeXAgent[]> {
  if (useCache) {
    const cached = await redis.get(AGENTS_CACHE_KEY);
    if (cached) {
      try { return JSON.parse(cached) as StringeeXAgent[]; }
      catch { await redis.del(AGENTS_CACHE_KEY); }
    }
  }

  const fetchOnce = async (token: string) => {
    const url = `${getTenantBaseUrl()}/v1/agent/list?status=active&limit=500&offset=0`;
    return fetch(url, { headers: { 'X-STRINGEE-AUTH': token, Accept: 'application/json' } });
  };

  let token = await getAdminToken();
  let res = await fetchOnce(token);
  if (res.status === 401 || res.status === 403) {
    token = await getAdminToken(true);
    res = await fetchOnce(token);
  }

  const text = await res.text();
  let json: any;
  try { json = text ? JSON.parse(text) : {}; }
  catch { throw new Error(`StringeeX agent list: non-JSON (${res.status})`); }

  if (json.r !== 0 && json.r !== undefined) {
    throw new Error(`StringeeX agent list failed (r=${json.r}): ${json.message || json.msg || 'unknown'}`);
  }

  const agents: StringeeXAgent[] =
    json?.data?.accounts ||
    json?.data?.agents ||
    json?.accounts ||
    json?.agents ||
    [];
  await redis.setex(AGENTS_CACHE_KEY, AGENTS_TTL_SECONDS, JSON.stringify(agents));
  return agents;
}

export async function resolveStringeeAccountIdByEmail(email: string): Promise<string | null> {
  const target = email.trim().toLowerCase();
  if (!target) return null;

  const pickAccountId = (a: StringeeXAgent): string | null =>
    (a.id && /^AC/.test(a.id) ? a.id : null) ||
    (a.stringee_user_id && /^AC/.test(a.stringee_user_id) ? a.stringee_user_id : null);

  let agents = await listStringeeXAgents(true);
  let hit = agents.find((a) => (a.email || '').toLowerCase() === target);
  if (hit) {
    const ac = pickAccountId(hit);
    if (ac) return ac;
  }

  // Cache miss — refetch (skip cache) in case agent was just provisioned.
  agents = await listStringeeXAgents(false);
  hit = agents.find((a) => (a.email || '').toLowerCase() === target);
  return hit ? pickAccountId(hit) : null;
}

function normalisePhoneNumber(raw: string): string {
  let value = (raw || '').trim();
  if (!value) return '';
  if (value.startsWith('+')) value = value.slice(1);
  if (value.startsWith('00')) value = value.slice(2);
  return value.replace(/\D/g, '');
}

function extractNumbers(json: any): string[] {
  const numbers: StringeeXNumber[] =
    json?.data?.numbers ||
    json?.numbers ||
    [];

  return numbers
    .filter((entry) => entry.allow_outbound_calls !== 0 && entry.allow_outbound_calls !== false)
    .map((entry) => normalisePhoneNumber(entry.number || entry.nickname || ''))
    .filter(Boolean);
}

export async function listStringeeXNumbers(useCache = true): Promise<string[]> {
  if (useCache) {
    const cached = await redis.get(NUMBERS_CACHE_KEY);
    if (cached) {
      try { return JSON.parse(cached) as string[]; }
      catch { await redis.del(NUMBERS_CACHE_KEY); }
    }
  }

  const fetchOnce = async (token: string) => {
    const url = `${getTenantBaseUrl()}/v1/number/list?limit=200&offset=0`;
    return fetch(url, { headers: { 'X-STRINGEE-AUTH': token, Accept: 'application/json' } });
  };

  let token = await getAdminToken();
  let res = await fetchOnce(token);
  if (res.status === 401 || res.status === 403) {
    token = await getAdminToken(true);
    res = await fetchOnce(token);
  }

  const text = await res.text();
  let json: any;
  try { json = text ? JSON.parse(text) : {}; }
  catch { throw new Error(`StringeeX number list: non-JSON (${res.status})`); }

  if (json.r !== 0 && json.r !== undefined) {
    throw new Error(`StringeeX number list failed (r=${json.r}): ${json.message || json.msg || 'unknown'}`);
  }

  const numbers = extractNumbers(json);
  await redis.setex(NUMBERS_CACHE_KEY, NUMBERS_TTL_SECONDS, JSON.stringify(numbers));
  return numbers;
}

export function isStringeeXAdminConfigured(): boolean {
  return Boolean(
    process.env.STRINGEEX_TENANT &&
    process.env.STRINGEEX_ADMIN_EMAIL &&
    process.env.STRINGEEX_ADMIN_PASSWORD,
  );
}

// Regional REST endpoint (Zoho widget hits this — `<region>-api.stringeex.com`).
// Defaults to asia-2 since the apextechnologies tenant lives in that DC.
const STRINGEEX_API_BASE =
  process.env.STRINGEEX_API_BASE || 'https://asia-2-api.stringeex.com';

/**
 * Calls a PCC endpoint via the StringeeX `/v1/pccconfig` proxy. The proxy
 * forwards using the tenant's auth context so we don't need a project key.
 *
 * Example: pccProxy('v1/call/callout', 'POST', { agentUserId, ... })
 */
export async function pccProxy(
  uri: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  body: Record<string, unknown>,
): Promise<any> {
  const callOnce = async (token: string) => {
    return fetch(`${STRINGEEX_API_BASE}/v1/pccconfig`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-STRINGEE-AUTH': token,
      },
      body: JSON.stringify({ uri, method, body }),
    });
  };

  let token = await getAdminToken();
  let res = await callOnce(token);
  if (res.status === 401 || res.status === 403) {
    token = await getAdminToken(true);
    res = await callOnce(token);
  }
  const text = await res.text();
  let json: any;
  try { json = text ? JSON.parse(text) : {}; }
  catch { throw new Error(`pccProxy ${uri}: non-JSON response (${res.status}) ${text.slice(0, 200)}`); }

  if (!res.ok) {
    throw new Error(`pccProxy ${uri} HTTP ${res.status}: ${json?.message || text.slice(0, 200)}`);
  }
  return json;
}
