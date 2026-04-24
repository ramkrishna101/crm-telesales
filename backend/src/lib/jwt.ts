import jwt from 'jsonwebtoken';
import { Role } from '@prisma/client';

export interface JwtPayload {
  userId: string;
  role: Role;
  email: string;
}

// ── Secret validation at startup ─────────────────────────────────────
// Fail fast: never silently fall back to a weak secret in production.
const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET;
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;

if (process.env.NODE_ENV === 'production') {
  if (!ACCESS_SECRET || ACCESS_SECRET.length < 32) {
    throw new Error('[SECURITY] JWT_ACCESS_SECRET must be set and at least 32 characters in production');
  }
  if (!REFRESH_SECRET || REFRESH_SECRET.length < 32) {
    throw new Error('[SECURITY] JWT_REFRESH_SECRET must be set and at least 32 characters in production');
  }
}

// Safe fallback for development only
const ACCESS_KEY = ACCESS_SECRET ?? 'dev_access_secret_change_in_prod__padding';
const REFRESH_KEY = REFRESH_SECRET ?? 'dev_refresh_secret_change_in_prod_padding';

const ACCESS_EXPIRES = process.env.JWT_ACCESS_EXPIRES_IN || '15m';
const REFRESH_EXPIRES = process.env.JWT_REFRESH_EXPIRES_IN || '7d';

// Pin algorithm to HS256 to prevent algorithm confusion attacks
const SIGN_OPTIONS: jwt.SignOptions = { algorithm: 'HS256' };
const VERIFY_OPTIONS: jwt.VerifyOptions = { algorithms: ['HS256'] };

export function signAccessToken(payload: JwtPayload): string {
  return jwt.sign(payload, ACCESS_KEY, { ...SIGN_OPTIONS, expiresIn: ACCESS_EXPIRES } as jwt.SignOptions);
}

export function signRefreshToken(payload: JwtPayload): string {
  return jwt.sign(payload, REFRESH_KEY, { ...SIGN_OPTIONS, expiresIn: REFRESH_EXPIRES } as jwt.SignOptions);
}

export function verifyAccessToken(token: string): JwtPayload {
  // algorithms: ['HS256'] prevents the 'none' algorithm and RS256→HS256 attacks
  return jwt.verify(token, ACCESS_KEY, VERIFY_OPTIONS) as JwtPayload;
}

export function verifyRefreshToken(token: string): JwtPayload {
  return jwt.verify(token, REFRESH_KEY, VERIFY_OPTIONS) as JwtPayload;
}

/** Returns the TTL of the refresh token in seconds (for Redis) */
export function getRefreshTokenTtlSeconds(): number {
  const val = REFRESH_EXPIRES;
  const match = val.match(/^(\d+)([smhd])$/);
  if (!match) return 604800;
  const n = parseInt(match[1]);
  const unit = match[2];
  const multipliers: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };
  return n * (multipliers[unit] || 86400);
}
