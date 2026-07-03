import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import multer from 'multer';
import { prisma } from '../../lib/prisma';
import { redis } from '../../lib/redis';
import { authenticate, requireRole } from '../../middleware/auth';
import { AppError } from '../../middleware/errorHandler';
import { ADMIN_ROLES, assertBranchAccess, getUserBranchId, isSuperAdmin } from '../../lib/access';
import { param } from '../../lib/params';
import {
  deleteSlotMessage,
  editSlotMessage,
  forwardSlotMessage,
  getSlotContactAvatar,
  getSlotContactPhone,
  getSlotMessageMedia,
  getWhatsAppSessionSnapshot,
  initWhatsAppSession,
  listSlotConversations,
  listSlotConversationsWithDbFallback,
  listSlotMessagesWithDbFallback,
  listSlotMessagesBefore,
  markSlotChatRead,
  onWhatsAppAvatarChange,
  onWhatsAppMessage,
  onWhatsAppMessageStatus,
  onWhatsAppPresence,
  onWhatsAppSessionChange,
  sendSlotPayloadMessage,
  sendSlotMediaMessage,
  sendSlotPresence,
  sendSlotTextMessage,
  subscribeSlotPresence,
  terminateWhatsAppSession,
  waitForWhatsAppUpdate,
} from '../../lib/whatsapp';
import { io } from '../../index';

const router = Router();
const attachmentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
});

let whatsappRealtimeBound = false;

if (!whatsappRealtimeBound) {
  onWhatsAppMessage(async (event) => {
    try {
      const slot = await prisma.whatsAppPhoneSlot.findUnique({
        where: { id: event.slotId },
        select: { assignedToId: true },
      });

      if (!slot?.assignedToId) return;

      io.to(`user:${slot.assignedToId}`).emit('whatsapp:message', {
        slotId: event.slotId,
        jid: event.jid,
        message: event.message,
      });
    } catch {
      // Ignore realtime emission failures to avoid blocking message flow.
    }
  });

  onWhatsAppMessageStatus(async (event) => {
    try {
      const slot = await prisma.whatsAppPhoneSlot.findUnique({
        where: { id: event.slotId },
        select: { assignedToId: true },
      });

      if (!slot?.assignedToId) return;

      io.to(`user:${slot.assignedToId}`).emit('whatsapp:message-status', event);
    } catch {
      // Ignore realtime emission failures to avoid blocking status flow.
    }
  });

  onWhatsAppSessionChange(async (event) => {
    try {
      const slot = await prisma.whatsAppPhoneSlot.findUnique({
        where: { id: event.slotId },
        select: { assignedToId: true },
      });

      if (!slot?.assignedToId) return;

      io.to(`user:${slot.assignedToId}`).emit('whatsapp:session', event);
    } catch {
      // Ignore realtime emission failures to avoid blocking session flow.
    }
  });

  onWhatsAppPresence(async (event) => {
    try {
      const slot = await prisma.whatsAppPhoneSlot.findUnique({
        where: { id: event.slotId },
        select: { assignedToId: true },
      });

      if (!slot?.assignedToId) return;

      io.to(`user:${slot.assignedToId}`).emit('whatsapp:presence', event);
    } catch {
      // Ignore realtime emission failures to avoid blocking presence flow.
    }
  });

  onWhatsAppAvatarChange(async (event) => {
    try {
      const slot = await prisma.whatsAppPhoneSlot.findUnique({
        where: { id: event.slotId },
        select: { assignedToId: true },
      });

      if (!slot?.assignedToId) return;

      io.to(`user:${slot.assignedToId}`).emit('whatsapp:avatar', event);
    } catch {
      // Ignore realtime emission failures to avoid blocking avatar flow.
    }
  });

  whatsappRealtimeBound = true;
}

router.use(authenticate);
router.use(requireRole('super_admin', 'branch_admin', 'agent'));

function branchScope(user: { role: string }) {
  return isSuperAdmin(user.role as never) ? {} : { branchId: getUserBranchId(user as never) };
}

