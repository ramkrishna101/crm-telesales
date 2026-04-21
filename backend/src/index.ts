import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { createServer } from 'http';
import { Server as SocketServer } from 'socket.io';
import rateLimit from 'express-rate-limit';
import { errorHandler } from './middleware/errorHandler';
import authRoutes from './modules/auth/auth.routes';
import { verifyAccessToken } from './lib/jwt';
import { redis } from './lib/redis';

const app = express();
const httpServer = createServer(app);

// ── Socket.io Setup ───────────────────────────────────────────────────
const io = new SocketServer(httpServer, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
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
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
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

// ── Health Check ──────────────────────────────────────────────────────
app.get('/health', async (_req, res) => {
  let redisOk = false;
  try {
    await redis.ping();
    redisOk = true;
  } catch {}

  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    services: { redis: redisOk ? 'ok' : 'error' },
  });
});

// ── API Routes ────────────────────────────────────────────────────────
app.use('/api/auth', authLimiter, authRoutes);

// TODO: mount additional route modules here as they are built
// app.use('/api/users', authenticate, usersRoutes);
// app.use('/api/campaigns', authenticate, campaignRoutes);
// app.use('/api/agent', authenticate, agentRoutes);
// app.use('/api/analytics', authenticate, analyticsRoutes);

// ── 404 Handler ───────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Route not found' } });
});

// ── Error Handler (must be last) ─────────────────────────────────────
app.use(errorHandler as express.ErrorRequestHandler);

// ── Start Server ──────────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT || '4000', 10);
httpServer.listen(PORT, () => {
  console.log(`\n🚀 CRM Backend running on http://localhost:${PORT}`);
  console.log(`🔌 Socket.io ready`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}\n`);
});

export default app;
