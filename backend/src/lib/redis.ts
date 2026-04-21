import Redis from 'ioredis';

export const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  retryStrategy(times) {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
});

redis.on('connect', () => console.log('✅ Redis connected'));
redis.on('error', (err) => console.error('❌ Redis error:', err.message));

/** Store a refresh token with TTL in seconds */
export async function storeRefreshToken(userId: string, token: string, ttlSeconds: number) {
  await redis.setex(`refresh:${userId}:${token}`, ttlSeconds, '1');
}

/** Check if a refresh token is valid (exists in Redis) */
export async function isRefreshTokenValid(userId: string, token: string): Promise<boolean> {
  const result = await redis.get(`refresh:${userId}:${token}`);
  return result === '1';
}

/** Revoke a specific refresh token */
export async function revokeRefreshToken(userId: string, token: string) {
  await redis.del(`refresh:${userId}:${token}`);
}

/** Revoke ALL refresh tokens for a user (force logout all sessions) */
export async function revokeAllRefreshTokens(userId: string) {
  const keys = await redis.keys(`refresh:${userId}:*`);
  if (keys.length > 0) await redis.del(...keys);
}