async function syncSession(slotId: string, userId: string) {
  let liveSession = await initWhatsAppSession(slotId);
  if (!liveSession.qrPayload && liveSession.state !== 'connected') {
    liveSession = await waitForWhatsAppUpdate(slotId, 20_000);
  }

  return prisma.whatsAppSession.upsert({
    where: { slotId },
    create: {
      slotId,
      state: liveSession.state,
      qrPayload: liveSession.qrPayload,
      qrExpiresAt: liveSession.qrExpiresAt,
      lastHeartbeatAt: liveSession.lastHeartbeatAt,
      reconnectCount: liveSession.reconnectCount,
    },
    update: {
      state: liveSession.state,
      qrPayload: liveSession.qrPayload,
      qrExpiresAt: liveSession.qrExpiresAt,
      lastHeartbeatAt: liveSession.lastHeartbeatAt,
      reconnectCount: liveSession.reconnectCount,
    },
  });
}

async function resetAndSyncSession(slotId: string, userId: string) {
  await terminateWhatsAppSession(slotId);
  return syncSession(slotId, userId);
}

async function persistLiveSession(slotId: string) {
  const live = getWhatsAppSessionSnapshot(slotId);
  if (!live) return null;

  await prisma.whatsAppSession.upsert({
    where: { slotId },
    create: {
      slotId,
      state: live.state,
      qrPayload: live.qrPayload,
      qrExpiresAt: live.qrExpiresAt,
      lastHeartbeatAt: live.lastHeartbeatAt,
      reconnectCount: live.reconnectCount,
    },
    update: {
      state: live.state,
      qrPayload: live.qrPayload,
      qrExpiresAt: live.qrExpiresAt,
      lastHeartbeatAt: live.lastHeartbeatAt,
      reconnectCount: live.reconnectCount,
    },
  });

  return live;
}

async function ensureSlotSession(slotId: string) {
  let live = getWhatsAppSessionSnapshot(slotId);
  if (!live) {
    live = await initWhatsAppSession(slotId);
  }

  // Give more time when reconnecting with existing auth
  const timeoutMs = (live.state === 'pairing' || live.state === 'created' || live.state === 'reconnecting') ? 20_000 : 10_000;

  if (!live.qrPayload && live.state !== 'connected' && live.state !== 'terminated') {
    live = await waitForWhatsAppUpdate(slotId, timeoutMs);
  }

  await persistLiveSession(slotId);
  return live;
}

async function waitForConversationsWarmup(slotId: string, maxAttempts = 20, delayMs = 500) {
  // First try DB fallback immediately — this works even right after a restart
  const dbConversations = await listSlotConversationsWithDbFallback(slotId);
  if (dbConversations.length > 0) {
    return { conversations: dbConversations, syncing: false };
  }

  // DB was also empty — wait for Baileys to deliver fresh chats
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const conversations = listSlotConversations(slotId);
    if (conversations.length > 0) {
      return { conversations, syncing: false };
    }

    const live = getWhatsAppSessionSnapshot(slotId);
    if (!live || live.state !== 'connected') {
      return { conversations, syncing: false };
    }

    if (attempt < maxAttempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  const conversations = listSlotConversations(slotId);
  const live = getWhatsAppSessionSnapshot(slotId);
  return { conversations, syncing: live?.state === 'connected' && conversations.length === 0 };
}

router.get('/me', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const slot = await prisma.whatsAppPhoneSlot.findFirst({
      where: { assignedToId: req.user!.userId },
      include: {
        assignedTo: { select: { id: true, name: true, email: true } },
        session: true,
        branch: { select: { id: true, name: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });

    if (slot) {
      await ensureSlotSession(slot.id);
    }

    const refreshedSlot = slot
      ? await prisma.whatsAppPhoneSlot.findUnique({
          where: { id: slot.id },
          include: {
            assignedTo: { select: { id: true, name: true, email: true } },
            session: true,
            branch: { select: { id: true, name: true } },
          },
        })
      : null;

    // Linking is admin-only — never expose the QR payload to agents.
    const safeSlot = refreshedSlot
      ? {
          ...refreshedSlot,
          session: refreshedSlot.session
            ? { ...refreshedSlot.session, qrPayload: null }
            : null,
        }
      : null;

    res.json({ success: true, data: { slot: safeSlot } });
  } catch (err) {
    next(err);
  }
});

router.get('/me/conversations', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const slot = await prisma.whatsAppPhoneSlot.findFirst({ where: { assignedToId: req.user!.userId } });
    if (!slot) {
      return res.json({ success: true, data: { conversations: [] } });
    }

    await ensureSlotSession(slot.id);

    const { conversations, syncing } = await waitForConversationsWarmup(slot.id);
    res.json({ success: true, data: { conversations, syncing } });
  } catch (err) {
    next(err);
  }
});

