import Redis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

// Standard client for general use and BullMQ Queue
export const redis = new Redis(REDIS_URL, {
  maxRetriesPerRequest: null, // Required by BullMQ
  enableReadyCheck: false,
  retryStrategy(times) {
    return Math.min(times * 50, 2000);
  },
});

redis.on('connect', () => console.log('✅ Redis connected'));
redis.on('error', (err) => console.error('❌ Redis error:', err.message));

/** Store a refresh token with TTL in seconds */
export async function storeRefreshToken(userId: string, token: string, ttlSeconds: number) {
  await redis.setex(`refresh:${userId}:${token}`, ttlSeconds, '1');
}

/** Check if a refresh token is valid */
export async function isRefreshTokenValid(userId: string, token: string): Promise<boolean> {
  const result = await redis.get(`refresh:${userId}:${token}`);
  return result === '1';
}

/** Revoke a specific refresh token */
export async function revokeRefreshToken(userId: string, token: string) {
  await redis.del(`refresh:${userId}:${token}`);
}

/** Revoke ALL refresh tokens for a user */
export async function revokeAllRefreshTokens(userId: string) {
  const keys = await redis.keys(`refresh:${userId}:*`);
  if (keys.length > 0) await redis.del(...keys);
}
