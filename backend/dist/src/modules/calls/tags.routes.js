"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const prisma_1 = require("../../lib/prisma");
const auth_1 = require("../../middleware/auth");
const errorHandler_1 = require("../../middleware/errorHandler");
const params_1 = require("../../lib/params");
const router = (0, express_1.Router)();
router.use(auth_1.authenticate);
// ── Schemas ───────────────────────────────────────────────────────────
const createTagSchema = zod_1.z.object({
    name: zod_1.z.string().min(1).max(50),
    colour: zod_1.z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#6366f1'),
});
const updateTagSchema = createTagSchema.partial();
// ── GET /api/tags ─────────────────────────────────────────────────────
router.get('/', async (_req, res, next) => {
    try {
        const tags = await prisma_1.prisma.dispositionTag.findMany({
            orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
            include: { createdBy: { select: { id: true, name: true } } },
        });
        res.json({ success: true, data: tags });
    }
    catch (err) {
        next(err);
    }
});
// ── POST /api/tags ────────────────────────────────────────────────────
router.post('/', (0, auth_1.requireRole)('admin'), async (req, res, next) => {
    try {
        const body = createTagSchema.parse(req.body);
        const exists = await prisma_1.prisma.dispositionTag.findUnique({ where: { name: body.name } });
        if (exists)
            throw new errorHandler_1.AppError(409, 'TAG_EXISTS', `Tag "${body.name}" already exists`);
        const tag = await prisma_1.prisma.dispositionTag.create({
            data: { name: body.name, colour: body.colour, createdById: req.user.userId },
        });
        res.status(201).json({ success: true, data: tag });
    }
    catch (err) {
        next(err);
    }
});
// ── PUT /api/tags/:id ─────────────────────────────────────────────────
router.put('/:id', (0, auth_1.requireRole)('admin'), async (req, res, next) => {
    try {
        const id = (0, params_1.param)(req, 'id');
        const body = updateTagSchema.parse(req.body);
        const tag = await prisma_1.prisma.dispositionTag.findUnique({ where: { id } });
        if (!tag)
            throw new errorHandler_1.AppError(404, 'TAG_NOT_FOUND', 'Tag not found');
        if (tag.isSystem)
            throw new errorHandler_1.AppError(400, 'SYSTEM_TAG', 'Cannot modify system tags');
        const updated = await prisma_1.prisma.dispositionTag.update({
            where: { id },
            data: { ...(body.name && { name: body.name }), ...(body.colour && { colour: body.colour }) },
        });
        res.json({ success: true, data: updated });
    }
    catch (err) {
        next(err);
    }
});
// ── DELETE /api/tags/:id ──────────────────────────────────────────────
router.delete('/:id', (0, auth_1.requireRole)('admin'), async (req, res, next) => {
    try {
        const id = (0, params_1.param)(req, 'id');
        const tag = await prisma_1.prisma.dispositionTag.findUnique({ where: { id } });
        if (!tag)
            throw new errorHandler_1.AppError(404, 'TAG_NOT_FOUND', 'Tag not found');
        if (tag.isSystem)
            throw new errorHandler_1.AppError(400, 'SYSTEM_TAG', 'Cannot delete system tags');
        await prisma_1.prisma.dispositionTag.delete({ where: { id } });
        res.json({ success: true, data: { message: 'Tag deleted' } });
    }
    catch (err) {
        next(err);
    }
});
exports.default = router;
//# sourceMappingURL=tags.routes.js.map