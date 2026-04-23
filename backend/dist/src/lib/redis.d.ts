import Redis from 'ioredis';
export declare const redis: Redis;
/** Store a refresh token with TTL in seconds */
export declare function storeRefreshToken(userId: string, token: string, ttlSeconds: number): Promise<void>;
/** Check if a refresh token is valid */
export declare function isRefreshTokenValid(userId: string, token: string): Promise<boolean>;
/** Revoke a specific refresh token */
export declare function revokeRefreshToken(userId: string, token: string): Promise<void>;
/** Revoke ALL refresh tokens for a user */
export declare function revokeAllRefreshTokens(userId: string): Promise<void>;
//# sourceMappingURL=redis.d.ts.map