router.get('/me/conversations/:jid/messages', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { jid } = z.object({ jid: z.string().min(1) }).parse(req.params);
    const slot = await prisma.whatsAppPhoneSlot.findFirst({ where: { assignedToId: req.user!.userId } });
    if (!slot) {
      return res.json({ success: true, data: { messages: [] } });
    }

    await ensureSlotSession(slot.id);

    const messages = await listSlotMessagesWithDbFallback(slot.id, jid);
    res.json({ success: true, data: { messages } });
  } catch (err) {
    next(err);
  }
});

router.get('/me/conversations/:jid/history', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { jid } = z.object({ jid: z.string().min(1) }).parse(req.params);
    const { before, limit } = z
      .object({ before: z.string().min(1), limit: z.coerce.number().int().min(1).max(100).default(50) })
      .parse(req.query);
    const slot = await prisma.whatsAppPhoneSlot.findFirst({ where: { assignedToId: req.user!.userId } });
    if (!slot) {
      return res.json({ success: true, data: { messages: [], hasMore: false } });
    }

    const result = await listSlotMessagesBefore(slot.id, jid, before, limit);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

router.post('/me/messages', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = z.object({ jid: z.string().min(1), text: z.string().min(1).max(4096) }).parse(req.body);
    const slot = await prisma.whatsAppPhoneSlot.findFirst({ where: { assignedToId: req.user!.userId } });
    if (!slot) {
      throw new AppError(400, 'WHATSAPP_SLOT_REQUIRED', 'No WhatsApp slot is assigned to this user');
    }

    requireConnected(slot.id);
    await sendSlotTextMessage(slot.id, body.jid, body.text.trim());
    res.json({ success: true, data: { sent: true } });
  } catch (err) {
    next(err);
  }
});

const outboundSendSchema = z.object({
  type: z.enum(['text', 'image', 'video', 'audio', 'document', 'sticker', 'contact', 'location', 'poll', 'reaction']),
  to: z.string().min(1),
  text: z.string().optional(),
  media_url: z.string().url().optional(),
  caption: z.string().max(4096).optional(),
  filename: z.string().max(255).optional(),
  mime: z.string().max(255).optional(),
  ptt: z.boolean().optional(),
  vcard: z.string().optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  name: z.string().optional(),
  address: z.string().optional(),
  question: z.string().optional(),
  options: z.array(z.string().min(1)).optional(),
  selectableCount: z.number().int().min(1).max(12).optional(),
  messageId: z.string().optional(),
  emoji: z.string().optional(),
  mentions: z.array(z.string()).optional(),
  quotedMessageId: z.string().optional(),
  send_at: z.string().datetime().optional(),
  idempotency_key: z.string().min(8).max(128).optional(),
});

