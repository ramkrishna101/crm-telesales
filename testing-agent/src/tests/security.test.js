import { suite, test, req, expect, securityFail, warnFail } from './runner.js';

async function getToken(email, password) {
  const res = await req('POST', '/api/auth/login', { email, password });
  return res.body?.data?.accessToken || null;
}

export async function runSecurityTests() {
  suite('Security — Rate Limiting');

  await test('[SECURITY] Auth endpoint rate-limited after 20 rapid requests', async () => {
    const promises = Array.from({ length: 25 }, () =>
      req('POST', '/api/auth/login', { email: 'x@x.com', password: 'x' })
    );
    const responses = await Promise.all(promises);
    const rateLimited = responses.some(r => r.status === 429);
    if (!rateLimited) warnFail('Rate limiting did not trigger after 25 rapid requests — brute force risk');
    return { detail: `${responses.filter(r => r.status === 429).length}/25 requests were rate-limited` };
  });

  suite('Security — HTTP Headers');

  await test('[SECURITY] Helmet security headers present on all responses', async () => {
    const res = await fetch((process.env.API_URL || 'http://localhost:4000') + '/health');
    const missing = [];
    if (!res.headers.get('x-content-type-options')) missing.push('X-Content-Type-Options');
    if (!res.headers.get('x-frame-options') && !res.headers.get('content-security-policy')) missing.push('X-Frame-Options or CSP');
    if (!res.headers.get('x-xss-protection') && !res.headers.get('content-security-policy')) missing.push('XSS protection header');
    if (missing.length > 0) warnFail(`Missing security headers: ${missing.join(', ')}`);
    return { detail: 'Helmet headers verified' };
  });

  await test('[SECURITY] Server does not leak technology stack in headers', async () => {
    const res = await fetch((process.env.API_URL || 'http://localhost:4000') + '/health');
    const xPoweredBy = res.headers.get('x-powered-by');
    if (xPoweredBy) securityFail(`Server leaks "X-Powered-By: ${xPoweredBy}"`);
    return { detail: 'No X-Powered-By header' };
  });

  suite('Security — Authorization & Role Isolation');

  await test('[SECURITY] Unauthenticated access to protected routes returns 401', async () => {
    const routes = ['/api/auth/me'];
    for (const route of routes) {
      const { status } = await req('GET', route);
      if (status !== 401) securityFail(`Route ${route} accessible without auth! Got ${status}`);
    }
    return { detail: `${routes.length} protected routes checked` };
  });

  await test('[SECURITY] JWT "none" algorithm attack rejected', async () => {
    // Craft a token with alg:none
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({ userId: 'fake', role: 'admin', email: 'hacker@hack.com', iat: 1 })).toString('base64url');
    const noneToken = `${header}.${payload}.`;
    const { status } = await req('GET', '/api/auth/me', null, { Authorization: `Bearer ${noneToken}` });
    if (status !== 401) securityFail(`JWT "none" algorithm attack succeeded! Status: ${status}`);
    return { detail: 'alg:none correctly rejected' };
  });

  await test('[SECURITY] SQL injection in login email rejected safely', async () => {
    const { status } = await req('POST', '/api/auth/login', {
      email: "admin@crm.com' OR '1'='1",
      password: "anything",
    });
    // Should be 400 (Zod fails invalid email) or 401 (query found no match)
    if (status === 200) securityFail('SQL injection in email returned 200 — possible SQL injection vulnerability!');
    return { detail: `Got ${status} (safe)` };
  });

  await test('[SECURITY] NoSQL/prototype injection in login body rejected', async () => {
    const { status } = await req('POST', '/api/auth/login', {
      email: { $gt: '' },
      password: { $gt: '' },
    });
    if (status === 200) securityFail('Object injection in body returned 200 — possible security vulnerability!');
    return { detail: `Got ${status} (safe)` };
  });

  suite('Security — CORS & Transport');

  await test('[SECURITY] CORS rejects requests from unknown origins', async () => {
    const BASE = process.env.API_URL || 'http://localhost:4000';
    const res = await fetch(`${BASE}/health`, {
      headers: { Origin: 'http://evil.attacker.com' },
    });
    const acao = res.headers.get('access-control-allow-origin');
    if (acao === '*') securityFail('CORS allows all origins (wildcard *) — CSRF risk!');
    return { detail: `ACAO: ${acao || 'not sent (correct)'}` };
  });

  suite('Security — Input Validation');

  await test('Oversized request body rejected (>10mb limit)', async () => {
    const bigPayload = { email: 'a@b.com', password: 'x'.repeat(11 * 1024 * 1024) };
    try {
      const res = await fetch((process.env.API_URL || 'http://localhost:4000') + '/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bigPayload),
      });
      if (res.status === 200) warnFail('Oversized body accepted — may indicate missing body-size limit');
      return { detail: `Got ${res.status}` };
    } catch {
      return { detail: 'Request rejected at transport level (safe)' };
    }
  });

  await test('[SECURITY] Empty string fields treated as invalid, not bypassed', async () => {
    const { status } = await req('POST', '/api/auth/login', { email: '', password: '' });
    if (status === 200) securityFail('Empty credentials returned 200!');
    return { detail: `Got ${status}` };
  });
}
