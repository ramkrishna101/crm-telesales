// ── Core Test Runner ────────────────────────────────────────────────────
export const results = [];
let currentSuite = null;

export function suite(name) { currentSuite = name; }

export async function test(name, fn) {
  const start = Date.now();
  try {
    const result = await fn();
    results.push({ suite: currentSuite, name, status: 'PASS', duration: Date.now() - start, detail: result?.detail || '' });
  } catch (err) {
    results.push({ suite: currentSuite, name, status: err.severity || 'FAIL', duration: Date.now() - start, detail: err.message });
  }
}

// ── HTTP Helper ─────────────────────────────────────────────────────────
export async function req(method, path, body, headers = {}) {
  const BASE = process.env.API_URL || 'http://localhost:4000';
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, body: json };
}

// ── Assertion Helpers ───────────────────────────────────────────────────
export function expect(val) {
  return {
    toBe(expected) { if (val !== expected) throw Object.assign(new Error(`Expected ${expected}, got ${val}`), { severity: 'FAIL' }); },
    toEqual(expected) { if (JSON.stringify(val) !== JSON.stringify(expected)) throw Object.assign(new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(val)}`), { severity: 'FAIL' }); },
    toBeTrue() { if (val !== true) throw Object.assign(new Error(`Expected true, got ${val}`), { severity: 'FAIL' }); },
    toBeFalse() { if (val !== false) throw Object.assign(new Error(`Expected false, got ${val}`), { severity: 'FAIL' }); },
    toBeLessThan(n) { if (!(val < n)) throw Object.assign(new Error(`Expected < ${n}, got ${val}`), { severity: 'FAIL' }); },
    toContain(key) { if (!(key in val)) throw Object.assign(new Error(`Missing key: ${key}`), { severity: 'FAIL' }); },
    toBeSecure(msg) { throw Object.assign(new Error(msg || `Security issue: got ${val}`), { severity: 'SECURITY' }); },
  };
}

export function securityFail(msg) {
  throw Object.assign(new Error(msg), { severity: 'SECURITY' });
}

export function warnFail(msg) {
  throw Object.assign(new Error(msg), { severity: 'WARN' });
}