router.post('/me/send', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = outboundSendSchema.parse(req.body);
    const slot = await prisma.whatsAppPhoneSlot.findFirst({ where: { assignedToId: req.user!.userId } });
    if (!slot) {
      throw new AppError(400, 'WHATSAPP_SLOT_REQUIRED', 'No WhatsApp slot is assigned to this user');
    }
    requireConnected(slot.id);

    const idemKey = body.idempotency_key?.trim();
    const redisKey = idemKey ? `wa:send:idem:${slot.id}:${idemKey}` : null;
    if (redisKey) {
      const existing = await redis.get(redisKey);
      if (existing) {
        return res.json({ success: true, data: JSON.parse(existing), idempotent: true });
      }
    }

    const result = await sendSlotPayloadMessage(slot.id, {
      type: body.type,
      to: body.to,
      text: body.text,
      mediaUrl: body.media_url,
      caption: body.caption,
      filename: body.filename,
      mime: body.mime,
      ptt: body.ptt,
      vcard: body.vcard,
      latitude: body.latitude,
      longitude: body.longitude,
      name: body.name,
      address: body.address,
      question: body.question,
      options: body.options,
      selectableCount: body.selectableCount,
      messageId: body.messageId,
      emoji: body.emoji,
      mentions: body.mentions,
      quotedMessageId: body.quotedMessageId,
      sendAt: body.send_at,
    });

    if (redisKey) {
      await redis.setex(redisKey, 24 * 60 * 60, JSON.stringify(result));
    }

    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

const broadcastSchema = z.object({
  recipients: z.array(z.string().min(1)).min(1).max(200),
  payload: outboundSendSchema.omit({ to: true, idempotency_key: true }),
  idempotency_key: z.string().min(8).max(128).optional(),
});

router.post('/me/broadcast', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = broadcastSchema.parse(req.body);
    const slot = await prisma.whatsAppPhoneSlot.findFirst({ where: { assignedToId: req.user!.userId } });
    if (!slot) {
      throw new AppError(400, 'WHATSAPP_SLOT_REQUIRED', 'No WhatsApp slot is assigned to this user');
    }
    requireConnected(slot.id);

    const idemKey = body.idempotency_key?.trim();
    const redisKey = idemKey ? `wa:broadcast:idem:${slot.id}:${idemKey}` : null;
    if (redisKey) {
      const existing = await redis.get(redisKey);
      if (existing) {
        return res.json({ success: true, data: JSON.parse(existing), idempotent: true });
      }
    }

    const results = await Promise.allSettled(
      body.recipients.map((to) => sendSlotPayloadMessage(slot.id, {
        ...body.payload,
        to,
        mediaUrl: body.payload.media_url,
        sendAt: body.payload.send_at,
      } as any)),
    );

    const sent = results
      .map((result, idx) => ({ result, to: body.recipients[idx] }))
      .filter((item) => item.result.status === 'fulfilled')
      .map((item: any) => ({ to: item.to, ...(item.result.value || {}) }));

    const failed = results
      .map((result, idx) => ({ result, to: body.recipients[idx] }))
      .filter((item) => item.result.status === 'rejected')
      .map((item: any) => ({ to: item.to, error: item.result.reason?.message || 'send_failed' }));

    const responsePayload = {
      requested: body.recipients.length,
      sentCount: sent.length,
      failedCount: failed.length,
      sent,
      failed,
    };

    if (redisKey) {
      await redis.setex(redisKey, 24 * 60 * 60, JSON.stringify(responsePayload));
    }

    res.json({ success: true, data: responsePayload });
  } catch (err) {
    next(err);
  }
});

async function requireMySlot(userId: string) {
  const slot = await prisma.whatsAppPhoneSlot.findFirst({ where: { assignedToId: userId } });
  if (!slot) {
    throw new AppError(400, 'WHATSAPP_SLOT_REQUIRED', 'No WhatsApp slot is assigned to this user');
  }
  return slot;
}

function requireConnected(slotId: string) {
  const snapshot = getWhatsAppSessionSnapshot(slotId);
  if (snapshot?.state !== 'connected') {
    throw new AppError(
      409,
      'WHATSAPP_NOT_CONNECTED',
      'WhatsApp is not connected. Please contact your administrator to link WhatsApp.',
    );
  }
}

