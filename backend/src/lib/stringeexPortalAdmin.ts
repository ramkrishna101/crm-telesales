import { redis } from './redis';

export interface StringeeXPortalAdminConfig {
  portalConfigId: string;
  tenant: string;
  adminEmail: string;
  adminPassword: string;
}

interface StringeeXAgent {
  id?: string;
  stringee_user_id?: string;
  email?: string;
  [k: string]: unknown;
}

interface StringeeXNumber {
  number?: string;
  nickname?: string;
  allow_outbound_calls?: number | boolean;
  [k: string]: unknown;
}

const TOKEN_TTL_SECONDS = 23 * 3600;
const AGENTS_TTL_SECONDS = 5 * 60;
const NUMBERS_TTL_SECONDS = 5 * 60;
const STRINGEEX_API_BASE = process.env.STRINGEEX_API_BASE || 'https://asia-2-api.stringeex.com';

function tokenCacheKey(portalConfigId: string) {
  return `stringeex:portal:${portalConfigId}:adminAuthToken`;
}

function agentsCacheKey(portalConfigId: string) {
  return `stringeex:portal:${portalConfigId}:agentList`;
}

function numbersCacheKey(portalConfigId: string) {
  return `stringeex:portal:${portalConfigId}:numberList`;
}

function getTenantBaseUrl(config: StringeeXPortalAdminConfig): string {
  return `https://${config.tenant}.stringeex.com`;
}

export function hasStringeeXPortalAdminConfig(config: Partial<StringeeXPortalAdminConfig> | null | undefined): config is StringeeXPortalAdminConfig {
  return Boolean(config?.portalConfigId && config.tenant && config.adminEmail && config.adminPassword);
}

async function loginAndCacheToken(config: StringeeXPortalAdminConfig): Promise<string> {
  const res = await fetch(`${getTenantBaseUrl(config)}/v1/account`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: config.adminEmail,
      password: config.adminPassword,
      domain: config.tenant,
      captcha: null,
      code2Fa: '',
      device_id: `crm-server-${config.portalConfigId}`,
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

  await redis.setex(tokenCacheKey(config.portalConfigId), TOKEN_TTL_SECONDS, token);
  return token;
}

async function getAdminToken(config: StringeeXPortalAdminConfig, force = false): Promise<string> {
  if (!force) {
    const cached = await redis.get(tokenCacheKey(config.portalConfigId));
    if (cached) return cached;
  }
  return loginAndCacheToken(config);
}

export async function listStringeeXAgentsForPortal(config: StringeeXPortalAdminConfig, useCache = true): Promise<StringeeXAgent[]> {
  const cacheKey = agentsCacheKey(config.portalConfigId);
  if (useCache) {
    const cached = await redis.get(cacheKey);
    if (cached) {
      try { return JSON.parse(cached) as StringeeXAgent[]; }
      catch { await redis.del(cacheKey); }
    }
  }

  const fetchOnce = async (token: string) => fetch(
    `${getTenantBaseUrl(config)}/v1/agent/list?status=active&limit=500&offset=0`,
    { headers: { 'X-STRINGEE-AUTH': token, Accept: 'application/json' } },
  );

  let token = await getAdminToken(config);
  let res = await fetchOnce(token);
  if (res.status === 401 || res.status === 403) {
    token = await getAdminToken(config, true);
    res = await fetchOnce(token);
  }

  const text = await res.text();
  let json: any;
  try { json = text ? JSON.parse(text) : {}; }
  catch { throw new Error(`StringeeX agent list: non-JSON (${res.status})`); }

  if (json.r !== 0 && json.r !== undefined) {
    throw new Error(`StringeeX agent list failed (r=${json.r}): ${json.message || json.msg || 'unknown'}`);
  }

  const agents: StringeeXAgent[] = json?.data?.accounts || json?.data?.agents || json?.accounts || json?.agents || [];
  await redis.setex(cacheKey, AGENTS_TTL_SECONDS, JSON.stringify(agents));
  return agents;
}

export async function resolveStringeeAccountIdByEmailForPortal(email: string, config: StringeeXPortalAdminConfig): Promise<string | null> {
  const target = email.trim().toLowerCase();
  if (!target) return null;

  const pickAccountId = (agent: StringeeXAgent): string | null =>
    (agent.id && /^AC/.test(agent.id) ? agent.id : null) ||
    (agent.stringee_user_id && /^AC/.test(agent.stringee_user_id) ? agent.stringee_user_id : null);

  let agents = await listStringeeXAgentsForPortal(config, true);
  let hit = agents.find((agent) => (agent.email || '').toLowerCase() === target);
  if (hit) {
    const accountId = pickAccountId(hit);
    if (accountId) return accountId;
  }

  agents = await listStringeeXAgentsForPortal(config, false);
  hit = agents.find((agent) => (agent.email || '').toLowerCase() === target);
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
  const numbers: StringeeXNumber[] = json?.data?.numbers || json?.numbers || [];
  return numbers
    .filter((entry) => entry.allow_outbound_calls !== 0 && entry.allow_outbound_calls !== false)
    .map((entry) => normalisePhoneNumber(entry.number || entry.nickname || ''))
    .filter(Boolean);
}

export async function listStringeeXNumbersForPortal(config: StringeeXPortalAdminConfig, useCache = true): Promise<string[]> {
  const cacheKey = numbersCacheKey(config.portalConfigId);
  if (useCache) {
    const cached = await redis.get(cacheKey);
    if (cached) {
      try { return JSON.parse(cached) as string[]; }
      catch { await redis.del(cacheKey); }
    }
  }

  const fetchOnce = async (token: string) => fetch(
    `${getTenantBaseUrl(config)}/v1/number/list?limit=200&offset=0`,
    { headers: { 'X-STRINGEE-AUTH': token, Accept: 'application/json' } },
  );

  let token = await getAdminToken(config);
  let res = await fetchOnce(token);
  if (res.status === 401 || res.status === 403) {
    token = await getAdminToken(config, true);
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
  await redis.setex(cacheKey, NUMBERS_TTL_SECONDS, JSON.stringify(numbers));
  return numbers;
}

export async function pccProxyForPortal(
  config: StringeeXPortalAdminConfig,
  uri: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  body: Record<string, unknown>,
): Promise<any> {
  const callOnce = async (token: string) => fetch(`${STRINGEEX_API_BASE}/v1/pccconfig`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-STRINGEE-AUTH': token,
    },
    body: JSON.stringify({ uri, method, body }),
  });

  let token = await getAdminToken(config);
  let res = await callOnce(token);
  if (res.status === 401 || res.status === 403) {
    token = await getAdminToken(config, true);
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
