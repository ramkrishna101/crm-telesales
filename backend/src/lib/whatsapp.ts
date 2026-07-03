import path from 'path';
import fs from 'fs/promises';
import { EventEmitter } from 'events';
import { prisma } from './prisma';
import makeWASocket, {
  DisconnectReason,
  downloadMediaMessage,
  fetchLatestBaileysVersion,
  getBinaryNodeChild,
  jidNormalizedUser,
  S_WHATSAPP_NET,
  useMultiFileAuthState,
  WASocket,
} from '@whiskeysockets/baileys';

export type WhatsAppGatewayState =
  | 'created'
  | 'qr_ready'
  | 'pairing'
  | 'connected'
  | 'degraded'
  | 'reconnecting'
  | 'disconnected'
  | 'terminated';

type SessionSnapshot = {
  slotId: string;
  state: WhatsAppGatewayState;
  qrPayload: string | null;
  qrExpiresAt: Date | null;
  lastHeartbeatAt: Date | null;
  reconnectCount: number;
};

type InMemorySession = {
  slotId: string;
  socket: WASocket | null;
  state: WhatsAppGatewayState;
  qrPayload: string | null;
  qrExpiresAt: Date | null;
  lastHeartbeatAt: Date | null;
  reconnectCount: number;
  waiters: Array<(snapshot: SessionSnapshot) => void>;
  keepaliveTimer: NodeJS.Timeout | null;
  keepaliveSocket: any;
  keepalivePongHandler: (() => void) | null;
};

type ConversationSummary = {
  jid: string;
  title: string;
  lastMessage: string;
  lastMessageAt: string;
  unread: number;
};

type ConversationMessage = {
  id: string;
  jid: string;
  fromMe: boolean;
  text: string;
  timestamp: string;
  status?: 'pending' | 'sent' | 'delivered' | 'read' | 'played' | 'failed';
  sentAt?: string | null;
  deliveredAt?: string | null;
  readAt?: string | null;
  playedAt?: string | null;
  failedAt?: string | null;
  failureCode?: string | null;
  failureReason?: string | null;
  reactions?: string[];
  edited?: boolean;
  deleted?: boolean;
  mediaType?: 'image' | 'video' | 'audio' | 'voice' | 'document' | 'sticker' | null;
  mediaMime?: string | null;
  mediaName?: string | null;
  mediaDurationSec?: number | null;
  /** Sender name for group messages. */
  senderName?: string | null;
  /** Quoted (replied-to) message info. */
  quotedId?: string | null;
  quotedPreview?: string | null;
  quotedSender?: string | null;
  /** Raw Baileys proto (in-memory only) used for forward/quote/read keys. */
  raw?: any;
};

type SlotMessageCache = {
  conversations: Map<string, ConversationSummary>;
  messages: Map<string, ConversationMessage[]>;
};

export type WhatsAppMessageEvent = {
  slotId: string;
  jid: string;
  message: ConversationMessage;
};

export type WhatsAppMessageStatusEvent = {
  slotId: string;
  jid: string;
  messageId: string;
  status: 'pending' | 'sent' | 'delivered' | 'read' | 'played' | 'failed';
  sentAt?: string | null;
  deliveredAt?: string | null;
  readAt?: string | null;
  playedAt?: string | null;
  failedAt?: string | null;
  failureCode?: string | null;
  failureReason?: string | null;
};

export type WhatsAppSessionEvent = {
  slotId: string;
  state: WhatsAppGatewayState;
  lastHeartbeatAt: string | null;
  reconnectCount: number;
};

export type WhatsAppPresenceState = 'online' | 'offline' | 'typing' | 'recording' | 'paused' | 'unknown';

export type WhatsAppPresenceEvent = {
  slotId: string;
  jid: string;
  presence: WhatsAppPresenceState;
  lastSeenAt: string | null;
};

export type OutboundSendPayload = {
  type:
    | 'text'
    | 'image'
    | 'video'
    | 'audio'
    | 'document'
    | 'sticker'
    | 'contact'
    | 'location'
    | 'poll'
    | 'reaction';
  to: string;
  text?: string;
  mediaUrl?: string;
  caption?: string;
  filename?: string;
  mime?: string;
  ptt?: boolean;
  vcard?: string;
  latitude?: number;
  longitude?: number;
  name?: string;
  address?: string;
  question?: string;
  options?: string[];
  selectableCount?: number;
  messageId?: string;
  emoji?: string;
  mentions?: string[];
  quotedMessageId?: string;
  sendAt?: string;
};

const sessions = new Map<string, InMemorySession>();
const RECONNECT_BACKOFF_MS = [1_000, 5_000, 30_000, 120_000, 600_000] as const;
const MAX_AUTO_RECONNECT_ATTEMPTS = RECONNECT_BACKOFF_MS.length;
const MAX_MESSAGES_PER_CHAT = 200;
const KEEPALIVE_INTERVAL_MS = 25_000;
const KEEPALIVE_STALE_MS = 90_000;
const slotCaches = new Map<string, SlotMessageCache>();
const slotLiveChatJids = new Map<string, Set<string>>();
const slotPresence = new Map<string, Map<string, { presence: WhatsAppPresenceState; lastSeenAt: string | null }>>();
const slotPresenceSubscriptions = new Map<string, Set<string>>();
const slotAvatarCache = new Map<string, Map<string, { url: string | null; fetchedAt: number }>>();
const AVATAR_CACHE_TTL_MS = 15 * 60 * 1000;
const whatsappEvents = new EventEmitter();

function authDirForSlot(slotId: string) {
  return path.resolve(process.cwd(), 'uploads', 'wa-auth', slotId);
}

function mediaDirForSlot(slotId: string) {
  return path.resolve(process.cwd(), 'uploads', 'wa-media', slotId);
}

function safeMediaFileName(messageId: string) {
  return messageId.replace(/[^A-Za-z0-9_-]/g, '');
}

function toSnapshot(session: InMemorySession): SessionSnapshot {
  return {
    slotId: session.slotId,
    state: session.state,
    qrPayload: session.qrPayload,
    qrExpiresAt: session.qrExpiresAt,
    lastHeartbeatAt: session.lastHeartbeatAt,
    reconnectCount: session.reconnectCount,
  };
}

function notify(session: InMemorySession) {
  const snapshot = toSnapshot(session);

  const sessionEvent: WhatsAppSessionEvent = {
    slotId: session.slotId,
    state: session.state,
    lastHeartbeatAt: session.lastHeartbeatAt ? session.lastHeartbeatAt.toISOString() : null,
    reconnectCount: session.reconnectCount,
  };
  whatsappEvents.emit('session', sessionEvent);

  prisma.whatsAppSession.upsert({
    where: { slotId: session.slotId },
    create: {
      slotId: session.slotId,
      state: session.state,
      qrPayload: session.qrPayload,
      qrExpiresAt: session.qrExpiresAt,
      lastHeartbeatAt: session.lastHeartbeatAt,
      reconnectCount: session.reconnectCount,
    },
    update: {
      state: session.state,
      qrPayload: session.qrPayload,
      qrExpiresAt: session.qrExpiresAt,
      lastHeartbeatAt: session.lastHeartbeatAt,
      reconnectCount: session.reconnectCount,
    },
  }).catch(() => {
    // Session persistence is best-effort and should never block realtime flow.
  });

  const waiters = [...session.waiters];
  session.waiters = [];
  waiters.forEach((resolve) => resolve(snapshot));
}

function clearKeepalive(session: InMemorySession) {
  if (session.keepaliveTimer) {
    clearInterval(session.keepaliveTimer);
    session.keepaliveTimer = null;
  }

  if (session.keepaliveSocket && session.keepalivePongHandler) {
    try {
      if (typeof session.keepaliveSocket.off === 'function') {
        session.keepaliveSocket.off('pong', session.keepalivePongHandler);
      } else if (typeof session.keepaliveSocket.removeListener === 'function') {
        session.keepaliveSocket.removeListener('pong', session.keepalivePongHandler);
      }
    } catch {
      // ignore listener cleanup errors
    }
  }

  session.keepaliveSocket = null;
  session.keepalivePongHandler = null;
}

function startKeepalive(session: InMemorySession, socket: WASocket) {
  clearKeepalive(session);

  const ws = socket.ws as any;
  if (ws && typeof ws.on === 'function') {
    const onPong = () => {
      session.lastHeartbeatAt = new Date();
      notify(session);
    };

    ws.on('pong', onPong);
    session.keepaliveSocket = ws;
    session.keepalivePongHandler = onPong;
  }

  session.keepaliveTimer = setInterval(() => {
    const active = sessions.get(session.slotId);
    if (!active || active.socket !== socket) {
      clearKeepalive(session);
      return;
    }

    const activeWs = socket.ws as any;
    if (!activeWs || activeWs.readyState !== 1) {
      return;
    }

    const lastHeartbeatMs = session.lastHeartbeatAt?.getTime() || 0;
    if (lastHeartbeatMs && Date.now() - lastHeartbeatMs > KEEPALIVE_STALE_MS) {
      session.state = 'degraded';
      notify(session);

        queueReconnectAttempt(session.slotId, socket);
      return;
    }

    try {
      if (typeof activeWs.ping === 'function') {
        activeWs.ping();
      }
    } catch {
      session.state = 'degraded';
      notify(session);

      queueReconnectAttempt(session.slotId, socket);
    }
  }, KEEPALIVE_INTERVAL_MS);
}

