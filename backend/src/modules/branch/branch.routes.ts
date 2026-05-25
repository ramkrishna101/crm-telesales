import { Router, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { authenticate, requireRole } from '../../middleware/auth';
import { AppError } from '../../middleware/errorHandler';
import { param } from '../../lib/params';

const router = Router();
router.use(authenticate);
router.use(requireRole('super_admin'));

const createBranchSchema = z.object({
  name: z.string().min(2).max(120),
  code: z.string().min(2).max(50).regex(/^[a-z0-9-]+$/),
  admin: z.object({
    name: z.string().min(2).max(100),
    email: z.string().email().max(255),
    password: z.string().min(8).max(128),
  }).optional(),
});

const updateBranchSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  code: z.string().min(2).max(50).regex(/^[a-z0-9-]+$/).optional(),
  status: z.enum(['active', 'inactive']).optional(),
});

router.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const branches = await prisma.branch.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        branchAdmin: {
          select: { id: true, name: true, email: true, status: true },
        },
        _count: {
          select: { users: true, teams: true, campaigns: true, leads: true },
        },
      },
    });

    res.json({ success: true, data: branches });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = param(req, 'id');
    const branch = await prisma.branch.findUnique({
      where: { id },
      include: {
        branchAdmin: {
          select: { id: true, name: true, email: true, status: true, createdAt: true },
        },
        _count: {
          select: { users: true, teams: true, campaigns: true, leads: true },
        },
      },
    });

    if (!branch) throw new AppError(404, 'BRANCH_NOT_FOUND', 'Branch not found');
    res.json({ success: true, data: branch });
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = createBranchSchema.parse(req.body);

    const existingBranch = await prisma.branch.findUnique({ where: { code: body.code } });
    if (existingBranch) {
      throw new AppError(409, 'BRANCH_EXISTS', 'A branch with this code already exists');
    }

    if (body.admin) {
      const existingUser = await prisma.user.findUnique({ where: { email: body.admin.email } });
      if (existingUser) {
        throw new AppError(409, 'EMAIL_TAKEN', 'Branch admin email is already registered');
      }
    }

    const branch = await prisma.$transaction(async (tx) => {
      const createdBranch = await tx.branch.create({
        data: {
          name: body.name,
          code: body.code,
        },
      });

      if (!body.admin) {
        return tx.branch.findUniqueOrThrow({
          where: { id: createdBranch.id },
          include: {
            branchAdmin: { select: { id: true, name: true, email: true, status: true } },
            _count: { select: { users: true, teams: true, campaigns: true, leads: true } },
          },
        });
      }

      const passwordHash = await bcrypt.hash(body.admin.password, 12);
      const branchAdmin = await tx.user.create({
        data: {
          name: body.admin.name,
          email: body.admin.email,
          passwordHash,
          role: 'branch_admin',
          branchId: createdBranch.id,
          status: 'offline',
        },
      });

      await tx.branch.update({
        where: { id: createdBranch.id },
        data: { branchAdminId: branchAdmin.id },
      });

      return tx.branch.findUniqueOrThrow({
        where: { id: createdBranch.id },
        include: {
          branchAdmin: { select: { id: true, name: true, email: true, status: true } },
          _count: { select: { users: true, teams: true, campaigns: true, leads: true } },
        },
      });
    });

    res.status(201).json({ success: true, data: branch });
  } catch (err) {
    next(err);
  }
});

router.put('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = param(req, 'id');
    const body = updateBranchSchema.parse(req.body);

    const existingBranch = await prisma.branch.findUnique({ where: { id } });
    if (!existingBranch) throw new AppError(404, 'BRANCH_NOT_FOUND', 'Branch not found');

    if (body.code && body.code !== existingBranch.code) {
      const codeTaken = await prisma.branch.findUnique({ where: { code: body.code } });
      if (codeTaken) throw new AppError(409, 'BRANCH_EXISTS', 'A branch with this code already exists');
    }

    const branch = await prisma.branch.update({
      where: { id },
      data: body,
      include: {
        branchAdmin: { select: { id: true, name: true, email: true, status: true } },
        _count: { select: { users: true, teams: true, campaigns: true, leads: true } },
      },
    });

    res.json({ success: true, data: branch });
  } catch (err) {
    next(err);
  }
});

export default router;