router.post('/me/messages/:messageId/forward', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = z.object({ toJid: z.string().min(1) }).parse(req.body);
    const slot = await requireMySlot(req.user!.userId);
    requireConnected(slot.id);
    const result = await forwardSlotMessage(slot.id, param(req, 'messageId'), body.toJid);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

router.post('/me/messages/:messageId/delete', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = z.object({ jid: z.string().min(1) }).parse(req.body);
    const slot = await requireMySlot(req.user!.userId);
    requireConnected(slot.id);
    await deleteSlotMessage(slot.id, body.jid, param(req, 'messageId'));
    res.json({ success: true, data: { deleted: true } });
  } catch (err) {
    next(err);
  }
});

router.post('/me/messages/:messageId/edit', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = z.object({ jid: z.string().min(1), text: z.string().min(1).max(65536) }).parse(req.body);
    const slot = await requireMySlot(req.user!.userId);
    requireConnected(slot.id);
    await editSlotMessage(slot.id, body.jid, param(req, 'messageId'), body.text);
    res.json({ success: true, data: { edited: true } });
  } catch (err) {
    next(err);
  }
});

router.post('/me/chats/:jid/read', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const slot = await requireMySlot(req.user!.userId);
    await markSlotChatRead(slot.id, decodeURIComponent(param(req, 'jid')));
    res.json({ success: true, data: { read: true } });
  } catch (err) {
    next(err);
  }
});

router.post('/me/chats/:jid/presence', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = z.object({
      state: z.enum(['composing', 'recording', 'paused', 'available', 'unavailable']),
    }).parse(req.body);
    const slot = await requireMySlot(req.user!.userId);
    await sendSlotPresence(slot.id, decodeURIComponent(param(req, 'jid')), body.state);
    res.json({ success: true, data: { sent: true } });
  } catch (err) {
    next(err);
  }
});

router.get('/me/chats/:jid/presence', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const slot = await requireMySlot(req.user!.userId);
    requireConnected(slot.id);
    const presence = await subscribeSlotPresence(slot.id, decodeURIComponent(param(req, 'jid')));
    res.json({ success: true, data: presence });
  } catch (err) {
    next(err);
  }
});

router.get('/me/chats/:jid/avatar', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const slot = await requireMySlot(req.user!.userId);
    requireConnected(slot.id);
    const url = await getSlotContactAvatar(slot.id, decodeURIComponent(param(req, 'jid')));
    res.json({ success: true, data: { url } });
  } catch (err) {
    next(err);
  }
});

router.get('/me/chats/:jid/phone', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const slot = await requireMySlot(req.user!.userId);
    requireConnected(slot.id);
    const phone = await getSlotContactPhone(slot.id, decodeURIComponent(param(req, 'jid')));
    res.json({ success: true, data: { phone } });
  } catch (err) {
    next(err);
  }
});

router.get('/me/messages/:messageId/media', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const slot = await requireMySlot(req.user!.userId);
    const messageId = decodeURIComponent(param(req, 'messageId'));
    const media = await getSlotMessageMedia(slot.id, messageId);
    res.setHeader('Content-Type', media.mime);
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(media.name)}"`);
    res.setHeader('Cache-Control', 'private, max-age=86400');
    res.send(media.buffer);
  } catch (err: any) {
    if (err?.message === 'MEDIA_UNAVAILABLE') {
      next(new AppError(410, 'WHATSAPP_MEDIA_UNAVAILABLE', 'Media is no longer available for download'));
      return;
    }
    next(err);
  }
});