function queueReconnectAttempt(slotId: string, socket: WASocket) {
  const session = sessions.get(slotId);
  if (!session || session.socket !== socket) return;

  if (session.state === 'reconnecting') return;

  if (session.reconnectCount >= MAX_AUTO_RECONNECT_ATTEMPTS) {
    session.state = 'disconnected';
    notify(session);
    return;
  }

  session.reconnectCount += 1;
  session.state = 'reconnecting';
  notify(session);

  const reconnectAttempt = session.reconnectCount;
  const delayMs = RECONNECT_BACKOFF_MS[Math.min(reconnectAttempt - 1, RECONNECT_BACKOFF_MS.length - 1)];

  setTimeout(() => {
    const current = sessions.get(slotId);
    if (!current || current.socket !== socket) return;

    startSession(slotId, true)
      .then(() => {
        console.info(
          `[whatsapp] slot=${slotId} reconnect_attempt=${reconnectAttempt} started delayMs=${delayMs}`,
        );
      })
      .catch((err) => {
        console.error(`[whatsapp] slot=${slotId} reconnect_failed`, err?.message || err);
      });
  }, delayMs);
}

function cacheForSlot(slotId: string): SlotMessageCache {
  let cache = slotCaches.get(slotId);
  if (!cache) {
    cache = { conversations: new Map(), messages: new Map() };
    slotCaches.set(slotId, cache);
  }
  return cache;
}

function markLiveChatJids(slotId: string, jids: string[]) {
  if (!jids.length) return;
  let set = slotLiveChatJids.get(slotId);
  if (!set) {
    set = new Set<string>();
    slotLiveChatJids.set(slotId, set);
  }
  jids.forEach((jid) => {
    if (jid) set!.add(jid);
  });
}

function pruneCacheToLiveChats(slotId: string) {
  const live = slotLiveChatJids.get(slotId);
  if (!live || live.size === 0) return;

  const cache = slotCaches.get(slotId);
  if (!cache) return;

  for (const jid of [...cache.conversations.keys()]) {
    if (!live.has(jid)) {
      cache.conversations.delete(jid);
    }
  }

  for (const jid of [...cache.messages.keys()]) {
    if (!live.has(jid)) {
      cache.messages.delete(jid);
    }
  }
}

function extractText(message: any): string {
  if (!message) return '';
  // Text can be nested inside ephemeral / view-once / edited wrappers.
  const inner = message?.ephemeralMessage?.message
    || message?.viewOnceMessage?.message
    || message?.viewOnceMessageV2?.message
    || message?.documentWithCaptionMessage?.message
    || message?.editedMessage?.message?.protocolMessage?.editedMessage
    || message;

  const template = inner?.templateMessage?.hydratedTemplate
    || inner?.templateMessage?.hydratedFourRowTemplate
    || inner?.templateMessage?.interactiveMessageTemplate;

  return (
    inner?.conversation
    || inner?.extendedTextMessage?.text
    || inner?.imageMessage?.caption
    || inner?.videoMessage?.caption
    || inner?.documentMessage?.caption
    || inner?.documentMessage?.fileName
    // Business / interactive formats
    || inner?.buttonsMessage?.contentText
    || inner?.buttonsResponseMessage?.selectedDisplayText
    || inner?.listMessage?.description
    || inner?.listMessage?.title
    || inner?.listResponseMessage?.title
    || template?.hydratedContentText
    || inner?.interactiveMessage?.body?.text
    || inner?.interactiveResponseMessage?.body?.text
    || inner?.highlyStructuredMessage?.hydratedHsm?.hydratedTemplate?.hydratedContentText
    // Other message kinds -> readable placeholders
    || (inner?.contactMessage ? `👤 ${inner.contactMessage.displayName || 'Contact'}` : '')
    || (inner?.contactsArrayMessage ? '👤 Contacts' : '')
    || (inner?.locationMessage ? `📍 ${inner.locationMessage.name || 'Location'}` : '')
    || (inner?.liveLocationMessage ? '📍 Live location' : '')
    || (inner?.pollCreationMessage?.name ? `📊 ${inner.pollCreationMessage.name}` : '')
    || (inner?.pollCreationMessageV2?.name ? `📊 ${inner.pollCreationMessageV2.name}` : '')
    || (inner?.pollCreationMessageV3?.name ? `📊 ${inner.pollCreationMessageV3.name}` : '')
    || (inner?.eventMessage?.name ? `📅 ${inner.eventMessage.name}` : '')
    || (inner?.orderMessage ? '🛒 Order' : '')
    || (inner?.paymentInviteMessage ? '💳 Payment' : '')
    || (inner?.call ? '📞 Call' : '')
    || ''
  );
}

type DetectedMedia = {
  mediaType: NonNullable<ConversationMessage['mediaType']>;
  mediaMime: string | null;
  mediaName: string | null;
  mediaDurationSec: number | null;
  caption: string;
};

function detectMedia(message: any): DetectedMedia | null {
  if (!message) return null;
  // Media can be nested inside view-once / ephemeral wrappers.
  let inner = message?.viewOnceMessage?.message
    || message?.viewOnceMessageV2?.message
    || message?.ephemeralMessage?.message
    || message;

  // Business template messages can embed media in the hydrated template header.
  const template = inner?.templateMessage?.hydratedTemplate
    || inner?.templateMessage?.hydratedFourRowTemplate
    || inner?.interactiveMessage?.header;
  if (template && (template.imageMessage || template.videoMessage || template.documentMessage)) {
    inner = template;
  }

  if (inner?.imageMessage) {
    return {
      mediaType: 'image',
      mediaMime: inner.imageMessage.mimetype || 'image/jpeg',
      mediaName: null,
      mediaDurationSec: null,
      caption: inner.imageMessage.caption || '',
    };
  }
  if (inner?.videoMessage) {
    return {
      mediaType: 'video',
      mediaMime: inner.videoMessage.mimetype || 'video/mp4',
      mediaName: null,
      mediaDurationSec: Number(inner.videoMessage.seconds) || null,
      caption: inner.videoMessage.caption || '',
    };
  }
  if (inner?.audioMessage) {
    return {
      mediaType: inner.audioMessage.ptt ? 'voice' : 'audio',
      mediaMime: inner.audioMessage.mimetype || 'audio/ogg',
      mediaName: null,
      mediaDurationSec: Number(inner.audioMessage.seconds) || null,
      caption: '',
    };
  }
  if (inner?.stickerMessage) {
    return {
      mediaType: 'sticker',
      mediaMime: inner.stickerMessage.mimetype || 'image/webp',
      mediaName: null,
      mediaDurationSec: null,
      caption: '',
    };
  }
  if (inner?.documentMessage || inner?.documentWithCaptionMessage?.message?.documentMessage) {
    const doc = inner?.documentMessage || inner?.documentWithCaptionMessage?.message?.documentMessage;
    return {
      mediaType: 'document',
      mediaMime: doc.mimetype || 'application/octet-stream',
      mediaName: doc.fileName || 'document',
      mediaDurationSec: null,
      caption: doc.caption || '',
    };
  }
  return null;
}

function mediaPlaceholder(mediaType: ConversationMessage['mediaType']): string {
  if (mediaType === 'image') return '\u{1F4F7} Photo';
  if (mediaType === 'video') return '\u{1F3A5} Video';
  if (mediaType === 'voice') return '\u{1F3A4} Voice message';
  if (mediaType === 'audio') return '\u{1F3B5} Audio';
  if (mediaType === 'sticker') return 'Sticker';
  if (mediaType === 'document') return '\u{1F4C4} Document';
  return '';
}

function asIsoTimestamp(value: number | undefined | null): string {
  const num = Number(value || Math.floor(Date.now() / 1000));
  return new Date(num * 1000).toISOString();
}

function mapBaileysStatus(status: unknown): ConversationMessage['status'] | undefined {
  if (typeof status === 'string') {
    const normalized = status.toLowerCase();
    if (['pending', 'sent', 'delivered', 'read', 'played', 'failed'].includes(normalized)) {
      return normalized as ConversationMessage['status'];
    }
    return undefined;
  }

  if (typeof status === 'number') {
    if (status <= 0) return 'failed';
    if (status === 1) return 'pending';
    if (status === 2) return 'sent';
    if (status === 3) return 'delivered';
    if (status === 4) return 'read';
    if (status >= 5) return 'played';
  }

  return undefined;
}

function buildStatusTimestamps(status: ConversationMessage['status'] | undefined, atIso: string) {
  return {
    sentAt: status === 'sent' || status === 'delivered' || status === 'read' || status === 'played' ? atIso : null,
    deliveredAt: status === 'delivered' || status === 'read' || status === 'played' ? atIso : null,
    readAt: status === 'read' || status === 'played' ? atIso : null,
    playedAt: status === 'played' ? atIso : null,
    failedAt: status === 'failed' ? atIso : null,
  };
}

function statusRank(status: ConversationMessage['status'] | undefined): number {
  if (status === 'failed') return 0;
  if (status === 'pending') return 1;
  if (status === 'sent') return 2;
  if (status === 'delivered') return 3;
  if (status === 'read') return 4;
  if (status === 'played') return 5;
  return -1;
}

function mergeStatus(
  current: ConversationMessage,
  incomingStatus: ConversationMessage['status'] | undefined,
  atIso: string,
): Partial<ConversationMessage> {
  const currentStatus = current.status;
  const currentRank = statusRank(currentStatus);
  const incomingRank = statusRank(incomingStatus);

  let nextStatus = currentStatus;
  if (!currentStatus && incomingStatus) {
    nextStatus = incomingStatus;
  } else if (incomingStatus && incomingRank >= currentRank) {
    nextStatus = incomingStatus;
  }

  const nextStamps = buildStatusTimestamps(nextStatus, atIso);
  return {
    status: nextStatus,
    sentAt: current.sentAt || nextStamps.sentAt,
    deliveredAt: current.deliveredAt || nextStamps.deliveredAt,
    readAt: current.readAt || nextStamps.readAt,
    playedAt: current.playedAt || nextStamps.playedAt,
    failedAt: current.failedAt || nextStamps.failedAt,
  };
}

