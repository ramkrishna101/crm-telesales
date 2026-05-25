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
import { isSuperAdmin } from '../../lib/access';

const router = Router();

const loginSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(1).max(128),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

router.post('/login', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password } = loginSchema.parse(req.body);

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || (user.status === 'inactive' && !isSuperAdmin(user.role))) {
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
    }

    const passwordValid = await bcrypt.compare(password, user.passwordHash);
    if (!passwordValid) {
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
    }

    if (user.status === 'offline') {
      await prisma.user.update({ where: { id: user.id }, data: { status: 'active' } });
      user.status = 'active';
    }

    const payload = { userId: user.id, role: user.role, email: user.email, branchId: user.branchId };
    const accessToken = signAccessToken(payload);
    const refreshToken = signRefreshToken(payload);

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
          branchId: user.branchId,
          teamId: user.teamId,
          status: user.status,
        },
      },
    });
  } catch (err) {
    next(err);
  }
});

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

    await revokeRefreshToken(payload.userId, refreshToken);

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, email: true, role: true, branchId: true },
    });
    if (!user) {
      throw new AppError(401, 'INVALID_TOKEN', 'Refresh token user no longer exists');
    }

    const newPayload = { userId: user.id, role: user.role, email: user.email, branchId: user.branchId };
    const newAccessToken = signAccessToken(newPayload);
    const newRefreshToken = signRefreshToken(newPayload);
    await storeRefreshToken(payload.userId, newRefreshToken, getRefreshTokenTtlSeconds());

    res.json({
      success: true,
      data: { accessToken: newAccessToken, refreshToken: newRefreshToken },
    });
  } catch (err) {
    next(err);
  }
});

router.post('/logout', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { refreshToken } = refreshSchema.parse(req.body);
    if (req.user) {
      await revokeRefreshToken(req.user.userId, refreshToken);

      const user = await prisma.user.findUnique({ where: { id: req.user.userId } });
      if (user) {
        if (user.status === 'on_break') {
          const openBreak = await prisma.breakLog.findFirst({
            where: { agentId: req.user.userId, endedAt: null },
            orderBy: { startedAt: 'desc' },
          });
          if (openBreak) {
            await prisma.breakLog.update({ where: { id: openBreak.id }, data: { endedAt: new Date() } });
          }
        }

        await prisma.user.update({
          where: { id: req.user.userId },
          data: { status: 'offline', breakStartedAt: null },
        });
      }
    }

    res.json({ success: true, data: { message: 'Logged out successfully' } });
  } catch (err) {
    next(err);
  }
});

router.get('/me', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        branchId: true,
        teamId: true,
        status: true,
        createdAt: true,
        team: { select: { id: true, name: true } },
        branch: { select: { id: true, name: true, code: true } },
      },
    });
    if (!user) throw new AppError(404, 'USER_NOT_FOUND', 'User not found');
    res.json({ success: true, data: user });
  } catch (err) {
    next(err);
  }
});

export default router;
