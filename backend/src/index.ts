import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import { createServer } from 'http';
import { Server as SocketServer } from 'socket.io';
import rateLimit from 'express-rate-limit';
import { errorHandler } from './middleware/errorHandler';
import authRoutes from './modules/auth/auth.routes';
import branchRoutes from './modules/branch/branch.routes';
import usersRoutes from './modules/users/users.routes';
import teamsRoutes from './modules/teams/teams.routes';
import campaignsRoutes from './modules/campaigns/campaigns.routes';
import leadsRoutes from './modules/leads/leads.routes';
import callsRoutes from './modules/calls/calls.routes';
import tagsRoutes from './modules/calls/tags.routes';
import followUpsRoutes from './modules/follow-ups/followUps.routes';
import agentRoutes from './modules/agent/agent.routes';
import stringeeRoutes from './modules/stringee/stringee.routes';
import { startLeadUploadWorker } from './jobs/leadUpload.worker';
import { startFollowUpReminderJob } from './jobs/followUpReminder.job';
import { verifyAccessToken } from './lib/jwt';
import { prisma } from './lib/prisma';
import { redis } from './lib/redis';

const DEFAULT_BRANCH_CODE = 'primary';
const HEALTHCHECK_TIMEOUT_MS = 1000;

const configuredOrigins = (process.env.FRONTEND_URL || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const defaultOrigins = process.env.NODE_ENV === 'production' ? [] : ['http://localhost:5173'];
const allowedOrigins = new Set([...defaultOrigins, ...configuredOrigins]);

function isAllowedOrigin(origin?: string) {
  if (!origin) return true;
  if (allowedOrigins.has(origin)) return true;

  if (process.env.NODE_ENV === 'production') {
    try {
      const { hostname } = new URL(origin);
      return hostname.endsWith('.up.railway.app');
    } catch {
      return false;
    }
  }

  return false;
}

function corsOrigin(origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) {
  if (isAllowedOrigin(origin)) {
    callback(null, true);
    return;
  }

  callback(new Error('Origin not allowed by CORS'));
}

const app = express();
app.set('trust proxy', 1); // Required for express-rate-limit behind Railway/Render proxy
const httpServer = createServer(app);

const helmetConfig = helmet({
  contentSecurityPolicy: {
    directives: {
      ...helmet.contentSecurityPolicy.getDefaultDirectives(),
      "script-src": ["'self'", 'https://cdn.stringee.com'],
      "connect-src": [
        "'self'",
        'https://*.stringee.com',
        'wss://*.stringee.com',
        'https://*.stringeex.com',
        'wss://*.stringeex.com',
      ],
    },
  },
});

// ── Socket.io Setup ───────────────────────────────────────────────────
const io = new SocketServer(httpServer, {
  cors: {
    origin: corsOrigin,
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

// Authenticate Socket.io connections via JWT
io.use((socket, next) => {
  const token = socket.handshake.auth.token || socket.handshake.query.token;
  if (!token) return next(new Error('Authentication required'));
  try {
    const payload = verifyAccessToken(token as string);
    socket.data.user = payload;
    next();
  } catch {
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

// Export io for use in route handlers and jobs
export { io };

// ── Express Middleware ────────────────────────────────────────────────
app.use(helmetConfig);
app.use(cors({
  origin: corsOrigin,
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Rate limiting on auth routes
const authLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: { code: 'RATE_LIMITED', message: 'Too many requests, slow down' } },
});

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, fallbackValue: T): Promise<T> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(fallbackValue), timeoutMs);

    promise
      .then((value) => resolve(value))
      .catch(() => resolve(fallbackValue))
      .finally(() => clearTimeout(timer));
  });
}

// ── Health Check ──────────────────────────────────────────────────────
app.get('/health', async (_req, res) => {
  const redisStatus = await withTimeout(
    redis.ping().then(() => 'ok').catch(() => 'error'),
    HEALTHCHECK_TIMEOUT_MS,
    'timeout'
  );

  const userCount = await withTimeout(
    prisma.user.count(),
    HEALTHCHECK_TIMEOUT_MS,
    -1
  );

  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    services: { redis: redisStatus },
    db: { users: userCount }
  });
});

// ── API Routes ────────────────────────────────────────────────────────
app.use('/api/auth', authLimiter, authRoutes);

app.use('/api/branches', branchRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/teams', teamsRoutes);
app.use('/api/campaigns', campaignsRoutes);
app.use('/api/leads', leadsRoutes);
app.use('/api/calls', callsRoutes);
app.use('/api/tags', tagsRoutes);
app.use('/api/follow-ups', followUpsRoutes);
app.use('/api/agent', agentRoutes);
app.use('/api/stringee', stringeeRoutes);
// TODO (Task 2.x): app.use('/api/analytics', analyticsRoutes);

// ── Static Frontend Serving (Unified Deployment) ───────────────────────
if (process.env.NODE_ENV === 'production') {
  const frontendDistPath = path.join(__dirname, '../../frontend/dist');
  app.use(express.static(frontendDistPath));
  app.get('/*splat', (req, res) => {
    res.sendFile(path.join(frontendDistPath, 'index.html'));
  });
} else {
  // ── 404 Handler (API only in dev) ──────────────────────────────────
  app.use((_req, res) => {
    res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Route not found' } });
  });
}

// ── Error Handler (must be last) ─────────────────────────────────────
app.use(errorHandler as express.ErrorRequestHandler);

// ── Start Server ──────────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT || '4000', 10);
httpServer.listen(PORT, async () => {
  console.log(`\n🚀 CRM Backend running on http://localhost:${PORT}`);
  console.log(`🔌 Socket.io ready`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}\n`);
  
  // Start background workers
  startLeadUploadWorker();
  startFollowUpReminderJob(io);

  // Force provision/reset admin user (to resolve login lockouts)
  try {
    const bcrypt = require('bcryptjs');
    const defaultBranch = await prisma.branch.upsert({
      where: { code: DEFAULT_BRANCH_CODE },
      update: {},
      create: {
        name: 'Primary',
        code: DEFAULT_BRANCH_CODE,
        status: 'active',
      },
    });
    
    const adminPassword = await bcrypt.hash('admin@123', 12);
    await prisma.user.upsert({
      where: { email: 'admin@crm.com' },
      update: { passwordHash: adminPassword, status: 'offline', role: 'super_admin', branchId: defaultBranch.id },
      create: {
        name: 'Super Admin',
        email: 'admin@crm.com',
        passwordHash: adminPassword,
        role: 'super_admin',
        branchId: defaultBranch.id,
        status: 'offline'
      }
    });
    console.log('✅ Admin reset/provisioned: admin@crm.com / admin@123');
  } catch (err) {
    console.error('❌ Failed to auto-provision admin user:', err);
  }
});

export default app;
