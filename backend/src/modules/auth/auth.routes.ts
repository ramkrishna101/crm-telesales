import { Router, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  getRefreshTokenTtlSeconds,
} from '../../lib/jwt';
import {
  storeRefreshToken,
  isRefreshTokenValid,
  revokeRefreshToken,
} from '../../lib/redis';
import { authenticate } from '../../middleware/auth';
import { AppError } from '../../middleware/errorHandler';

const router = Router();

// ── Validation Schemas ────────────────────────────────────────────────

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

// ── POST /api/auth/login ──────────────────────────────────────────────

router.post('/login', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password } = loginSchema.parse(req.body);

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || user.status === 'inactive') {
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
    }

    const passwordValid = await bcrypt.compare(password, user.passwordHash);
    if (!passwordValid) {
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
    }

    const payload = { userId: user.id, role: user.role, email: user.email };
    const accessToken = signAccessToken(payload);
    const refreshToken = signRefreshToken(payload);

    // Store refresh token in Redis
    await storeRefreshToken(user.id, refreshToken, getRefreshTokenTtlSeconds());

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
        },
      },
    });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/auth/refresh ────────────────────────────────────────────

router.post('/refresh', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { refreshToken } = refreshSchema.parse(req.body);

    let payload;
    try {
      payload = verifyRefreshToken(refreshToken);
    } catch {
      throw new AppError(401, 'INVALID_TOKEN', 'Refresh token is invalid or expired');
    }

    const valid = await isRefreshTokenValid(payload.userId, refreshToken);
    if (!valid) {
      throw new AppError(401, 'TOKEN_REVOKED', 'Refresh token has been revoked');
    }

    // Rotate tokens — revoke old, issue new
    await revokeRefreshToken(payload.userId, refreshToken);

    const newAccessToken = signAccessToken(payload);
    const newRefreshToken = signRefreshToken(payload);
    await storeRefreshToken(payload.userId, newRefreshToken, getRefreshTokenTtlSeconds());

    res.json({
      success: true,
      data: { accessToken: newAccessToken, refreshToken: newRefreshToken },
    });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/auth/logout ─────────────────────────────────────────────

router.post('/logout', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { refreshToken } = refreshSchema.parse(req.body);
    if (req.user) {
      await revokeRefreshToken(req.user.userId, refreshToken);
    }
    res.json({ success: true, data: { message: 'Logged out successfully' } });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/auth/me ──────────────────────────────────────────────────

router.get('/me', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
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
    if (!user) throw new AppError(404, 'USER_NOT_FOUND', 'User not found');
    res.json({ success: true, data: user });
  } catch (err) {
    next(err);
  }
});

export default router;
