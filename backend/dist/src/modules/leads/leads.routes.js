"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const multer_1 = __importDefault(require("multer"));
const path_1 = __importDefault(require("path"));
const prisma_1 = require("../../lib/prisma");
const auth_1 = require("../../middleware/auth");
const errorHandler_1 = require("../../middleware/errorHandler");
const params_1 = require("../../lib/params");
const leadUpload_worker_1 = require("../../jobs/leadUpload.worker");
const router = (0, express_1.Router)();
router.use(auth_1.authenticate);
// ── Multer Config ─────────────────────────────────────────────────────
const UPLOAD_DIR = process.env.UPLOAD_DIR || './uploads';
const storage = multer_1.default.diskStorage({
    destination: UPLOAD_DIR,
    filename: (_req, file, cb) => {
        const unique = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        cb(null, `${unique}${path_1.default.extname(file.originalname)}`);
    },
});
const upload = (0, multer_1.default)({
    storage,
    limits: { fileSize: (parseInt(process.env.MAX_FILE_SIZE_MB || '50')) * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        const allowed = ['.csv', '.xlsx', '.xls'];
        const ext = path_1.default.extname(file.originalname).toLowerCase();
        if (!allowed.includes(ext)) {
            cb(new Error(`Invalid file type. Allowed: ${allowed.join(', ')}`));
        }
        else {
            cb(null, true);
        }
    },
});
// ── POST /api/leads/upload/:campaignId ────────────────────────────────
router.post('/upload/:campaignId', (0, auth_1.requireRole)('admin'), upload.single('file'), async (req, res, next) => {
    try {
        if (!req.file)
            throw new errorHandler_1.AppError(400, 'NO_FILE', 'No file uploaded');
        const campaignId = (0, params_1.param)(req, 'campaignId');
        const campaign = await prisma_1.prisma.campaign.findUnique({ where: { id: campaignId } });
        if (!campaign)
            throw new errorHandler_1.AppError(404, 'CAMPAIGN_NOT_FOUND', 'Campaign not found');
        if (campaign.status === 'closed')
            throw new errorHandler_1.AppError(400, 'CAMPAIGN_CLOSED', 'Cannot upload to a closed campaign');
        const job = await leadUpload_worker_1.leadUploadQueue.add('process-leads', {
            campaignId,
            filePath: req.file.path,
            fileExt: path_1.default.extname(req.file.originalname).toLowerCase(),
            uploadedBy: req.user.userId,
        });
        res.status(202).json({
            success: true,
            data: {
                jobId: job.id,
                message: 'Upload queued for processing',
                statusUrl: `/api/leads/upload/status/${job.id}`,
            },
        });
    }
    catch (err) {
        next(err);
    }
});
// ── GET /api/leads/upload/status/:jobId ───────────────────────────────
router.get('/upload/status/:jobId', (0, auth_1.requireRole)('admin', 'supervisor'), async (req, res, next) => {
    try {
        const jobId = (0, params_1.param)(req, 'jobId');
        const progress = await (0, leadUpload_worker_1.getUploadProgress)(jobId);
        if (!progress)
            throw new errorHandler_1.AppError(404, 'JOB_NOT_FOUND', 'Upload job not found');
        res.json({ success: true, data: { jobId, ...progress } });
    }
    catch (err) {
        next(err);
    }
});
// ── GET /api/leads ─────────────────────────────────────────────────────
// List leads — scoped by role
router.get('/', async (req, res, next) => {
    try {
        const { role: callerRole, userId } = req.user;
        const { page = '1', limit = '50', campaignId, status, priority, assignedToId, } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);
        let where = {};
        if (callerRole === 'agent') {
            where.assignedToId = userId;
        }
        else if (callerRole === 'supervisor') {
            where = { campaign: { team: { supervisorId: userId } } };
        }
        if (campaignId)
            where.campaignId = campaignId;
        if (status)
            where.status = status;
        if (priority)
            where.priority = priority;
        if (assignedToId && callerRole !== 'agent') {
            where.assignedToId = assignedToId === 'null' ? null : assignedToId;
        }
        const [leads, total] = await Promise.all([
            prisma_1.prisma.lead.findMany({
                where,
                skip,
                take: parseInt(limit),
                orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
                select: {
                    id: true,
                    // Mask phone for agents — show only last 4 digits
                    phone: callerRole !== 'agent',
                    email: true,
                    name: true,
                    status: true,
                    priority: true,
                    isDnd: true,
                    lastCalledAt: true,
                    campaignId: true,
                    campaign: { select: { name: true } },
                    assignedToId: true,
                    createdAt: true,
                    assignedTo: { select: { id: true, name: true } },
                },
            }),
            prisma_1.prisma.lead.count({ where }),
        ]);
        // Apply phone masking for agents
        const formattedLeads = leads.map((l) => ({
            ...l,
            phone: callerRole === 'agent'
                ? `****${l.phone?.slice(-4) || '****'}`
                : l.phone,
        }));
        res.json({ success: true, data: { leads: formattedLeads, total, page: parseInt(page), limit: parseInt(limit) } });
    }
    catch (err) {
        next(err);
    }
});
// ── GET /api/leads/:id ─────────────────────────────────────────────────
router.get('/:id', async (req, res, next) => {
    try {
        const id = (0, params_1.param)(req, 'id');
        const { role: callerRole, userId } = req.user;
        const lead = await prisma_1.prisma.lead.findUnique({
            where: { id },
            include: {
                campaign: { select: { id: true, name: true, type: true } },
                assignedTo: { select: { id: true, name: true } },
                callLogs: {
                    orderBy: { calledAt: 'desc' },
                    take: 10,
                    include: { agent: { select: { id: true, name: true } } },
                },
                followUps: {
                    where: { status: 'pending' },
                    orderBy: { scheduledAt: 'asc' },
                },
                comments: {
                    orderBy: { createdAt: 'desc' },
                    include: { agent: { select: { id: true, name: true } } },
                },
            },
        });
        if (!lead)
            throw new errorHandler_1.AppError(404, 'LEAD_NOT_FOUND', 'Lead not found');
        if (callerRole === 'agent' && lead.assignedToId !== userId) {
            throw new errorHandler_1.AppError(403, 'FORBIDDEN', 'This lead is not assigned to you');
        }
        // Mask phone for agents
        const response = {
            ...lead,
            phone: callerRole === 'agent' ? `****${lead.phone.slice(-4)}` : lead.phone,
        };
        res.json({ success: true, data: response });
    }
    catch (err) {
        next(err);
    }
});
// ── POST /api/leads/assign ─────────────────────────────────────────────
// Admin assigns leads to agents
const assignSchema = zod_1.z.object({
    leadIds: zod_1.z.array(zod_1.z.string().uuid()).min(1).max(1000),
    agentId: zod_1.z.string().uuid(),
});
router.post('/assign', (0, auth_1.requireRole)('admin', 'supervisor'), async (req, res, next) => {
    try {
        const { leadIds, agentId } = assignSchema.parse(req.body);
        const agent = await prisma_1.prisma.user.findUnique({ where: { id: agentId } });
        if (!agent || agent.role !== 'agent')
            throw new errorHandler_1.AppError(400, 'INVALID_AGENT', 'Target user is not an agent');
        // Assign ALL selected leads — including already-assigned ones (re-assign)
        const result = await prisma_1.prisma.lead.updateMany({
            where: { id: { in: leadIds } },
            data: { assignedToId: agentId },
        });
        res.json({ success: true, data: { assigned: result.count, message: `Assigned ${result.count} leads to ${agent.name}` } });
    }
    catch (err) {
        next(err);
    }
});
// ── POST /api/leads/assign-campaign ───────────────────────────────────────
// Admin assigns ALL unassigned leads in a campaign to an agent in one click
router.post('/assign-campaign', (0, auth_1.requireRole)('admin', 'supervisor'), async (req, res, next) => {
    try {
        const { campaignId, agentId } = zod_1.z.object({
            campaignId: zod_1.z.string().uuid(),
            agentId: zod_1.z.string().uuid(),
        }).parse(req.body);
        const agent = await prisma_1.prisma.user.findUnique({ where: { id: agentId } });
        if (!agent || agent.role !== 'agent')
            throw new errorHandler_1.AppError(400, 'INVALID_AGENT', 'Target user is not an agent');
        const campaign = await prisma_1.prisma.campaign.findUnique({ where: { id: campaignId } });
        if (!campaign)
            throw new errorHandler_1.AppError(404, 'CAMPAIGN_NOT_FOUND', 'Campaign not found');
        const result = await prisma_1.prisma.lead.updateMany({
            where: { campaignId, assignedToId: null },
            data: { assignedToId: agentId },
        });
        res.json({
            success: true,
            data: { assigned: result.count, message: `Assigned ${result.count} unassigned leads in "${campaign.name}" to ${agent.name}` },
        });
    }
    catch (err) {
        next(err);
    }
});
// ── POST /api/leads/reclaim ────────────────────────────────────────────
// Admin reclaims leads from agent (keeps in DB, unassigns)
router.post('/reclaim', (0, auth_1.requireRole)('admin', 'supervisor'), async (req, res, next) => {
    try {
        const { leadIds } = zod_1.z.object({ leadIds: zod_1.z.array(zod_1.z.string().uuid()).min(1) }).parse(req.body);
        const result = await prisma_1.prisma.lead.updateMany({
            where: { id: { in: leadIds } },
            data: { assignedToId: null },
        });
        res.json({ success: true, data: { reclaimed: result.count, message: `Reclaimed ${result.count} leads` } });
    }
    catch (err) {
        next(err);
    }
});
// ── PUT /api/leads/:id/status ──────────────────────────────────────────
// Update lead status (agent updates after call)
router.put('/:id/status', async (req, res, next) => {
    try {
        const id = (0, params_1.param)(req, 'id');
        const { status } = zod_1.z.object({
            status: zod_1.z.enum(['uncontacted', 'contacted', 'lead', 'not_interested', 'dnd', 'invalid', 'callback']),
        }).parse(req.body);
        const lead = await prisma_1.prisma.lead.findUnique({ where: { id } });
        if (!lead)
            throw new errorHandler_1.AppError(404, 'LEAD_NOT_FOUND', 'Lead not found');
        if (req.user.role === 'agent' && lead.assignedToId !== req.user.userId) {
            throw new errorHandler_1.AppError(403, 'FORBIDDEN', 'This lead is not assigned to you');
        }
        // If marked as DND, add to blocklist
        const updates = { status };
        if (status === 'dnd') {
            updates.isDnd = true;
            await prisma_1.prisma.dndBlocklist.upsert({
                where: { phone: lead.phone },
                create: { phone: lead.phone, reason: 'Agent-marked DND' },
                update: {},
            });
        }
        const updated = await prisma_1.prisma.lead.update({ where: { id }, data: updates });
        res.json({ success: true, data: updated });
    }
    catch (err) {
        next(err);
    }
});
// ── POST /api/leads/:id/comments ───────────────────────────────────────
// Add internal note to lead
router.post('/:id/comments', async (req, res, next) => {
    try {
        const id = (0, params_1.param)(req, 'id');
        const { content } = zod_1.z.object({ content: zod_1.z.string().min(1).max(2000) }).parse(req.body);
        const agentId = req.user.userId;
        const lead = await prisma_1.prisma.lead.findUnique({ where: { id } });
        if (!lead)
            throw new errorHandler_1.AppError(404, 'LEAD_NOT_FOUND', 'Lead not found');
        if (req.user.role === 'agent' && lead.assignedToId !== agentId) {
            throw new errorHandler_1.AppError(403, 'FORBIDDEN', 'This lead is not assigned to you');
        }
        const comment = await prisma_1.prisma.leadComment.create({
            data: { leadId: id, agentId, content },
            include: { agent: { select: { id: true, name: true } } },
        });
        res.status(201).json({ success: true, data: comment });
    }
    catch (err) {
        next(err);
    }
});
exports.default = router;
//# sourceMappingURL=leads.routes.js.map