async function persistMessage(slotId: string, message: ConversationMessage) {
  await prisma.$executeRaw`
    INSERT INTO whatsapp_messages (
      "slotId", "messageId", jid, "fromMe", text, timestamp,
      status, "sentAt", "deliveredAt", "readAt", "playedAt", "failedAt", "failureCode", "failureReason",
      reactions, edited, deleted,
      "mediaType", "mediaMime", "mediaName", "mediaDurationSec", "senderName",
      "quotedId", "quotedPreview", "quotedSender"
    )
    VALUES (
      ${slotId}, ${message.id}, ${message.jid}, ${message.fromMe}, ${message.text || null}, ${new Date(message.timestamp)},
      ${message.status || null},
      ${message.sentAt ? new Date(message.sentAt) : null},
      ${message.deliveredAt ? new Date(message.deliveredAt) : null},
      ${message.readAt ? new Date(message.readAt) : null},
      ${message.playedAt ? new Date(message.playedAt) : null},
      ${message.failedAt ? new Date(message.failedAt) : null},
      ${message.failureCode || null},
      ${message.failureReason || null},
      ${message.reactions?.length ? JSON.stringify(message.reactions) : null},
      ${message.edited ?? null},
      ${message.deleted ?? null},
      ${message.mediaType || null},
      ${message.mediaMime || null},
      ${message.mediaName || null},
      ${message.mediaDurationSec ?? null},
      ${message.senderName || null},
      ${message.quotedId || null},
      ${message.quotedPreview || null},
      ${message.quotedSender || null}
    )
    ON CONFLICT ("slotId", "messageId")
    DO UPDATE SET
      text = COALESCE(EXCLUDED.text, whatsapp_messages.text),
      status = COALESCE(EXCLUDED.status, whatsapp_messages.status),
      "sentAt" = COALESCE(EXCLUDED."sentAt", whatsapp_messages."sentAt"),
      "deliveredAt" = COALESCE(EXCLUDED."deliveredAt", whatsapp_messages."deliveredAt"),
      "readAt" = COALESCE(EXCLUDED."readAt", whatsapp_messages."readAt"),
      "playedAt" = COALESCE(EXCLUDED."playedAt", whatsapp_messages."playedAt"),
      "failedAt" = COALESCE(EXCLUDED."failedAt", whatsapp_messages."failedAt"),
      "failureCode" = COALESCE(EXCLUDED."failureCode", whatsapp_messages."failureCode"),
      "failureReason" = COALESCE(EXCLUDED."failureReason", whatsapp_messages."failureReason"),
      reactions = COALESCE(EXCLUDED.reactions, whatsapp_messages.reactions),
      edited = COALESCE(EXCLUDED.edited, whatsapp_messages.edited),
      deleted = COALESCE(EXCLUDED.deleted, whatsapp_messages.deleted),
      "mediaType" = COALESCE(EXCLUDED."mediaType", whatsapp_messages."mediaType"),
      "mediaMime" = COALESCE(EXCLUDED."mediaMime", whatsapp_messages."mediaMime"),
      "mediaName" = COALESCE(EXCLUDED."mediaName", whatsapp_messages."mediaName"),
      "mediaDurationSec" = COALESCE(EXCLUDED."mediaDurationSec", whatsapp_messages."mediaDurationSec"),
      "senderName" = COALESCE(EXCLUDED."senderName", whatsapp_messages."senderName"),
      "quotedId" = COALESCE(EXCLUDED."quotedId", whatsapp_messages."quotedId"),
      "quotedPreview" = COALESCE(EXCLUDED."quotedPreview", whatsapp_messages."quotedPreview"),
      "quotedSender" = COALESCE(EXCLUDED."quotedSender", whatsapp_messages."quotedSender")
  `;
}

function updateMessageInCache(
  slotId: string,
  messageId: string,
  patch: Partial<ConversationMessage>,
): ConversationMessage | null {
  const cache = cacheForSlot(slotId);
  for (const [jid, list] of cache.messages.entries()) {
    const idx = list.findIndex((msg) => msg.id === messageId);
    if (idx === -1) continue;
    const next = { ...list[idx], ...patch };
    const updatedList = [...list];
    updatedList[idx] = next;
    cache.messages.set(jid, updatedList);
    return next;
  }
  return null;
}

function findMessageInCache(slotId: string, messageId: string): ConversationMessage | null {
  const cache = cacheForSlot(slotId);
  for (const list of cache.messages.values()) {
    const msg = list.find((item) => item.id === messageId);
    if (msg) return msg;
  }
  return null;
}

function onBaileysStatusUpdate(slotId: string, update: any) {
  const messageId = update?.key?.id;
  if (!messageId) return;

  const existing = findMessageInCache(slotId, messageId);
  if (!existing) {
    // Message not in memory (e.g. right after restart) — persist status straight to DB.
    const mapped = mapBaileysStatus(update?.update?.status ?? update?.status);
    if (mapped && update?.key?.fromMe) {
      applyStatusDirectToDb(slotId, messageId, update?.key?.remoteJid || '', mapped);
    }
    return;
  }

  const jid = update?.key?.remoteJid || existing.jid;

  const mappedStatus = mapBaileysStatus(update?.update?.status ?? update?.status);
  if (!mappedStatus) return;

  // For outbound messages, read/played from messages.update is a valid receipt signal.
  // For non-outbound updates, cap at delivered to avoid false blue ticks.
  const status: ConversationMessage['status'] =
    (mappedStatus === 'read' || mappedStatus === 'played')
      ? (existing.fromMe ? mappedStatus : 'delivered')
      : mappedStatus;
  if (!status) return;

  const atIso = new Date().toISOString();
  const patch: Partial<ConversationMessage> = mergeStatus(existing, status, atIso);

  const updated = updateMessageInCache(slotId, messageId, patch);
  if (!updated) return;

  const statusEvent: WhatsAppMessageStatusEvent = {
    slotId,
    jid,
    messageId,
    status: updated.status || status,
    sentAt: updated.sentAt || null,
    deliveredAt: updated.deliveredAt || null,
    readAt: updated.readAt || null,
    playedAt: updated.playedAt || null,
    failedAt: updated.failedAt || null,
    failureCode: updated.failureCode || null,
    failureReason: updated.failureReason || null,
  };

  whatsappEvents.emit('message_status', statusEvent);

  persistMessage(slotId, updated).catch(() => {
    // Do not block realtime processing for status persistence issues.
  });
}

function applyStatusDirectToDb(
  slotId: string,
  messageId: string,
  jid: string,
  status: NonNullable<ConversationMessage['status']>,
) {
  const now = new Date();
  const stamps = buildStatusTimestamps(status, now.toISOString());
  prisma.$executeRaw`
    UPDATE whatsapp_messages SET
      status = CASE
        WHEN status IN ('read', 'played') AND ${status} IN ('sent', 'delivered', 'pending') THEN status
        ELSE ${status}
      END,
      "sentAt" = COALESCE("sentAt", ${stamps.sentAt ? now : null}),
      "deliveredAt" = COALESCE("deliveredAt", ${stamps.deliveredAt ? now : null}),
      "readAt" = COALESCE("readAt", ${stamps.readAt ? now : null}),
      "playedAt" = COALESCE("playedAt", ${stamps.playedAt ? now : null})
    WHERE "slotId" = ${slotId} AND "messageId" = ${messageId}
  `.then((count) => {
    if (!count) return;
    const statusEvent: WhatsAppMessageStatusEvent = {
      slotId,
      jid,
      messageId,
      status,
      sentAt: stamps.sentAt,
      deliveredAt: stamps.deliveredAt,
      readAt: stamps.readAt,
      playedAt: stamps.playedAt,
      failedAt: null,
      failureCode: null,
      failureReason: null,
    };
    whatsappEvents.emit('message_status', statusEvent);
  }).catch(() => { /* non-blocking */ });
}

function onBaileysReceiptUpdate(slotId: string, updates: any[]) {
  (updates || []).forEach((entry) => {
    const messageId = entry?.key?.id;
    if (!messageId) return;

    const existing = findMessageInCache(slotId, messageId);

    const jid = entry?.key?.remoteJid || existing?.jid || '';

    const receipts = Array.isArray(entry?.receipt)
      ? entry.receipt
      : (entry?.receipt ? [entry.receipt] : []);

    const pickReceiptField = (field: string) => {
      const fromEntry = (entry as any)?.[field];
      if (fromEntry) return fromEntry;
      for (const rec of receipts) {
        if (rec?.[field]) return rec[field];
      }
      return null;
    };

    const readTs = pickReceiptField('readTimestamp');
    const playedTs = pickReceiptField('playedTimestamp');
    const deliveredTs = pickReceiptField('receiptTimestamp') || pickReceiptField('deliveryTimestamp');

    let status: ConversationMessage['status'] = 'delivered';
    if (playedTs) status = 'played';
    else if (readTs) status = 'read';
    else if (deliveredTs) status = 'delivered';

    if (!existing) {
      applyStatusDirectToDb(slotId, messageId, jid, status);
      return;
    }

    const atIso = asIsoTimestamp(playedTs || readTs || deliveredTs || Math.floor(Date.now() / 1000));
    const patch: Partial<ConversationMessage> = mergeStatus(existing, status, atIso);

    const updated = updateMessageInCache(slotId, messageId, patch);
    if (!updated) return;

    const statusEvent: WhatsAppMessageStatusEvent = {
      slotId,
      jid,
      messageId,
      status: updated.status || status,
      sentAt: updated.sentAt || null,
      deliveredAt: updated.deliveredAt || null,
      readAt: updated.readAt || null,
      playedAt: updated.playedAt || null,
      failedAt: updated.failedAt || null,
      failureCode: updated.failureCode || null,
      failureReason: updated.failureReason || null,
    };

    whatsappEvents.emit('message_status', statusEvent);

    persistMessage(slotId, updated).catch(() => {
      // Do not block realtime processing for status persistence issues.
    });
  });
}

