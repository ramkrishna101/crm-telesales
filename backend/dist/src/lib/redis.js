"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.redis = void 0;
exports.storeRefreshToken = storeRefreshToken;
exports.isRefreshTokenValid = isRefreshTokenValid;
exports.revokeRefreshToken = revokeRefreshToken;
exports.revokeAllRefreshTokens = revokeAllRefreshTokens;
const ioredis_1 = __importDefault(require("ioredis"));
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
// Standard client for general use and BullMQ Queue
exports.redis = new ioredis_1.default(REDIS_URL, {
    maxRetriesPerRequest: null, // Required by BullMQ
    enableReadyCheck: false,
    retryStrategy(times) {
        return Math.min(times * 50, 2000);
    },
});
exports.redis.on('connect', () => console.log('✅ Redis connected'));
exports.redis.on('error', (err) => console.error('❌ Redis error:', err.message));
/** Store a refresh token with TTL in seconds */
async function storeRefreshToken(userId, token, ttlSeconds) {
    await exports.redis.setex(`refresh:${userId}:${token}`, ttlSeconds, '1');
}
/** Check if a refresh token is valid */
async function isRefreshTokenValid(userId, token) {
    const result = await exports.redis.get(`refresh:${userId}:${token}`);
    return result === '1';
}
/** Revoke a specific refresh token */
async function revokeRefreshToken(userId, token) {
    await exports.redis.del(`refresh:${userId}:${token}`);
}
/** Revoke ALL refresh tokens for a user */
async function revokeAllRefreshTokens(userId) {
    const keys = await exports.redis.keys(`refresh:${userId}:*`);
    if (keys.length > 0)
        await exports.redis.del(...keys);
}
//# sourceMappingURL=redis.js.map