router.post('/me/attachments', attachmentUpload.single('file'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.file) {
      throw new AppError(400, 'WHATSAPP_ATTACHMENT_REQUIRED', 'No attachment uploaded');
    }

    const body = z.object({
      jid: z.string().min(1),
      caption: z.string().max(4096).optional().or(z.literal('')),
      voiceNote: z.union([z.boolean(), z.string()]).optional(),
    }).parse(req.body);

    const slot = await prisma.whatsAppPhoneSlot.findFirst({ where: { assignedToId: req.user!.userId } });
    if (!slot) {
      throw new AppError(400, 'WHATSAPP_SLOT_REQUIRED', 'No WhatsApp slot is assigned to this user');
    }

    requireConnected(slot.id);
    await sendSlotMediaMessage(slot.id, body.jid, {
      buffer: req.file.buffer,
      mimetype: req.file.mimetype,
      originalname: req.file.originalname,
      caption: body.caption || undefined,
      voiceNote: body.voiceNote === true || body.voiceNote === 'true',
    });

    res.json({ success: true, data: { sent: true } });
  } catch (err) {
    next(err);
  }
});

router.get('/slots', requireRole(...ADMIN_ROLES), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const slots = await prisma.whatsAppPhoneSlot.findMany({
      where: branchScope(req.user!),
      include: {
        assignedTo: { select: { id: true, name: true, email: true, role: true, status: true } },
        session: true,
        branch: { select: { id: true, name: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });

    res.json({ success: true, data: { slots } });
  } catch (err) {
    next(err);
  }
});

router.post('/users/:userId/scan', requireRole(...ADMIN_ROLES), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId } = z.object({ userId: z.string().uuid() }).parse(req.params);
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, branchId: true, deletedAt: true },
    });

    if (!user || user.deletedAt) throw new AppError(404, 'USER_NOT_FOUND', 'User not found');
    if (!user.branchId) throw new AppError(400, 'USER_BRANCH_REQUIRED', 'User must belong to a branch');
    assertBranchAccess(req.user!, user.branchId);

    const existingSlot = await prisma.whatsAppPhoneSlot.findFirst({
      where: { assignedToId: user.id },
      include: { session: true, assignedTo: { select: { id: true, name: true, email: true } } },
    });

    const slot = existingSlot || await prisma.whatsAppPhoneSlot.create({
      data: {
        branchId: user.branchId,
        displayName: `${user.name} WhatsApp`,
        status: 'active',
        assignedToId: user.id,
      },
      include: { session: true, assignedTo: { select: { id: true, name: true, email: true } } },
    });

    const session = await resetAndSyncSession(slot.id, user.id);

    if (!existingSlot) {
      await prisma.whatsAppPhoneSlot.update({
        where: { id: slot.id },
        data: { status: 'active', assignedToId: user.id },
      });
    }

    const refreshedSlot = await prisma.whatsAppPhoneSlot.findUnique({
      where: { id: slot.id },
      include: {
        assignedTo: { select: { id: true, name: true, email: true } },
        session: true,
        branch: { select: { id: true, name: true } },
      },
    });

    res.json({ success: true, data: { slot: refreshedSlot, session, qrPayload: session.qrPayload } });
  } catch (err) {
    next(err);
  }
});

const reassignSchema = z.object({ userId: z.string().uuid() });