function emitMessageUpdated(slotId: string, jid: string, message: ConversationMessage) {
  const { raw: _raw, ...safe } = message;
  const event: WhatsAppMessageEvent = { slotId, jid, message: safe as ConversationMessage };
  whatsappEvents.emit('message', event);
  persistMessage(slotId, message).catch(() => { /* non-blocking */ });
}

function handleProtocolSideEffects(slotId: string, raw: any): boolean {
  const jid = raw?.key?.remoteJid;
  if (!jid) return false;

  // Inbound/outbound reaction — attach emoji to target message, no new bubble.
  const reaction = raw?.message?.reactionMessage;
  if (reaction?.key?.id) {
    const target = findMessageInCache(slotId, reaction.key.id);
    if (target) {
      const emoji = String(reaction.text || '');
      const existing = target.reactions || [];
      const nextReactions = emoji
        ? [...existing.filter((item) => item !== emoji), emoji]
        : existing; // empty text = reaction removed; keep simple by leaving list
      const updated = updateMessageInCache(slotId, reaction.key.id, {
        reactions: emoji ? nextReactions : [],
      });
      if (updated) emitMessageUpdated(slotId, updated.jid, updated);
    }
    return true;
  }

  const protocol = raw?.message?.protocolMessage;
  if (protocol) {
    // Revoke (delete for everyone)
    const isRevoke = protocol.type === 0 || protocol.type === 'REVOKE';
    if (isRevoke && protocol.key?.id) {
      const updated = updateMessageInCache(slotId, protocol.key.id, {
        text: 'This message was deleted',
        deleted: true,
      });
      if (updated) emitMessageUpdated(slotId, updated.jid, updated);
      return true;
    }

    // Edit
    const editedText = extractText(protocol.editedMessage);
    if (protocol.key?.id && editedText) {
      const updated = updateMessageInCache(slotId, protocol.key.id, {
        text: editedText,
        edited: true,
      });
      if (updated) emitMessageUpdated(slotId, updated.jid, updated);
      return true;
    }

    return true; // other protocol messages (e.g. history sync notifications) — skip bubble
  }

  return false;
}

function extractQuoted(message: any): { quotedId: string | null; quotedPreview: string | null; quotedSender: string | null } {
  const none = { quotedId: null, quotedPreview: null, quotedSender: null };
  if (!message) return none;
  const content = message?.ephemeralMessage?.message || message?.viewOnceMessage?.message || message?.viewOnceMessageV2?.message || message;
  for (const value of Object.values(content || {})) {
    const ctx = (value as any)?.contextInfo;
    if (ctx?.stanzaId) {
      const quotedMsg = ctx.quotedMessage;
      const quotedMedia = quotedMsg ? detectMedia(quotedMsg) : null;
      const preview = (quotedMsg ? extractText(quotedMsg) : '') || (quotedMedia ? `${mediaPlaceholder(quotedMedia.mediaType)}${quotedMedia.caption ? ` ${quotedMedia.caption}` : ''}` : '');
      return {
        quotedId: String(ctx.stanzaId),
        quotedPreview: preview || 'Message',
        quotedSender: ctx.participant ? String(ctx.participant).split('@')[0].split(':')[0] : null,
      };
    }
  }
  return none;
}

function upsertMessage(slotId: string, raw: any) {
  const jid = raw?.key?.remoteJid;
  if (!jid) return;

  if (handleProtocolSideEffects(slotId, raw)) return;

  markLiveChatJids(slotId, [jid]);

  const fromMe = Boolean(raw?.key?.fromMe);
  const media = detectMedia(raw?.message);
  const text = media ? media.caption : extractText(raw?.message);
  const timestamp = asIsoTimestamp(raw?.messageTimestamp);
  const id = raw?.key?.id || `${jid}:${timestamp}:${fromMe ? 'me' : 'them'}`;
  const incomingStatus = mapBaileysStatus(raw?.status);
  const senderName = !fromMe && jid.endsWith('@g.us') ? (raw?.pushName || raw?.key?.participant?.split('@')[0] || null) : null;
  const quoted = extractQuoted(raw?.message);

  const cache = cacheForSlot(slotId);
  const existing = cache.messages.get(jid) || [];
  const current = existing.find((msg) => msg.id === id);
  const mergedStatus = current
    ? mergeStatus(current, incomingStatus, timestamp)
    : {
        status: incomingStatus,
        ...buildStatusTimestamps(incomingStatus, timestamp),
      };

  const next: ConversationMessage = {
    id,
    jid,
    fromMe,
    text: text || current?.text || '',
    timestamp,
    ...mergedStatus,
    failureCode: current?.failureCode || null,
    failureReason: current?.failureReason || null,
    reactions: current?.reactions,
    edited: current?.edited,
    deleted: current?.deleted,
    mediaType: media?.mediaType || current?.mediaType || null,
    mediaMime: media?.mediaMime || current?.mediaMime || null,
    mediaName: media?.mediaName || current?.mediaName || null,
    mediaDurationSec: media?.mediaDurationSec || current?.mediaDurationSec || null,
    senderName: senderName || current?.senderName || null,
    quotedId: quoted.quotedId || current?.quotedId || null,
    quotedPreview: quoted.quotedPreview || current?.quotedPreview || null,
    quotedSender: quoted.quotedSender || current?.quotedSender || null,
    raw: raw?.message ? raw : current?.raw,
  };
  const merged = [...existing.filter((msg) => msg.id !== id), next]
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
    .slice(-MAX_MESSAGES_PER_CHAT);

  cache.messages.set(jid, merged);

  const currentConversation = cache.conversations.get(jid);
  const unread = fromMe ? (currentConversation?.unread || 0) : (currentConversation?.unread || 0) + 1;

  cache.conversations.set(jid, {
    jid,
    title: currentConversation?.title || jid.replace('@s.whatsapp.net', ''),
    lastMessage: text || (next.mediaType ? mediaPlaceholder(next.mediaType) : '') || currentConversation?.lastMessage || '(non-text message)',
    lastMessageAt: timestamp,
    unread,
  });

  const event: WhatsAppMessageEvent = { slotId, jid, message: (({ raw: _raw, ...safe }) => safe as ConversationMessage)(next) };
  whatsappEvents.emit('message', event);

  // Persist to database (fire-and-forget, non-blocking)
  persistMessage(slotId, next).catch(() => { /* ignore DB write errors to not block message flow */ });
}

function upsertConversation(slotId: string, jid: string, patch: Partial<ConversationSummary>) {
  if (!jid) return;
  const cache = cacheForSlot(slotId);
  const current = cache.conversations.get(jid);

  cache.conversations.set(jid, {
    jid,
    title: patch.title || current?.title || jid.replace('@s.whatsapp.net', ''),
    lastMessage: patch.lastMessage ?? current?.lastMessage ?? '',
    lastMessageAt: patch.lastMessageAt || current?.lastMessageAt || new Date().toISOString(),
    unread: typeof patch.unread === 'number' ? patch.unread : (current?.unread || 0),
  });
}

async function closeSocket(session: InMemorySession) {
  clearKeepalive(session);
  if (!session.socket) return;
  try {
    session.socket.ws.close();
  } catch {
    // ignore close failures while tearing down.
  }
  session.socket = null;
}

