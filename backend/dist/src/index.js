"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.io = void 0;
require("dotenv/config");
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const path_1 = __importDefault(require("path"));
const http_1 = require("http");
const socket_io_1 = require("socket.io");
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const errorHandler_1 = require("./middleware/errorHandler");
const auth_routes_1 = __importDefault(require("./modules/auth/auth.routes"));
const users_routes_1 = __importDefault(require("./modules/users/users.routes"));
const teams_routes_1 = __importDefault(require("./modules/teams/teams.routes"));
const campaigns_routes_1 = __importDefault(require("./modules/campaigns/campaigns.routes"));
const leads_routes_1 = __importDefault(require("./modules/leads/leads.routes"));
const calls_routes_1 = __importDefault(require("./modules/calls/calls.routes"));
const tags_routes_1 = __importDefault(require("./modules/calls/tags.routes"));
const followUps_routes_1 = __importDefault(require("./modules/follow-ups/followUps.routes"));
const agent_routes_1 = __importDefault(require("./modules/agent/agent.routes"));
const leadUpload_worker_1 = require("./jobs/leadUpload.worker");
const followUpReminder_job_1 = require("./jobs/followUpReminder.job");
const jwt_1 = require("./lib/jwt");
const redis_1 = require("./lib/redis");
const app = (0, express_1.default)();
const httpServer = (0, http_1.createServer)(app);
// ── Socket.io Setup ───────────────────────────────────────────────────
const io = new socket_io_1.Server(httpServer, {
    cors: {
        origin: process.env.FRONTEND_URL || 'http://localhost:5173',
        methods: ['GET', 'POST'],
        credentials: true,
    },
});
exports.io = io;
// Authenticate Socket.io connections via JWT
io.use((socket, next) => {
    const token = socket.handshake.auth.token || socket.handshake.query.token;
    if (!token)
        return next(new Error('Authentication required'));
    try {
        const payload = (0, jwt_1.verifyAccessToken)(token);
        socket.data.user = payload;
        next();
    }
    catch {
        next(new Error('Invalid token'));
    }
});
io.on('connection', (socket) => {
    const user = socket.data.user;
    // Each user joins their own room for targeted notifications
    socket.join(`user:${user.userId}`);
    console.log(`🔌 Socket connected: ${user.email} (${user.role})`);
    socket.on('disconnect', () => {
        console.log(`🔌 Socket disconnected: ${user.email}`);
    });
});
// ── Express Middleware ────────────────────────────────────────────────
app.use((0, helmet_1.default)());
app.use((0, cors_1.default)({
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true,
}));
app.use(express_1.default.json({ limit: '10mb' }));
app.use(express_1.default.urlencoded({ extended: true }));
// Rate limiting on auth routes
const authLimiter = (0, express_rate_limit_1.default)({
    windowMs: 60 * 1000, // 1 minute
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: { code: 'RATE_LIMITED', message: 'Too many requests, slow down' } },
});
// ── Health Check ──────────────────────────────────────────────────────
app.get('/health', async (_req, res) => {
    let redisOk = false;
    try {
        await redis_1.redis.ping();
        redisOk = true;
    }
    catch { }
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        services: { redis: redisOk ? 'ok' : 'error' },
    });
});
// ── API Routes ────────────────────────────────────────────────────────
app.use('/api/auth', authLimiter, auth_routes_1.default);
app.use('/api/users', users_routes_1.default);
app.use('/api/teams', teams_routes_1.default);
app.use('/api/campaigns', campaigns_routes_1.default);
app.use('/api/leads', leads_routes_1.default);
app.use('/api/calls', calls_routes_1.default);
app.use('/api/tags', tags_routes_1.default);
app.use('/api/follow-ups', followUps_routes_1.default);
app.use('/api/agent', agent_routes_1.default);
// TODO (Task 2.x): app.use('/api/analytics', analyticsRoutes);
// ── Static Frontend Serving (Unified Deployment) ───────────────────────
if (process.env.NODE_ENV === 'production') {
    const frontendDistPath = path_1.default.join(__dirname, '../../frontend/dist');
    app.use(express_1.default.static(frontendDistPath));
    app.get('*', (req, res) => {
        res.sendFile(path_1.default.join(frontendDistPath, 'index.html'));
    });
}
else {
    // ── 404 Handler (API only in dev) ──────────────────────────────────
    app.use((_req, res) => {
        res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Route not found' } });
    });
}
// ── Error Handler (must be last) ─────────────────────────────────────
app.use(errorHandler_1.errorHandler);
// ── Start Server ──────────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT || '4000', 10);
httpServer.listen(PORT, () => {
    console.log(`\n🚀 CRM Backend running on http://localhost:${PORT}`);
    console.log(`🔌 Socket.io ready`);
    console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}\n`);
    // Start background workers
    (0, leadUpload_worker_1.startLeadUploadWorker)();
    (0, followUpReminder_job_1.startFollowUpReminderJob)(io);
});
exports.default = app;
//# sourceMappingURL=index.js.map