router.post('/slots/:slotId/reassign', requireRole(...ADMIN_ROLES), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { slotId } = z.object({ slotId: z.string().uuid() }).parse(req.params);
    const { userId } = reassignSchema.parse(req.body);

    const [slot, targetUser] = await Promise.all([
      prisma.whatsAppPhoneSlot.findUnique({ where: { id: slotId }, include: { session: true } }),
      prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true, branchId: true, deletedAt: true } }),
    ]);

    if (!slot) throw new AppError(404, 'WHATSAPP_SLOT_NOT_FOUND', 'WhatsApp slot not found');
    if (!targetUser || targetUser.deletedAt) throw new AppError(404, 'USER_NOT_FOUND', 'User not found');
    assertBranchAccess(req.user!, slot.branchId);
    assertBranchAccess(req.user!, targetUser.branchId);

    const existingTargetSlot = await prisma.whatsAppPhoneSlot.findFirst({
      where: { assignedToId: targetUser.id, id: { not: slot.id } },
      select: { id: true },
    });

    await prisma.$transaction(async (tx: any) => {
      if (existingTargetSlot) {
        await tx.whatsAppPhoneSlot.update({
          where: { id: existingTargetSlot.id },
          data: { assignedToId: null, status: 'idle' },
        });
      }

      await tx.whatsAppPhoneSlot.update({
        where: { id: slot.id },
        data: { assignedToId: targetUser.id, status: 'active' },
      });

      await tx.whatsAppSession.upsert({
        where: { slotId: slot.id },
        create: {
          slotId: slot.id,
          state: 'reconnecting',
          reconnectCount: 1,
        },
        update: {
          state: 'reconnecting',
          reconnectCount: { increment: 1 },
        },
      });
    });

    const liveSession = await resetAndSyncSession(slot.id, targetUser.id);
    await prisma.whatsAppSession.update({
      where: { slotId: slot.id },
      data: {
        state: liveSession.state,
        qrPayload: liveSession.qrPayload,
        qrExpiresAt: liveSession.qrExpiresAt,
        lastHeartbeatAt: liveSession.lastHeartbeatAt,
        reconnectCount: liveSession.reconnectCount,
      },
    });

    const updatedSlot = await prisma.whatsAppPhoneSlot.findUnique({
      where: { id: slot.id },
      include: {
        assignedTo: { select: { id: true, name: true, email: true } },
        session: true,
        branch: { select: { id: true, name: true } },
      },
    });

    res.json({ success: true, data: { slot: updatedSlot } });
  } catch (err) {
    next(err);
  }
});

router.post('/slots/:slotId/hide-phone', requireRole(...ADMIN_ROLES), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { slotId } = z.object({ slotId: z.string().uuid() }).parse(req.params);
    const { hidePhone } = z.object({ hidePhone: z.boolean() }).parse(req.body);
    const slot = await prisma.whatsAppPhoneSlot.findUnique({ where: { id: slotId } });
    if (!slot) throw new AppError(404, 'WHATSAPP_SLOT_NOT_FOUND', 'WhatsApp slot not found');
    assertBranchAccess(req.user!, slot.branchId);

    const updated = await prisma.whatsAppPhoneSlot.update({ where: { id: slotId }, data: { hidePhone } });

    res.json({ success: true, data: { slot: updated } });
  } catch (err) {
    next(err);
  }
});

router.post('/slots/:slotId/reconnect', requireRole(...ADMIN_ROLES), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { slotId } = z.object({ slotId: z.string().uuid() }).parse(req.params);
    const slot = await prisma.whatsAppPhoneSlot.findUnique({ where: { id: slotId } });
    if (!slot) throw new AppError(404, 'WHATSAPP_SLOT_NOT_FOUND', 'WhatsApp slot not found');
    assertBranchAccess(req.user!, slot.branchId);

    // Reconnect reuses saved auth — does NOT delete credentials.
    // Only scan (which calls resetAndSyncSession) wipes auth for a fresh QR.
    const session = await syncSession(slotId, slot.assignedToId || req.user!.userId);

    res.json({ success: true, data: { slot, session } });
  } catch (err) {
    next(err);
  }
});

router.post('/slots/:slotId/terminate', requireRole(...ADMIN_ROLES), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { slotId } = z.object({ slotId: z.string().uuid() }).parse(req.params);
    const slot = await prisma.whatsAppPhoneSlot.findUnique({ where: { id: slotId } });
    if (!slot) throw new AppError(404, 'WHATSAPP_SLOT_NOT_FOUND', 'WhatsApp slot not found');
    assertBranchAccess(req.user!, slot.branchId);

    await terminateWhatsAppSession(slotId);

    await prisma.$transaction(async (tx: any) => {
      await tx.whatsAppSession.deleteMany({ where: { slotId } });
      await tx.whatsAppPhoneSlot.delete({ where: { id: slotId } });
    });

    res.json({ success: true, data: { message: 'WhatsApp slot deleted' } });
  } catch (err) {
    next(err);
  }
});

export default router;