async function startSession(slotId: string, forceRestart = false): Promise<InMemorySession> {
  let session = sessions.get(slotId);
  if (!session) {
    session = {
      slotId,
      socket: null,
      state: 'created',
      qrPayload: null,
      qrExpiresAt: null,
      lastHeartbeatAt: null,
      reconnectCount: 0,
      waiters: [],
      keepaliveTimer: null,
      keepaliveSocket: null,
      keepalivePongHandler: null,
    };
    sessions.set(slotId, session);
  }

  if (session.socket && !forceRestart) {
    return session;
  }

  if (forceRestart) {
    session.state = 'reconnecting';
    session.qrPayload = null;
    session.qrExpiresAt = null;
  }

  await closeSocket(session);

  const authDir = authDirForSlot(slotId);
  await fs.mkdir(authDir, { recursive: true });

  const { state, saveCreds } = await useMultiFileAuthState(authDir);
  const { version } = await fetchLatestBaileysVersion();

  const socket = makeWASocket({
    auth: state,
    version,
    printQRInTerminal: false,
    browser: ['TeleCRM', 'Chrome', '1.0.0'],
    syncFullHistory: true,
    markOnlineOnConnect: false,
  });

  session.socket = socket;
  // Presence subscriptions are per-connection; force re-subscribe on the new socket.
  slotPresenceSubscriptions.delete(slotId);

  socket.ev.on('creds.update', saveCreds);

  socket.ev.on('presence.update', (update: any) => {
    const jid = update?.id;
    const presences = update?.presences || {};
    if (!jid) return;

    // For 1:1 chats the participant key is the contact jid itself.
    const entry = presences[jid] || Object.values(presences)[0] as any;
    if (!entry) return;

    const known = String(entry.lastKnownPresence || '');
    const presence: WhatsAppPresenceState =
      known === 'composing' ? 'typing'
        : known === 'recording' ? 'recording'
          : known === 'available' ? 'online'
            : known === 'paused' ? 'paused'
              : known === 'unavailable' ? 'offline'
                : 'unknown';

    const lastSeenAt = entry.lastSeen ? new Date(Number(entry.lastSeen) * 1000).toISOString() : null;

    const perSlot = slotPresence.get(slotId) || new Map();
    const previous = perSlot.get(jid);
    perSlot.set(jid, {
      presence,
      lastSeenAt: lastSeenAt || previous?.lastSeenAt || null,
    });
    slotPresence.set(slotId, perSlot);

    const event: WhatsAppPresenceEvent = {
      slotId,
      jid,
      presence,
      lastSeenAt: lastSeenAt || previous?.lastSeenAt || null,
    };
    whatsappEvents.emit('presence', event);
  });

  socket.ev.on('contacts.update', (updates: any[]) => {
    let changed = false;
    (updates || []).forEach((update) => {
      // imgUrl present (even null/'changed') means the profile picture changed.
      if (update && 'imgUrl' in update) changed = true;
    });
    if (changed) {
      // Chats may be keyed by LID while updates arrive on the phone jid; clear the whole slot.
      slotAvatarCache.delete(slotId);
      whatsappEvents.emit('avatar', { slotId });
    }
  });

  socket.ev.on('contacts.upsert', (contacts: any[]) => {
    const cache = cacheForSlot(slotId);
    contacts.forEach((contact) => {
      const jid = contact?.id;
      if (!jid) return;
      const current = cache.conversations.get(jid);
      if (!current) return;
      cache.conversations.set(jid, {
        ...current,
        title: contact?.notify || contact?.name || current.title,
      });
    });
  });

  socket.ev.on('chats.upsert', (chats: any[]) => {
    const liveJids: string[] = [];
    chats.forEach((chat) => {
      const jid = chat?.id;
      if (!jid) return;
      liveJids.push(jid);
      const ts = asIsoTimestamp(chat?.conversationTimestamp || chat?.timestamp);
      upsertConversation(slotId, jid, {
        title: chat?.name,
        lastMessageAt: ts,
        unread: Number(chat?.unreadCount || 0),
      });
    });

    markLiveChatJids(slotId, liveJids);
    pruneCacheToLiveChats(slotId);
  });

  socket.ev.on('groups.upsert', (groups: any[]) => {
    (groups || []).forEach((group) => {
      const jid = group?.id;
      if (!jid || !group?.subject) return;
      upsertConversation(slotId, jid, { title: group.subject });
    });
  });

  socket.ev.on('groups.update', (updates: any[]) => {
    (updates || []).forEach((update) => {
      const jid = update?.id;
      if (!jid || !update?.subject) return;
      upsertConversation(slotId, jid, { title: update.subject });
    });
  });

  socket.ev.on('messaging-history.set', (history: any) => {
    const liveJids: string[] = [];
    (history?.chats || []).forEach((chat: any) => {
      const jid = chat?.id;
      if (!jid) return;
      liveJids.push(jid);
      const ts = asIsoTimestamp(chat?.conversationTimestamp || chat?.timestamp);
      upsertConversation(slotId, jid, {
        title: chat?.name,
        lastMessageAt: ts,
        unread: Number(chat?.unreadCount || 0),
      });
    });

    markLiveChatJids(slotId, liveJids);
    pruneCacheToLiveChats(slotId);

    (history?.messages || []).forEach((msg: any) => upsertMessage(slotId, msg));
  });

  socket.ev.on('messages.upsert', (payload: any) => {
    const messages = payload?.messages || [];
    messages.forEach((msg: any) => upsertMessage(slotId, msg));
  });

  socket.ev.on('messages.update', (updates: any[]) => {
    (updates || []).forEach((update) => onBaileysStatusUpdate(slotId, update));
  });

  socket.ev.on('message-receipt.update', (updates: any[]) => {
    onBaileysReceiptUpdate(slotId, updates || []);
  });

  socket.ev.on('connection.update', (update) => {
    if (update.qr) {
      console.info(`[whatsapp] slot=${slotId} qr_ready`);
      session!.state = 'qr_ready';
      session!.qrPayload = update.qr;
      session!.qrExpiresAt = new Date(Date.now() + 60_000);
      notify(session!);
      return;
    }

    if (update.connection === 'connecting') {
      session!.state = 'pairing';
      notify(session!);
      return;
    }

    if (update.connection === 'open') {
      console.info(`[whatsapp] slot=${slotId} connected`);
      session!.state = 'connected';
      session!.qrPayload = null;
      session!.qrExpiresAt = null;
      session!.lastHeartbeatAt = new Date();
      session!.reconnectCount = 0;
      startKeepalive(session!, socket);
      notify(session!);

      // Warm in-memory cache from DB so agents see chats immediately after restart
      prisma.$queryRaw<Array<{
        messageId: string;
        jid: string;
        fromMe: boolean;
        text: string | null;
        timestamp: Date;
        status: ConversationMessage['status'] | null;
        sentAt: Date | null;
        deliveredAt: Date | null;
        readAt: Date | null;
        playedAt: Date | null;
        failedAt: Date | null;
        reactions: string | null;
        edited: boolean | null;
        deleted: boolean | null;
        mediaType: ConversationMessage['mediaType'] | null;
        mediaMime: string | null;
        mediaName: string | null;
        mediaDurationSec: number | null;
        senderName: string | null;
        quotedId: string | null;
        quotedPreview: string | null;
        quotedSender: string | null;
      }>>`
        SELECT "messageId", jid, "fromMe", text, timestamp,
               status, "sentAt", "deliveredAt", "readAt", "playedAt", "failedAt",
               reactions, edited, deleted,
               "mediaType", "mediaMime", "mediaName", "mediaDurationSec", "senderName",
               "quotedId", "quotedPreview", "quotedSender"
        FROM whatsapp_messages
        WHERE "slotId" = ${slotId}
        ORDER BY timestamp ASC
        LIMIT 2000
      `.then((rows) => {
        const cache = cacheForSlot(slotId);
        if (cache.messages.size > 0) return; // already populated by live events
        rows.forEach((row) => {
          const restored: ConversationMessage = {
            id: row.messageId,
            jid: row.jid,
            fromMe: row.fromMe,
            text: row.text || '',
            timestamp: row.timestamp.toISOString(),
            status: row.status || undefined,
            sentAt: row.sentAt?.toISOString() || null,
            deliveredAt: row.deliveredAt?.toISOString() || null,
            readAt: row.readAt?.toISOString() || null,
            playedAt: row.playedAt?.toISOString() || null,
            failedAt: row.failedAt?.toISOString() || null,
            reactions: row.reactions ? (() => { try { return JSON.parse(row.reactions) as string[]; } catch { return undefined; } })() : undefined,
            edited: row.edited ?? undefined,
            deleted: row.deleted ?? undefined,
            mediaType: row.mediaType || null,
            mediaMime: row.mediaMime || null,
            mediaName: row.mediaName || null,
            mediaDurationSec: row.mediaDurationSec ?? null,
            senderName: row.senderName || null,
            quotedId: row.quotedId || null,
            quotedPreview: row.quotedPreview || null,
            quotedSender: row.quotedSender || null,
          };
          const list = cache.messages.get(row.jid) || [];
          if (!list.some((item) => item.id === restored.id)) {
            cache.messages.set(row.jid, [...list, restored]);
          }
          upsertConversation(slotId, row.jid, {
            lastMessage: restored.text,
            lastMessageAt: restored.timestamp,
          });
        });
        pruneCacheToLiveChats(slotId);
        console.info(`[whatsapp] slot=${slotId} loaded ${rows.length} messages from DB`);
      }).catch(() => { /* non-critical */ });

      return;
    }

    if (update.connection === 'close') {
      const statusCode = (update.lastDisconnect?.error as any)?.output?.statusCode
        ?? (update.lastDisconnect?.error as any)?.data?.statusCode
        ?? (update.lastDisconnect?.error as any)?.statusCode;
      const shouldTerminate = statusCode === DisconnectReason.loggedOut || statusCode === 401;

      console.warn(
        `[whatsapp] slot=${slotId} connection_closed statusCode=${statusCode ?? 'unknown'} terminate=${shouldTerminate}`,
      );

      session!.state = shouldTerminate ? 'terminated' : 'degraded';
      clearKeepalive(session!);
      if (shouldTerminate) {
        session!.qrPayload = null;
        session!.qrExpiresAt = null;
      }
      notify(session!);

      if (!shouldTerminate) {
        queueReconnectAttempt(slotId, socket);
      }
    }
  });

  return session;
}

export async function initWhatsAppSession(slotId: string): Promise<SessionSnapshot> {
  const session = await startSession(slotId, false);
  return toSnapshot(session);
}

export async function reconnectWhatsAppSession(slotId: string): Promise<SessionSnapshot> {
  const session = await startSession(slotId, true);
  return toSnapshot(session);
}

export async function waitForWhatsAppUpdate(slotId: string, timeoutMs = 15_000): Promise<SessionSnapshot> {
  const session = sessions.get(slotId);
  if (!session) {
    return initWhatsAppSession(slotId);
  }

  if (
    session.qrPayload
    || session.state === 'connected'
    || session.state === 'terminated'
    || session.state === 'disconnected'
    || session.state === 'degraded'
  ) {
    return toSnapshot(session);
  }

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      session.waiters = session.waiters.filter((fn) => fn !== onUpdate);
      resolve(toSnapshot(session));
    }, timeoutMs);

    const onUpdate = (snapshot: SessionSnapshot) => {
      const shouldResolve = Boolean(snapshot.qrPayload)
        || snapshot.state === 'connected'
        || snapshot.state === 'terminated'
        || snapshot.state === 'disconnected'
        || snapshot.state === 'degraded';

      if (!shouldResolve) {
        return;
      }

      clearTimeout(timer);
      session.waiters = session.waiters.filter((fn) => fn !== onUpdate);
      resolve(snapshot);
    };

    session.waiters.push(onUpdate);
  });
}

export async function terminateWhatsAppSession(slotId: string): Promise<void> {
  const session = sessions.get(slotId);
  if (session) {
    session.state = 'terminated';
    session.qrPayload = null;
    session.qrExpiresAt = null;
    notify(session);
    await closeSocket(session);
    sessions.delete(slotId);
  }

  slotLiveChatJids.delete(slotId);
  slotPresence.delete(slotId);
  slotPresenceSubscriptions.delete(slotId);
  slotAvatarCache.delete(slotId);

  const authDir = authDirForSlot(slotId);
  await fs.rm(authDir, { recursive: true, force: true });
}

