import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { authenticate, requireRole } from '../../middleware/auth';
import { AppError } from '../../middleware/errorHandler';
import { param } from '../../lib/params';

const router = Router();
router.use(authenticate);

// ── Schemas ───────────────────────────────────────────────────────────

const createTagSchema = z.object({
  name: z.string().min(1).max(50),
  colour: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#6366f1'),
});

const updateTagSchema = createTagSchema.partial();

// ── GET /api/tags ─────────────────────────────────────────────────────

router.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const tags = await prisma.dispositionTag.findMany({
      orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
      include: { createdBy: { select: { id: true, name: true } } },
    });
    res.json({ success: true, data: tags });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/tags ────────────────────────────────────────────────────

router.post('/', requireRole('admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = createTagSchema.parse(req.body);

    const exists = await prisma.dispositionTag.findUnique({ where: { name: body.name } });
    if (exists) throw new AppError(409, 'TAG_EXISTS', `Tag "${body.name}" already exists`);

    const tag = await prisma.dispositionTag.create({
      data: { name: body.name, colour: body.colour, createdById: req.user!.userId },
    });
    res.status(201).json({ success: true, data: tag });
  } catch (err) {
    next(err);
  }
});

// ── PUT /api/tags/:id ─────────────────────────────────────────────────

router.put('/:id', requireRole('admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = param(req, 'id');
    const body = updateTagSchema.parse(req.body);

    const tag = await prisma.dispositionTag.findUnique({ where: { id } });
    if (!tag) throw new AppError(404, 'TAG_NOT_FOUND', 'Tag not found');
    if (tag.isSystem) throw new AppError(400, 'SYSTEM_TAG', 'Cannot modify system tags');

    const updated = await prisma.dispositionTag.update({
      where: { id },
      data: { ...(body.name && { name: body.name }), ...(body.colour && { colour: body.colour }) },
    });
    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
});

// ── DELETE /api/tags/:id ──────────────────────────────────────────────

router.delete('/:id', requireRole('admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = param(req, 'id');
    const tag = await prisma.dispositionTag.findUnique({ where: { id } });
    if (!tag) throw new AppError(404, 'TAG_NOT_FOUND', 'Tag not found');
    if (tag.isSystem) throw new AppError(400, 'SYSTEM_TAG', 'Cannot delete system tags');

    await prisma.dispositionTag.delete({ where: { id } });
    res.json({ success: true, data: { message: 'Tag deleted' } });
  } catch (err) {
    next(err);
  }
});

export default router;
