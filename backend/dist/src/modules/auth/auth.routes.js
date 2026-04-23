"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const zod_1 = require("zod");
const prisma_1 = require("../../lib/prisma");
const jwt_1 = require("../../lib/jwt");
const redis_1 = require("../../lib/redis");
const auth_1 = require("../../middleware/auth");
const errorHandler_1 = require("../../middleware/errorHandler");
const router = (0, express_1.Router)();
// ── Validation Schemas ────────────────────────────────────────────────
const loginSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
    password: zod_1.z.string().min(1),
});
const refreshSchema = zod_1.z.object({
    refreshToken: zod_1.z.string().min(1),
});
// ── POST /api/auth/login ──────────────────────────────────────────────
router.post('/login', async (req, res, next) => {
    try {
        const { email, password } = loginSchema.parse(req.body);
        const user = await prisma_1.prisma.user.findUnique({ where: { email } });
        if (!user || user.status === 'inactive') {
            throw new errorHandler_1.AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
        }
        const passwordValid = await bcryptjs_1.default.compare(password, user.passwordHash);
        if (!passwordValid) {
            throw new errorHandler_1.AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
        }
        // Auto-set status to active on login if they are not inactive
        if (user.status === 'offline') {
            await prisma_1.prisma.user.update({ where: { id: user.id }, data: { status: 'active' } });
            user.status = 'active';
        }
        const payload = { userId: user.id, role: user.role, email: user.email };
        const accessToken = (0, jwt_1.signAccessToken)(payload);
        const refreshToken = (0, jwt_1.signRefreshToken)(payload);
        // Store refresh token in Redis
        await (0, redis_1.storeRefreshToken)(user.id, refreshToken, (0, jwt_1.getRefreshTokenTtlSeconds)());
        res.json({
            success: true,
            data: {
                accessToken,
                refreshToken,
                user: {
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    role: user.role,
                    teamId: user.teamId,
                    status: user.status,
                },
            },
        });
    }
    catch (err) {
        next(err);
    }
});
// ── POST /api/auth/refresh ────────────────────────────────────────────
router.post('/refresh', async (req, res, next) => {
    try {
        const { refreshToken } = refreshSchema.parse(req.body);
        let payload;
        try {
            payload = (0, jwt_1.verifyRefreshToken)(refreshToken);
        }
        catch {
            throw new errorHandler_1.AppError(401, 'INVALID_TOKEN', 'Refresh token is invalid or expired');
        }
        const valid = await (0, redis_1.isRefreshTokenValid)(payload.userId, refreshToken);
        if (!valid) {
            throw new errorHandler_1.AppError(401, 'TOKEN_REVOKED', 'Refresh token has been revoked');
        }
        // Rotate tokens — revoke old, issue new
        await (0, redis_1.revokeRefreshToken)(payload.userId, refreshToken);
        const newPayload = { userId: payload.userId, role: payload.role, email: payload.email };
        const newAccessToken = (0, jwt_1.signAccessToken)(newPayload);
        const newRefreshToken = (0, jwt_1.signRefreshToken)(newPayload);
        await (0, redis_1.storeRefreshToken)(payload.userId, newRefreshToken, (0, jwt_1.getRefreshTokenTtlSeconds)());
        res.json({
            success: true,
            data: { accessToken: newAccessToken, refreshToken: newRefreshToken },
        });
    }
    catch (err) {
        next(err);
    }
});
// ── POST /api/auth/logout ─────────────────────────────────────────────
router.post('/logout', auth_1.authenticate, async (req, res, next) => {
    try {
        const { refreshToken } = refreshSchema.parse(req.body);
        if (req.user) {
            await (0, redis_1.revokeRefreshToken)(req.user.userId, refreshToken);
            const u = await prisma_1.prisma.user.findUnique({ where: { id: req.user.userId } });
            if (u) {
                if (u.status === 'on_break') {
                    const openBreak = await prisma_1.prisma.breakLog.findFirst({
                        where: { agentId: req.user.userId, endedAt: null },
                        orderBy: { startedAt: 'desc' }
                    });
                    if (openBreak) {
                        await prisma_1.prisma.breakLog.update({ where: { id: openBreak.id }, data: { endedAt: new Date() } });
                    }
                }
                await prisma_1.prisma.user.update({
                    where: { id: req.user.userId },
                    data: { status: 'offline', breakStartedAt: null }
                });
            }
        }
        res.json({ success: true, data: { message: 'Logged out successfully' } });
    }
    catch (err) {
        next(err);
    }
});
// ── GET /api/auth/me ──────────────────────────────────────────────────
router.get('/me', auth_1.authenticate, async (req, res, next) => {
    try {
        const user = await prisma_1.prisma.user.findUnique({
            where: { id: req.user.userId },
            select: {
                id: true,
                name: true,
                email: true,
                role: true,
                teamId: true,
                status: true,
                createdAt: true,
                team: { select: { id: true, name: true } },
            },
        });
        if (!user)
            throw new errorHandler_1.AppError(404, 'USER_NOT_FOUND', 'User not found');
        res.json({ success: true, data: user });
    }
    catch (err) {
        next(err);
    }
});
exports.default = router;
//# sourceMappingURL=auth.routes.js.map