export function getWhatsAppSessionSnapshot(slotId: string): SessionSnapshot | null {
  const session = sessions.get(slotId);
  return session ? toSnapshot(session) : null;
}

export function listSlotConversations(slotId: string): ConversationSummary[] {
  const cache = slotCaches.get(slotId);
  if (!cache) return [];

  if (cache.conversations.size === 0 && cache.messages.size > 0) {
    cache.messages.forEach((msgs, jid) => {
      const last = msgs[msgs.length - 1];
      if (!last) return;
      upsertConversation(slotId, jid, {
        lastMessage: last.text,
        lastMessageAt: last.timestamp,
      });
    });
  }

  return [...cache.conversations.values()].sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt));
}

export async function listSlotConversationsWithDbFallback(slotId: string): Promise<ConversationSummary[]> {
  const mem = listSlotConversations(slotId);
  if (mem.length > 0) return mem;

  // Fall back to DB — derive conversations from persisted messages
  const rows = await prisma.$queryRaw<Array<{ jid: string; text: string | null; ts: Date }>>`
    SELECT jid, text, timestamp as ts
    FROM whatsapp_messages
    WHERE "slotId" = ${slotId}
    AND timestamp = (
      SELECT MAX(m2.timestamp) FROM whatsapp_messages m2
      WHERE m2."slotId" = ${slotId} AND m2.jid = whatsapp_messages.jid
    )
    ORDER BY ts DESC
    LIMIT 200
  `;

  const cache = cacheForSlot(slotId);
  rows.forEach((row) => {
    upsertConversation(slotId, row.jid, {
      lastMessage: row.text || '',
      lastMessageAt: row.ts.toISOString(),
    });
  });

  return [...cache.conversations.values()].sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt));
}

export function listSlotMessages(slotId: string, jid: string): ConversationMessage[] {
  const cache = slotCaches.get(slotId);
  if (!cache) return [];
  return cache.messages.get(jid) || [];
}

export async function listSlotMessagesWithDbFallback(slotId: string, jid: string): Promise<ConversationMessage[]> {
  const mem = listSlotMessages(slotId, jid);
  if (mem.length > 0) return mem;

  // Fall back to DB
  const rows = await prisma.$queryRaw<Array<{
    messageId: string;
    jid: string;
    fromMe: boolean;
    text: string | null;
    timestamp: Date;
    status: ConversationMessage['status'] | null;
    sentAt: Date | null;
    deliveredAt: Date | null;
    readAt: Date | null;
    playedAt: Date | null;
    failedAt: Date | null;
    failureCode: string | null;
    failureReason: string | null;
    reactions: string | null;
    edited: boolean | null;
    deleted: boolean | null;
    mediaType: ConversationMessage['mediaType'] | null;
    mediaMime: string | null;
    mediaName: string | null;
    mediaDurationSec: number | null;
    senderName: string | null;
    quotedId: string | null;
    quotedPreview: string | null;
    quotedSender: string | null;
  }>>`
    SELECT
      "messageId",
      jid,
      "fromMe",
      text,
      timestamp,
      status,
      "sentAt",
      "deliveredAt",
      "readAt",
      "playedAt",
      "failedAt",
      "failureCode",
      "failureReason",
      reactions,
      edited,
      deleted,
      "mediaType",
      "mediaMime",
      "mediaName",
      "mediaDurationSec",
      "senderName",
      "quotedId",
      "quotedPreview",
      "quotedSender"
    FROM whatsapp_messages
    WHERE "slotId" = ${slotId} AND jid = ${jid}
    ORDER BY timestamp ASC
    LIMIT 200
  `;

  const msgs: ConversationMessage[] = rows.map((row) => ({
    id: row.messageId,
    jid: row.jid,
    fromMe: row.fromMe,
    text: row.text || '',
    timestamp: row.timestamp.toISOString(),
    status: row.status || undefined,
    sentAt: row.sentAt?.toISOString() || null,
    deliveredAt: row.deliveredAt?.toISOString() || null,
    readAt: row.readAt?.toISOString() || null,
    playedAt: row.playedAt?.toISOString() || null,
    failedAt: row.failedAt?.toISOString() || null,
    failureCode: row.failureCode,
    failureReason: row.failureReason,
    reactions: row.reactions ? (() => { try { return JSON.parse(row.reactions) as string[]; } catch { return undefined; } })() : undefined,
    edited: row.edited ?? undefined,
    deleted: row.deleted ?? undefined,
    mediaType: row.mediaType || null,
    mediaMime: row.mediaMime || null,
    mediaName: row.mediaName || null,
    mediaDurationSec: row.mediaDurationSec ?? null,
    senderName: row.senderName || null,
    quotedId: row.quotedId || null,
    quotedPreview: row.quotedPreview || null,
    quotedSender: row.quotedSender || null,
  }));

  // Populate in-memory cache
  const cache = cacheForSlot(slotId);
  cache.messages.set(jid, msgs);

  return msgs;
}

export async function listSlotMessagesBefore(
  slotId: string,
  jid: string,
  before: string,
  limit: number,
): Promise<{ messages: ConversationMessage[]; hasMore: boolean }> {
  const beforeDate = new Date(before);
  if (Number.isNaN(beforeDate.getTime())) {
    return { messages: [], hasMore: false };
  }
  const take = Math.min(Math.max(limit, 1), 100);

  const rows = await prisma.$queryRaw<Array<{
    messageId: string;
    jid: string;
    fromMe: boolean;
    text: string | null;
    timestamp: Date;
    status: ConversationMessage['status'] | null;
    sentAt: Date | null;
    deliveredAt: Date | null;
    readAt: Date | null;
    playedAt: Date | null;
    failedAt: Date | null;
    failureCode: string | null;
    failureReason: string | null;
    reactions: string | null;
    edited: boolean | null;
    deleted: boolean | null;
    mediaType: ConversationMessage['mediaType'] | null;
    mediaMime: string | null;
    mediaName: string | null;
    mediaDurationSec: number | null;
    senderName: string | null;
    quotedId: string | null;
    quotedPreview: string | null;
    quotedSender: string | null;
  }>>`
    SELECT
      "messageId",
      jid,
      "fromMe",
      text,
      timestamp,
      status,
      "sentAt",
      "deliveredAt",
      "readAt",
      "playedAt",
      "failedAt",
      "failureCode",
      "failureReason",
      reactions,
      edited,
      deleted,
      "mediaType",
      "mediaMime",
      "mediaName",
      "mediaDurationSec",
      "senderName",
      "quotedId",
      "quotedPreview",
      "quotedSender"
    FROM whatsapp_messages
    WHERE "slotId" = ${slotId} AND jid = ${jid} AND timestamp < ${beforeDate}
    ORDER BY timestamp DESC
    LIMIT ${take + 1}
  `;

  const hasMore = rows.length > take;
  const page = rows.slice(0, take).reverse();

  const messages: ConversationMessage[] = page.map((row) => ({
    id: row.messageId,
    jid: row.jid,
    fromMe: row.fromMe,
    text: row.text || '',
    timestamp: row.timestamp.toISOString(),
    status: row.status || undefined,
    sentAt: row.sentAt?.toISOString() || null,
    deliveredAt: row.deliveredAt?.toISOString() || null,
    readAt: row.readAt?.toISOString() || null,
    playedAt: row.playedAt?.toISOString() || null,
    failedAt: row.failedAt?.toISOString() || null,
    failureCode: row.failureCode,
    failureReason: row.failureReason,
    reactions: row.reactions ? (() => { try { return JSON.parse(row.reactions) as string[]; } catch { return undefined; } })() : undefined,
    edited: row.edited ?? undefined,
    deleted: row.deleted ?? undefined,
    mediaType: row.mediaType || null,
    mediaMime: row.mediaMime || null,
    mediaName: row.mediaName || null,
    mediaDurationSec: row.mediaDurationSec ?? null,
    senderName: row.senderName || null,
    quotedId: row.quotedId || null,
    quotedPreview: row.quotedPreview || null,
    quotedSender: row.quotedSender || null,
  }));

  return { messages, hasMore };
}

export async function sendSlotTextMessage(slotId: string, jid: string, text: string): Promise<void> {
  const session = sessions.get(slotId);
  if (!session?.socket) {
    throw new Error('WhatsApp session is not active');
  }

  const sent = await session.socket.sendMessage(jid, { text });

  // Mirror optimistic outbound message into cache.
  const messageId = sent?.key?.id || `local-${Date.now()}`;
  const sentAt = asIsoTimestamp((sent as any)?.messageTimestamp);
  upsertMessage(slotId, {
    key: { remoteJid: jid, fromMe: true, id: messageId },
    message: { conversation: text },
    messageTimestamp: Math.floor(new Date(sentAt).getTime() / 1000),
    status: 'sent',
  });
}

function normalizeMentionJids(mentions?: string[]) {
  if (!mentions?.length) return undefined;
  const normalized = mentions
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => (value.includes('@') ? value : `${value}@s.whatsapp.net`));
  return normalized.length ? normalized : undefined;
}

function findQuotedMessage(slotId: string, messageId?: string): any | undefined {
  if (!messageId) return undefined;
  const msg = findMessageInCache(slotId, messageId);
  if (!msg) return undefined;
  // Prefer the real proto — WhatsApp renders the exact original quote.
  if (msg.raw?.message) return msg.raw;
  return {
    key: { id: msg.id, fromMe: msg.fromMe, remoteJid: msg.jid },
    messageTimestamp: Math.floor(new Date(msg.timestamp).getTime() / 1000),
    message: { conversation: msg.text || '' },
  };
}

