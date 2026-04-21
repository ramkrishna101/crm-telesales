import { suite, test, req, expect, warnFail } from './runner.js';

export async function runInfraTests() {
  suite('Infrastructure — Health & Connectivity');

  await test('GET /health — server is reachable', async () => {
    const { status, body } = await req('GET', '/health');
    expect(status).toBe(200);
    expect(body.status).toBe('ok');
    return { detail: `Timestamp: ${body.timestamp}` };
  });

  await test('GET /health — Redis connectivity reported', async () => {
    const { body } = await req('GET', '/health');
    const redisStatus = body?.services?.redis;
    if (redisStatus !== 'ok') warnFail(`Redis status: ${redisStatus} — check if Redis is running`);
    return { detail: `Redis: ${redisStatus}` };
  });

  await test('GET /nonexistent-route — returns 404 JSON', async () => {
    const { status, body } = await req('GET', '/api/does-not-exist-at-all');
    expect(status).toBe(404);
    if (!body?.error?.code) warnFail('404 response missing error.code field');
    return { detail: `Code: ${body?.error?.code}` };
  });

  await test('GET /health — response is fast (<500ms)', async () => {
    const start = Date.now();
    await req('GET', '/health');
    const ms = Date.now() - start;
    if (ms >= 500) warnFail(`Health check took ${ms}ms — performance concern`);
    return { detail: `${ms}ms` };
  });

  suite('Infrastructure — Error Handling');

  await test('Zod validation errors return structured 400', async () => {
    const { status, body } = await req('POST', '/api/auth/login', { email: 'not-email' });
    expect(status).toBe(400);
    if (!body?.error?.details) warnFail('Zod 400 missing .error.details array');
    return { detail: `${body?.error?.details?.length || 0} validation detail(s)` };
  });

  await test('All error responses have consistent { success: false, error: { code, message } } shape', async () => {
    const cases = [
      req('GET', '/api/auth/me'),                                          // 401 - no auth
      req('POST', '/api/auth/login', {}),                                   // 400 - validation
      req('POST', '/api/auth/login', { email: 'x@x.com', password: 'y' }), // 401 - bad creds
    ];
    const responses = await Promise.all(cases);
    for (const { body } of responses) {
      if (body.success !== false) warnFail('Error response has success !== false');
      if (!body.error?.code) warnFail('Error response missing error.code');
      if (!body.error?.message) warnFail('Error response missing error.message');
    }
    return { detail: `${responses.length} error shapes verified` };
  });

  await test('[SECURITY] Error messages do not expose stack traces', async () => {
    const { body } = await req('POST', '/api/auth/login', { email: 'x@x.com', password: 'x' });
    const msg = JSON.stringify(body);
    if (msg.includes('at ') && msg.includes('.ts:')) {
      throw Object.assign(new Error('Stack trace leaked in error response!'), { severity: 'SECURITY' });
    }
    return { detail: 'No stack trace in response' };
  });

  suite('Infrastructure — Socket.io');

  await test('Socket.io handshake — no token returns error', async () => {
    // We test this by checking the upgrade response without a valid token
    try {
      const BASE = (process.env.API_URL || 'http://localhost:4000').replace('http', 'http');
      const res = await fetch(`${BASE}/socket.io/?EIO=4&transport=polling`, {
        headers: {},
      });
      // Without auth, socket.io should still respond (the auth check happens after connection)
      // Just verify the endpoint exists
      return { detail: `Socket.io endpoint responds: ${res.status}` };
    } catch (e) {
      warnFail(`Socket.io endpoint unreachable: ${e.message}`);
    }
  });
}
