import { suite, test, req, expect, securityFail, warnFail } from './runner.js';

let accessToken = null;
let refreshToken = null;

export async function runAuthTests() {
  suite('Auth — Login');

  await test('POST /api/auth/login — valid admin credentials', async () => {
    const { status, body } = await req('POST', '/api/auth/login', {
      email: 'admin@crm.com', password: 'admin@123',
    });
    if (status !== 200 || !body.success) throw new Error(`Login failed: ${JSON.stringify(body)}`);
    accessToken = body.data.accessToken;
    refreshToken = body.data.refreshToken;
    return { detail: `Role: ${body.data.user.role}` };
  });

  await test('POST /api/auth/login — wrong password returns 401', async () => {
    const { status, body } = await req('POST', '/api/auth/login', {
      email: 'admin@crm.com', password: 'wrongpassword',
    });
    expect(status).toBe(401);
    expect(body.success).toBeFalse();
  });

  await test('POST /api/auth/login — non-existent email returns 401', async () => {
    const { status, body } = await req('POST', '/api/auth/login', {
      email: 'ghost@nobody.com', password: 'password123',
    });
    expect(status).toBe(401);
    expect(body.success).toBeFalse();
  });

  await test('[SECURITY] Login error — same message for bad email vs bad password (no enumeration)', async () => {
    const r1 = await req('POST', '/api/auth/login', { email: 'ghost@nobody.com', password: 'x' });
    const r2 = await req('POST', '/api/auth/login', { email: 'admin@crm.com', password: 'x' });
    const msg1 = r1.body?.error?.message;
    const msg2 = r2.body?.error?.message;
    if (msg1 !== msg2) securityFail(`User enumeration possible! Bad-email: "${msg1}" vs bad-password: "${msg2}"`);
  });

  await test('POST /api/auth/login — missing fields returns 400 (Zod validation)', async () => {
    const { status } = await req('POST', '/api/auth/login', {});
    expect(status).toBe(400);
  });

  await test('POST /api/auth/login — invalid email format returns 400', async () => {
    const { status } = await req('POST', '/api/auth/login', { email: 'not-an-email', password: 'pass' });
    expect(status).toBe(400);
  });

  suite('Auth — Token & Session');

  await test('GET /api/auth/me — valid access token works', async () => {
    if (!accessToken) throw new Error('No access token from login test');
    const { status, body } = await req('GET', '/api/auth/me', null, {
      Authorization: `Bearer ${accessToken}`,
    });
    expect(status).toBe(200);
    expect(body.success).toBeTrue();
    return { detail: `User: ${body.data.email}` };
  });

  await test('GET /api/auth/me — no token returns 401', async () => {
    const { status } = await req('GET', '/api/auth/me', null);
    expect(status).toBe(401);
  });

  await test('[SECURITY] GET /api/auth/me — malformed Bearer token returns 401', async () => {
    const { status } = await req('GET', '/api/auth/me', null, { Authorization: 'Bearer invalidtoken.abc.xyz' });
    if (status !== 401) securityFail(`Malformed token accepted! Got status ${status}`);
  });

  await test('[SECURITY] GET /api/auth/me — expired/tampered JWT rejected', async () => {
    const fakeJwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiIxMjMiLCJyb2xlIjoiYWRtaW4iLCJlbWFpbCI6ImhhY2tlckBoYWNrLmNvbSIsImlhdCI6MX0.fakesignature';
    const { status } = await req('GET', '/api/auth/me', null, { Authorization: `Bearer ${fakeJwt}` });
    if (status !== 401) securityFail(`Tampered JWT was accepted! Got status ${status}`);
  });

  await test('POST /api/auth/refresh — valid refresh token rotates tokens', async () => {
    if (!refreshToken) throw new Error('No refresh token from login test');
    const { status, body } = await req('POST', '/api/auth/refresh', { refreshToken });
    expect(status).toBe(200);
    expect(body.success).toBeTrue();
    if (body.data?.refreshToken) refreshToken = body.data.refreshToken;
    return { detail: 'Token rotated successfully' };
  });

  await test('[SECURITY] POST /api/auth/refresh — reusing revoked token returns 401', async () => {
    // Get a fresh pair, then logout to revoke
    const loginRes = await req('POST', '/api/auth/login', { email: 'admin@crm.com', password: 'admin@123' });
    const rt = loginRes.body?.data?.refreshToken;
    const at = loginRes.body?.data?.accessToken;
    if (!rt) throw new Error('Could not get token for refresh replay test');
    // Logout to revoke
    await req('POST', '/api/auth/logout', { refreshToken: rt }, { Authorization: `Bearer ${at}` });
    // Try reusing revoked token
    const { status } = await req('POST', '/api/auth/refresh', { refreshToken: rt });
    if (status !== 401) securityFail(`Revoked refresh token was accepted! Status: ${status}`);
  });

  await test('POST /api/auth/refresh — invalid token returns 401', async () => {
    const { status } = await req('POST', '/api/auth/refresh', { refreshToken: 'invalid.token.here' });
    expect(status).toBe(401);
  });

  suite('Auth — Logout');

  await test('POST /api/auth/logout — authenticated user can logout', async () => {
    // Re-login to get fresh tokens for logout test
    const loginRes = await req('POST', '/api/auth/login', { email: 'admin@crm.com', password: 'admin@123' });
    const at = loginRes.body?.data?.accessToken;
    const rt = loginRes.body?.data?.refreshToken;
    const { status, body } = await req('POST', '/api/auth/logout', { refreshToken: rt }, {
      Authorization: `Bearer ${at}`,
    });
    expect(status).toBe(200);
    expect(body.success).toBeTrue();
  });

  await test('POST /api/auth/logout — unauthenticated request returns 401', async () => {
    const { status } = await req('POST', '/api/auth/logout', { refreshToken: 'any' });
    expect(status).toBe(401);
  });
}