export async function sendSlotPayloadMessage(
  slotId: string,
  payload: OutboundSendPayload,
): Promise<{ messageId: string; to: string; status: string }> {
  const session = sessions.get(slotId);
  if (!session?.socket) {
    throw new Error('WhatsApp session is not active');
  }

  if (payload.sendAt && new Date(payload.sendAt).getTime() > Date.now()) {
    throw new Error('SCHEDULED_SEND_EXTERNAL_REQUIRED');
  }

  const mentions = normalizeMentionJids(payload.mentions);
  const quoted = findQuotedMessage(slotId, payload.quotedMessageId);
  const options: any = {};
  if (quoted) options.quoted = quoted;

  let content: any;

  if (payload.type === 'text') {
    content = {
      text: payload.text || '',
      mentions,
    };
  } else if (payload.type === 'image' || payload.type === 'video') {
    const mediaField = payload.type;
    content = {
      [mediaField]: payload.mediaUrl ? { url: payload.mediaUrl } : undefined,
      caption: payload.caption,
      mimetype: payload.mime,
      mentions,
    };
  } else if (payload.type === 'audio') {
    content = {
      audio: payload.mediaUrl ? { url: payload.mediaUrl } : undefined,
      mimetype: payload.mime || 'audio/ogg; codecs=opus',
      ptt: Boolean(payload.ptt),
    };
  } else if (payload.type === 'document') {
    content = {
      document: payload.mediaUrl ? { url: payload.mediaUrl } : undefined,
      mimetype: payload.mime,
      fileName: payload.filename || 'file',
      caption: payload.caption,
    };
  } else if (payload.type === 'sticker') {
    content = {
      sticker: payload.mediaUrl ? { url: payload.mediaUrl } : undefined,
    };
  } else if (payload.type === 'contact') {
    content = {
      contacts: {
        displayName: payload.name || 'Contact',
        contacts: [{ vcard: payload.vcard || '' }],
      },
    };
  } else if (payload.type === 'location') {
    content = {
      location: {
        degreesLatitude: payload.latitude,
        degreesLongitude: payload.longitude,
        name: payload.name,
        address: payload.address,
      },
    };
  } else if (payload.type === 'poll') {
    content = {
      poll: {
        name: payload.question || '',
        values: payload.options || [],
        selectableCount: payload.selectableCount || 1,
      },
    };
  } else if (payload.type === 'reaction') {
    const reactionTarget = payload.messageId ? findMessageInCache(slotId, payload.messageId) : null;
    content = {
      react: {
        text: payload.emoji || '',
        key: reactionTarget?.raw?.key || {
          remoteJid: payload.to,
          id: payload.messageId,
          fromMe: reactionTarget ? reactionTarget.fromMe : false,
        },
      },
    };
  } else {
    throw new Error('Unsupported message type');
  }

  if (payload.type === 'image' || payload.type === 'video' || payload.type === 'audio' || payload.type === 'document' || payload.type === 'sticker') {
    if (!payload.mediaUrl) {
      throw new Error('media_url is required for media message');
    }
  }

  if (payload.type === 'reaction' && !payload.messageId) {
    throw new Error('messageId is required for reaction');
  }

  if (payload.type === 'location' && (typeof payload.latitude !== 'number' || typeof payload.longitude !== 'number')) {
    throw new Error('latitude and longitude are required for location');
  }

  if (payload.type === 'poll' && (!payload.question || !payload.options || payload.options.length < 2)) {
    throw new Error('poll requires question and at least 2 options');
  }

  const sent = await session.socket.sendMessage(payload.to, content, options);
  const messageId = sent?.key?.id || `local-${Date.now()}`;

  if (payload.type === 'reaction') {
    // Optimistically attach the reaction to the target message so the UI updates immediately.
    if (payload.messageId) {
      const target = findMessageInCache(slotId, payload.messageId);
      if (target) {
        const emoji = (payload.emoji || '').trim();
        const existing = target.reactions || [];
        const updated = updateMessageInCache(slotId, payload.messageId, {
          reactions: emoji ? [...existing.filter((item) => item !== emoji), emoji] : [],
        });
        if (updated) emitMessageUpdated(slotId, updated.jid, updated);
      }
    }
  } else {
    const previewText = payload.type === 'text'
      ? (payload.text || '')
      : payload.type === 'poll'
        ? `Poll: ${payload.question || ''}`
        : payload.type === 'location'
          ? `Location: ${payload.name || `${payload.latitude},${payload.longitude}`}`
          : payload.type === 'contact'
            ? `Contact: ${payload.name || ''}`
            : payload.type === 'audio'
              ? 'Audio'
              : payload.type === 'image'
                ? (payload.caption || 'Photo')
                : payload.type === 'video'
                  ? (payload.caption || 'Video')
                  : payload.type === 'sticker'
                    ? 'Sticker'
                    : (payload.caption || `Attachment: ${payload.filename || 'file'}`);

    upsertMessage(slotId, {
      key: { remoteJid: payload.to, fromMe: true, id: messageId },
      message: { conversation: previewText },
      messageTimestamp: Math.floor(Date.now() / 1000),
      status: 'sent',
    });
  }

  return {
    messageId,
    to: payload.to,
    status: 'sent',
  };
}

export async function sendSlotMediaMessage(
  slotId: string,
  jid: string,
  file: { buffer: Buffer; mimetype: string; originalname: string; caption?: string; voiceNote?: boolean },
): Promise<void> {
  const session = sessions.get(slotId);
  if (!session?.socket) {
    throw new Error('WhatsApp session is not active');
  }

  const caption = file.caption?.trim() || undefined;
  let payload: Record<string, unknown>;
  let echo: Record<string, unknown>;

  if (file.mimetype.startsWith('image/')) {
    payload = { image: file.buffer, caption };
    echo = { imageMessage: { caption, mimetype: file.mimetype } };
  } else if (file.mimetype.startsWith('video/')) {
    payload = { video: file.buffer, caption };
    echo = { videoMessage: { caption, mimetype: file.mimetype } };
  } else if (file.mimetype.startsWith('audio/')) {
    const audioMime = file.mimetype.toLowerCase();
    const supportedAudio = [
      'audio/ogg',
      'audio/opus',
      'audio/mpeg',
      'audio/mp3',
      'audio/mp4',
      'audio/aac',
      'audio/wav',
      'audio/x-wav',
      'audio/webm',
    ].some((type) => audioMime.includes(type));

    if (supportedAudio) {
      payload = { audio: file.buffer, mimetype: file.mimetype, ptt: Boolean(file.voiceNote) };
      echo = { audioMessage: { mimetype: file.mimetype, ptt: Boolean(file.voiceNote) } };
    } else {
      payload = {
        document: file.buffer,
        mimetype: file.mimetype,
        fileName: file.originalname,
        caption,
      };
      echo = { documentMessage: { fileName: file.originalname, caption, mimetype: file.mimetype } };
    }
  } else {
    payload = {
      document: file.buffer,
      mimetype: file.mimetype,
      fileName: file.originalname,
      caption,
    };
    echo = { documentMessage: { fileName: file.originalname, caption, mimetype: file.mimetype } };
  }

  let sent: any;
  try {
    sent = await session.socket.sendMessage(jid, payload as any);
  } catch {
    // Some media codecs fail on direct media send; document fallback keeps delivery reliable.
    sent = await session.socket.sendMessage(jid, {
      document: file.buffer,
      mimetype: file.mimetype,
      fileName: file.originalname,
      caption,
    } as any);
    echo = { documentMessage: { fileName: file.originalname, caption, mimetype: file.mimetype } };
  }

  const messageId = sent?.key?.id || `local-${Date.now()}`;
  const sentAt = asIsoTimestamp((sent as any)?.messageTimestamp);

  // Save the outbound buffer to the media disk cache so the agent's bubble renders instantly.
  await cacheOutboundMedia(slotId, messageId, file.buffer);

  upsertMessage(slotId, {
    key: { remoteJid: jid, fromMe: true, id: messageId },
    message: echo,
    messageTimestamp: Math.floor(new Date(sentAt).getTime() / 1000),
    status: 'sent',
  });
}

export function onWhatsAppMessage(listener: (event: WhatsAppMessageEvent) => void) {
  whatsappEvents.on('message', listener);
  return () => {
    whatsappEvents.off('message', listener);
  };
}

export function onWhatsAppSessionChange(listener: (event: WhatsAppSessionEvent) => void) {
  whatsappEvents.on('session', listener);
  return () => {
    whatsappEvents.off('session', listener);
  };
}

export function onWhatsAppMessageStatus(listener: (event: WhatsAppMessageStatusEvent) => void) {
  whatsappEvents.on('message_status', listener);
  return () => {
    whatsappEvents.off('message_status', listener);
  };
}

function requireActiveSocket(slotId: string): WASocket {
  const session = sessions.get(slotId);
  if (!session?.socket) {
    throw new Error('WhatsApp session is not active');
  }
  return session.socket;
}

export async function forwardSlotMessage(
  slotId: string,
  messageId: string,
  toJid: string,
): Promise<{ messageId: string }> {
  const socket = requireActiveSocket(slotId);
  const source = findMessageInCache(slotId, messageId);
  if (!source) throw new Error('Message to forward was not found');

  let sent: any;
  if (source.raw?.message) {
    sent = await socket.sendMessage(toJid, { forward: source.raw } as any);
  } else {
    // Fallback: re-send as text copy when raw proto is unavailable (e.g. DB-restored history).
    sent = await socket.sendMessage(toJid, { text: source.text || '(forwarded message)' });
  }

  const newId = sent?.key?.id || `local-${Date.now()}`;
  upsertMessage(slotId, {
    key: { remoteJid: toJid, fromMe: true, id: newId },
    message: { conversation: source.text || '(forwarded message)' },
    messageTimestamp: Math.floor(Date.now() / 1000),
    status: 'sent',
  });

  return { messageId: newId };
}

export async function deleteSlotMessage(slotId: string, jid: string, messageId: string): Promise<void> {
  const socket = requireActiveSocket(slotId);
  const source = findMessageInCache(slotId, messageId);

  await socket.sendMessage(jid, {
    delete: source?.raw?.key || { remoteJid: jid, fromMe: true, id: messageId },
  } as any);

  const updated = updateMessageInCache(slotId, messageId, {
    text: 'This message was deleted',
    deleted: true,
  });
  if (updated) emitMessageUpdated(slotId, jid, updated);
}

export async function editSlotMessage(slotId: string, jid: string, messageId: string, text: string): Promise<void> {
  const socket = requireActiveSocket(slotId);
  const source = findMessageInCache(slotId, messageId);

  await socket.sendMessage(jid, {
    text,
    edit: source?.raw?.key || { remoteJid: jid, fromMe: true, id: messageId },
  } as any);

  const updated = updateMessageInCache(slotId, messageId, { text, edited: true });
  if (updated) emitMessageUpdated(slotId, jid, updated);
}

export async function markSlotChatRead(slotId: string, jid: string): Promise<void> {
  const socket = requireActiveSocket(slotId);
  const cache = cacheForSlot(slotId);
  const messages = cache.messages.get(jid) || [];

  const keys = messages
    .filter((msg) => !msg.fromMe)
    .slice(-50)
    .map((msg) => msg.raw?.key || { remoteJid: jid, fromMe: false, id: msg.id })
    .filter((key) => key?.id);

  if (keys.length > 0) {
    await socket.readMessages(keys as any);
  }

  const conversation = cache.conversations.get(jid);
  if (conversation && conversation.unread !== 0) {
    cache.conversations.set(jid, { ...conversation, unread: 0 });
  }
}

export async function sendSlotPresence(
  slotId: string,
  jid: string,
  state: 'composing' | 'recording' | 'paused' | 'available' | 'unavailable',
): Promise<void> {
  const socket = requireActiveSocket(slotId);
  await socket.sendPresenceUpdate(state as any, jid);
}

export async function subscribeSlotPresence(
  slotId: string,
  jid: string,
): Promise<{ presence: WhatsAppPresenceState; lastSeenAt: string | null }> {
  const socket = requireActiveSocket(slotId);

  const subscribed = slotPresenceSubscriptions.get(slotId) || new Set<string>();
  if (!subscribed.has(jid)) {
    // WhatsApp only pushes presence updates to devices that are marked available.
    try {
      await socket.sendPresenceUpdate('available');
    } catch {
      // Non-fatal: presence subscription may still work.
    }
    await socket.presenceSubscribe(jid);
    subscribed.add(jid);
    slotPresenceSubscriptions.set(slotId, subscribed);
  }

  const cached = slotPresence.get(slotId)?.get(jid);
  return cached || { presence: 'unknown', lastSeenAt: null };
}

export async function getSlotContactAvatar(slotId: string, jid: string): Promise<string | null> {
  const perSlot = slotAvatarCache.get(slotId) || new Map<string, { url: string | null; fetchedAt: number }>();
  const cached = perSlot.get(jid);
  if (cached && Date.now() - cached.fetchedAt < AVATAR_CACHE_TTL_MS) {
    return cached.url;
  }

  const socket = requireActiveSocket(slotId);

  // WhatsApp often addresses chats by privacy LID; the picture lives on the real phone jid.
  const candidates: string[] = [jid];
  if (jid.endsWith('@lid')) {
    try {
      const pn = await (socket as any).signalRepository?.lidMapping?.getPNForLID?.(jid);
      // Strip the device suffix (e.g. 91xxxx:0@s.whatsapp.net -> 91xxxx@s.whatsapp.net).
      if (pn) candidates.unshift(jidNormalizedUser(pn));
    } catch {
      // No mapping available; fall back to the lid itself.
    }
  }

  let url: string | null = null;
  for (const candidate of candidates) {
    // Raw IQ without tctoken — Baileys' tctoken path stalls on some accounts.
    try {
      const result = await (socket as any).query({
        tag: 'iq',
        attrs: {
          target: jidNormalizedUser(candidate),
          to: S_WHATSAPP_NET,
          type: 'get',
          xmlns: 'w:profile:picture',
        },
        content: [{ tag: 'picture', attrs: { type: 'image', query: 'url' } }],
      }, 10_000);
      url = getBinaryNodeChild(result, 'picture')?.attrs?.url || null;
    } catch {
      url = null;
    }

    if (!url) {
      try {
        url = (await socket.profilePictureUrl(candidate, 'image', 10_000)) || null;
      } catch {
        url = null;
      }
    }
    if (url) break;
  }

  // Cache successful lookups for the full TTL; retry failures sooner.
  perSlot.set(jid, { url, fetchedAt: url ? Date.now() : Date.now() - AVATAR_CACHE_TTL_MS + 60_000 });
  slotAvatarCache.set(slotId, perSlot);
  return url;
}

export function onWhatsAppPresence(listener: (event: WhatsAppPresenceEvent) => void) {
  whatsappEvents.on('presence', listener);
  return () => {
    whatsappEvents.off('presence', listener);
  };
}

// Resolve a chat jid to a dialable phone number. Plain phone jids return
// their number directly; privacy LIDs are mapped back to the real phone jid
// via Baileys' lid mapping store. Returns null when no number can be found
// (e.g. groups, or LIDs with no known mapping).
export async function getSlotContactPhone(slotId: string, jid: string): Promise<string | null> {
  if (jid.endsWith('@s.whatsapp.net')) {
    return jid.split('@')[0].split(':')[0] || null;
  }
  if (!jid.endsWith('@lid')) return null;

  const socket = requireActiveSocket(slotId);
  try {
    const pn = await (socket as any).signalRepository?.lidMapping?.getPNForLID?.(jid);
    if (pn) {
      const normalized = jidNormalizedUser(pn);
      const digits = normalized.split('@')[0].split(':')[0];
      return digits || null;
    }
  } catch {
    // fall through
  }
  return null;
}

export function onWhatsAppAvatarChange(listener: (event: { slotId: string }) => void) {
  whatsappEvents.on('avatar', listener);
  return () => {
    whatsappEvents.off('avatar', listener);
  };
}

export async function getSlotMessageMedia(
  slotId: string,
  messageId: string,
): Promise<{ buffer: Buffer; mime: string; name: string }> {
  const msg = findMessageInCache(slotId, messageId);
  const mime = msg?.mediaMime || 'application/octet-stream';
  const name = msg?.mediaName || 'file';

  const dir = mediaDirForSlot(slotId);
  const filePath = path.join(dir, safeMediaFileName(messageId));

  // Disk cache survives restarts (raw media keys are memory-only).
  try {
    const buffer = await fs.readFile(filePath);
    return { buffer, mime, name };
  } catch {
    // Not cached yet; download below.
  }

  if (!msg?.raw?.message) {
    throw new Error('MEDIA_UNAVAILABLE');
  }

  const socket = requireActiveSocket(slotId);
  const buffer = await downloadMediaMessage(
    msg.raw,
    'buffer',
    {},
    { logger: undefined as any, reuploadRequest: socket.updateMediaMessage },
  ) as Buffer;

  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(filePath, buffer);
  return { buffer, mime, name };
}

async function cacheOutboundMedia(slotId: string, messageId: string, buffer: Buffer) {
  try {
    const dir = mediaDirForSlot(slotId);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, safeMediaFileName(messageId)), buffer);
  } catch {
    // Non-fatal: media can be re-downloaded from WhatsApp while raw proto is cached.
  }
}

export async function bootstrapWhatsAppSessions(): Promise<void> {
  await prisma.$executeRawUnsafe(`
    ALTER TABLE whatsapp_messages
    ADD COLUMN IF NOT EXISTS status VARCHAR,
    ADD COLUMN IF NOT EXISTS "sentAt" TIMESTAMP,
    ADD COLUMN IF NOT EXISTS "deliveredAt" TIMESTAMP,
    ADD COLUMN IF NOT EXISTS "readAt" TIMESTAMP,
    ADD COLUMN IF NOT EXISTS "playedAt" TIMESTAMP,
    ADD COLUMN IF NOT EXISTS "failedAt" TIMESTAMP,
    ADD COLUMN IF NOT EXISTS "failureCode" VARCHAR,
    ADD COLUMN IF NOT EXISTS "failureReason" TEXT,
    ADD COLUMN IF NOT EXISTS reactions TEXT,
    ADD COLUMN IF NOT EXISTS edited BOOLEAN,
    ADD COLUMN IF NOT EXISTS deleted BOOLEAN,
    ADD COLUMN IF NOT EXISTS "mediaType" VARCHAR,
    ADD COLUMN IF NOT EXISTS "mediaMime" VARCHAR,
    ADD COLUMN IF NOT EXISTS "mediaName" VARCHAR,
    ADD COLUMN IF NOT EXISTS "mediaDurationSec" INTEGER,
    ADD COLUMN IF NOT EXISTS "senderName" VARCHAR,
    ADD COLUMN IF NOT EXISTS "quotedId" VARCHAR,
    ADD COLUMN IF NOT EXISTS "quotedPreview" TEXT,
    ADD COLUMN IF NOT EXISTS "quotedSender" VARCHAR
  `).catch(() => {
    // Keep startup resilient even if DDL cannot be executed in this environment.
  });

  await prisma.$executeRawUnsafe(`
    ALTER TABLE whatsapp_phone_slots
    ADD COLUMN IF NOT EXISTS "hidePhone" BOOLEAN NOT NULL DEFAULT false
  `).catch(() => {
    // Keep startup resilient even if DDL cannot be executed in this environment.
  });

  const slots = await prisma.whatsAppPhoneSlot.findMany({
    where: {
      assignedToId: { not: null },
    },
    select: { id: true },
  });

  await Promise.allSettled(
    slots.map(async (slot) => {
      await initWhatsAppSession(slot.id);
    }),
  );
}