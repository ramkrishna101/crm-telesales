import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import AppLayout from '../../components/layout/AppLayout';
import { whatsappService, leadsService } from '../../services/crm.service';
import { stringeeService } from '../../services/stringee.service';
import toast from 'react-hot-toast';
import { ArrowLeft, ChevronDown, CornerUpLeft, Crop, Download, FileText, Forward, MessageSquare, Mic, Moon, MoreVertical, Paperclip, Pause, Pencil, Phone, Pin, Play, RefreshCw, RotateCw, Search, Send, Smile, SmilePlus, Square, Sun, Tag, Trash2, Type, Undo2, Video, X } from 'lucide-react';
import { getSocket } from '../../hooks/useSocket';

function formatContactTitle(value: string) {
  return value
    .replace('@s.whatsapp.net', '')
    .replace('@lid', '')
    .replace('@g.us', '')
    .trim();
}

function maskPhoneTitle(value: string) {
  const nonPhoneChars = value.replace(/[0-9+\s()\-.]/g, '');
  if (nonPhoneChars.length > 0) return value; // named contact/group — not a raw number
  const digits = value.replace(/[^0-9]/g, '');
  if (digits.length < 7) return value;
  return `••• ••• ${digits.slice(-4)}`;
}

function normalizePhoneToJid(value: string) {
  const cleaned = value.replace(/[^0-9]/g, '');
  return cleaned ? `${cleaned}@s.whatsapp.net` : '';
}

function messageDayKey(value: string) {
  const date = new Date(value);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function formatDayLabel(value: string) {
  const date = new Date(value);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  const isToday = messageDayKey(date.toISOString()) === messageDayKey(today.toISOString());
  const isYesterday = messageDayKey(date.toISOString()) === messageDayKey(yesterday.toISOString());
  if (isToday) return 'Today';
  if (isYesterday) return 'Yesterday';
  return date.toLocaleDateString();
}

type PresenceInfo = { presence: 'online' | 'offline' | 'typing' | 'recording' | 'paused' | 'unknown'; lastSeenAt: string | null };

function formatPresenceLine(info: PresenceInfo | undefined): string {
  if (!info) return '';
  if (info.presence === 'typing') return 'typing…';
  if (info.presence === 'recording') return 'recording audio…';
  if (info.presence === 'online' || info.presence === 'paused') return 'online';
  if (info.lastSeenAt) {
    const date = new Date(info.lastSeenAt);
    const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const dayLabel = formatDayLabel(info.lastSeenAt);
    if (dayLabel === 'Today') return `last seen today at ${time}`;
    if (dayLabel === 'Yesterday') return `last seen yesterday at ${time}`;
    return `last seen ${date.toLocaleDateString()} at ${time}`;
  }
  return '';
}

type Conversation = {
  jid: string;
  title: string;
  lastMessage: string;
  lastMessageAt: string;
  unread: number;
};

type TimelineMessage = {
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
  senderName?: string | null;
  quotedId?: string | null;
  quotedPreview?: string | null;
  quotedSender?: string | null;
};

const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

const TAG_COLORS = ['#00a884', '#1e88e5', '#fb8c00', '#8e24aa', '#e53935', '#00897b', '#5e35b1', '#c0850c'];

function tagColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  return TAG_COLORS[Math.abs(hash) % TAG_COLORS.length];
}
const MORE_REACTIONS = ['😀', '😅', '🤣', '😍', '😘', '😎', '🤔', '🙄', '😤', '😡', '🤯', '😱', '🥺', '😭', '😴', '🤢', '🥳', '🤩', '👏', '🙌', '💪', '🤝', '✌️', '🔥', '✨', '🎉', '💯', '✅', '❌', '⚡', '💀', '🤡'];
const COMPOSER_EMOJIS = ['😀', '😂', '😍', '😎', '🤔', '🙏', '👍', '👌', '💪', '🎉', '❤️', '🔥', '✅', '❌', '⚠️', '🚀', '📞', '💰', '🗓️', '🙌'];

const menuItemStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  border: 'none',
  background: 'transparent',
  padding: '7px 10px',
  fontSize: 12.5,
  color: '#111b21',
  cursor: 'pointer',
  textAlign: 'left',
  borderRadius: 6,
  width: '100%',
};

const WA_THEMES = {
  light: {
    outerBg: '#eae6df',
    stripBg: '#00a884',
    sidebarBg: '#ffffff',
    headerBg: '#f0f2f5',
    border: '#d1d7db',
    softBorder: '#e9edef',
    textPrimary: '#111b21',
    textSecondary: '#667781',
    textMuted: '#8696a0',
    searchBg: '#f0f2f5',
    inputBg: '#ffffff',
    activeRow: '#f0f2f5',
    avatarBg: '#dfe5e7',
    avatarText: '#54656f',
    icon: '#54656f',
    timelineBg: '#efeae2',
    timelineDot: '#d9d4cb',
    bubbleIn: '#ffffff',
    bubbleOut: '#d9fdd3',
    bubbleText: '#111b21',
    dayChipBg: '#ffffff',
    dayChipText: '#54656f',
    menuBg: '#ffffff',
    accent: '#00a884',
    unreadBg: '#25d366',
    unreadText: '#ffffff',
    chipBg: '#f0f2f5',
    chipText: '#54656f',
    chipActiveBg: '#e7fce3',
    chipActiveText: '#008069',
    panelBg: '#ffffff',
    overlayBg: '#e9edef',
    mediaCardBg: 'rgba(11,20,26,0.06)',
  },
  dark: {
    outerBg: '#0c1317',
    stripBg: '#202c33',
    sidebarBg: '#111b21',
    headerBg: '#202c33',
    border: '#2f3b43',
    softBorder: '#222d34',
    textPrimary: '#e9edef',
    textSecondary: '#8696a0',
    textMuted: '#8696a0',
    searchBg: '#202c33',
    inputBg: '#2a3942',
    activeRow: '#2a3942',
    avatarBg: '#6a7175',
    avatarText: '#e9edef',
    icon: '#aebac1',
    timelineBg: '#0b141a',
    timelineDot: '#16222b',
    bubbleIn: '#202c33',
    bubbleOut: '#005c4b',
    bubbleText: '#e9edef',
    dayChipBg: '#182229',
    dayChipText: '#8696a0',
    menuBg: '#233138',
    accent: '#00a884',
    unreadBg: '#00a884',
    unreadText: '#111b21',
    chipBg: '#202c33',
    chipText: '#8696a0',
    chipActiveBg: '#0a332c',
    chipActiveText: '#00a884',
    panelBg: '#111b21',
    overlayBg: '#0b141a',
    mediaCardBg: 'rgba(233,237,239,0.08)',
  },
} as const;

function formatAudioTime(totalSeconds: number) {
  const safe = Number.isFinite(totalSeconds) && totalSeconds > 0 ? totalSeconds : 0;
  return `${Math.floor(safe / 60)}:${String(Math.floor(safe % 60)).padStart(2, '0')}`;
}

function VoicePlayer({ url, durationSec, dark, avatarUrl, isVoice }: {
  url: string;
  durationSec?: number | null;
  dark: boolean;
  avatarUrl?: string | null;
  isVoice: boolean;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(durationSec || 0);
  const [current, setCurrent] = useState(0);

  const bars = useMemo(() => Array.from({ length: 30 }, (_, i) => 5 + ((i * 7919 + 13) % 17)), []);

  const playedColor = '#53bdeb';
  const idleColor = dark ? '#4a5961' : '#cfd8dc';
  const iconColor = dark ? '#8696a0' : '#54656f';

  const resolveDuration = () => {
    const audio = audioRef.current;
    const d = audio && Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : duration;
    return d > 0 ? d : 0;
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 230, marginBottom: 4, padding: '2px 0' }}>
      <audio
        ref={audioRef}
        src={url}
        preload="metadata"
        style={{ display: 'none' }}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => { setPlaying(false); setProgress(0); setCurrent(0); }}
        onLoadedMetadata={(event) => {
          const d = event.currentTarget.duration;
          if (Number.isFinite(d) && d > 0) setDuration(d);
        }}
        onTimeUpdate={(event) => {
          const audio = event.currentTarget;
          setCurrent(audio.currentTime);
          const d = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : duration;
          if (d > 0) setProgress(Math.min(audio.currentTime / d, 1));
        }}
      />
      <button
        type="button"
        onClick={() => {
          const audio = audioRef.current;
          if (!audio) return;
          if (playing) audio.pause();
          else audio.play().catch(() => undefined);
        }}
        style={{ border: 'none', background: 'transparent', color: iconColor, display: 'inline-grid', placeItems: 'center', cursor: 'pointer', padding: 0, flexShrink: 0 }}
      >
        {playing ? <Pause size={26} fill={iconColor} /> : <Play size={26} fill={iconColor} />}
      </button>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>
        <div
          style={{ display: 'flex', alignItems: 'center', gap: 2, height: 24, cursor: 'pointer' }}
          onClick={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            const ratio = Math.min(Math.max((event.clientX - rect.left) / rect.width, 0), 1);
            const audio = audioRef.current;
            const d = resolveDuration();
            if (audio && d > 0) audio.currentTime = ratio * d;
          }}
        >
          {bars.map((height, index) => (
            <span
              key={index}
              style={{
                width: 3,
                height,
                borderRadius: 2,
                flexShrink: 0,
                background: index / bars.length <= progress ? playedColor : idleColor,
              }}
            />
          ))}
        </div>
        <div style={{ fontSize: 11, color: dark ? '#8696a0' : '#667781' }}>
          {formatAudioTime(playing || current > 0 ? current : resolveDuration())}
        </div>
      </div>
      {isVoice ? (
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <div style={{ width: 42, height: 42, borderRadius: '50%', background: dark ? '#6a7175' : '#dfe5e7', overflow: 'hidden', display: 'grid', placeItems: 'center' }}>
            {avatarUrl ? (
              <img src={avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <Mic size={20} color={dark ? '#e9edef' : '#54656f'} />
            )}
          </div>
          {avatarUrl ? (
            <Mic size={15} color="#53bdeb" style={{ position: 'absolute', bottom: -2, left: -4 }} />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

type ImageEditorHandle = {
  isDirty: () => boolean;
  getEditedFile: () => Promise<File | null>;
};

const EDITOR_COLORS = ['#e53935', '#fb8c00', '#fdd835', '#43a047', '#1e88e5', '#8e24aa', '#ffffff', '#111b21'];

function ImageEditor({ url, fileName, fileType, dark, handleRef }: {
  url: string;
  fileName: string;
  fileType: string;
  dark: boolean;
  handleRef: { current: ImageEditorHandle | null };
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [tool, setTool] = useState<'none' | 'pen' | 'text' | 'crop'>('none');
  const [color, setColor] = useState('#e53935');
  const [undoCount, setUndoCount] = useState(0);
  const undoStackRef = useRef<ImageData[]>([]);
  const dirtyRef = useRef(false);
  const drawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const cropStartRef = useRef<{ x: number; y: number } | null>(null);
  const [cropRect, setCropRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [textDraft, setTextDraft] = useState<{ dx: number; dy: number; value: string } | null>(null);

  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const maxDim = 1800;
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height);
    };
    img.src = url;
    undoStackRef.current = [];
    dirtyRef.current = false;
    setUndoCount(0);
    setCropRect(null);
    setTextDraft(null);
    setTool('none');
  }, [url]);

  useEffect(() => {
    handleRef.current = {
      isDirty: () => dirtyRef.current,
      getEditedFile: () => new Promise((resolve) => {
        const canvas = canvasRef.current;
        if (!canvas) { resolve(null); return; }
        const outType = fileType === 'image/png' ? 'image/png' : 'image/jpeg';
        canvas.toBlob((blob) => {
          if (!blob) { resolve(null); return; }
          const base = fileName.replace(/\.[^.]+$/, '') || 'image';
          resolve(new File([blob], `${base}${outType === 'image/png' ? '.png' : '.jpg'}`, { type: outType }));
        }, outType, 0.92);
      }),
    };
    return () => { handleRef.current = null; };
  }, [fileName, fileType, handleRef]);

  const pushUndo = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    undoStackRef.current.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
    if (undoStackRef.current.length > 12) undoStackRef.current.shift();
    dirtyRef.current = true;
    setUndoCount(undoStackRef.current.length);
  };

  const undo = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    const snapshot = undoStackRef.current.pop();
    if (!canvas || !ctx || !snapshot) return;
    canvas.width = snapshot.width;
    canvas.height = snapshot.height;
    ctx.putImageData(snapshot, 0, 0);
    if (undoStackRef.current.length === 0) dirtyRef.current = true; // still edited vs original unless stack empty AND no ops — keep dirty
    setUndoCount(undoStackRef.current.length);
    setCropRect(null);
  };

  const toCanvasPoint = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: (clientX - rect.left) * (canvas.width / rect.width),
      y: (clientY - rect.top) * (canvas.height / rect.height),
    };
  };

  const rotate = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    pushUndo();
    const temp = document.createElement('canvas');
    temp.width = canvas.height;
    temp.height = canvas.width;
    const tctx = temp.getContext('2d');
    if (!tctx) return;
    tctx.translate(temp.width / 2, temp.height / 2);
    tctx.rotate(Math.PI / 2);
    tctx.drawImage(canvas, -canvas.width / 2, -canvas.height / 2);
    canvas.width = temp.width;
    canvas.height = temp.height;
    ctx.drawImage(temp, 0, 0);
    setCropRect(null);
  };

  const applyCrop = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || !cropRect || cropRect.w < 8 || cropRect.h < 8) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const sx = Math.max(0, cropRect.x * scaleX);
    const sy = Math.max(0, cropRect.y * scaleY);
    const sw = Math.min(canvas.width - sx, cropRect.w * scaleX);
    const sh = Math.min(canvas.height - sy, cropRect.h * scaleY);
    if (sw < 4 || sh < 4) return;
    pushUndo();
    const cropped = ctx.getImageData(sx, sy, sw, sh);
    canvas.width = cropped.width;
    canvas.height = cropped.height;
    ctx.putImageData(cropped, 0, 0);
    setCropRect(null);
    setTool('none');
  };

  const commitText = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || !textDraft || !textDraft.value.trim()) { setTextDraft(null); return; }
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    pushUndo();
    const fontPx = Math.max(20, Math.round(28 * scaleX));
    ctx.font = `700 ${fontPx}px -apple-system, Segoe UI, sans-serif`;
    ctx.fillStyle = color;
    ctx.shadowColor = 'rgba(0,0,0,0.35)';
    ctx.shadowBlur = 3;
    ctx.fillText(textDraft.value, textDraft.dx * scaleX, textDraft.dy * scaleY + fontPx * 0.35);
    ctx.shadowBlur = 0;
    setTextDraft(null);
  };

  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const dx = event.clientX - rect.left;
    const dy = event.clientY - rect.top;
    if (tool === 'pen') {
      pushUndo();
      drawingRef.current = true;
      lastPointRef.current = toCanvasPoint(event.clientX, event.clientY);
      canvas.setPointerCapture(event.pointerId);
    } else if (tool === 'crop') {
      cropStartRef.current = { x: dx, y: dy };
      setCropRect({ x: dx, y: dy, w: 0, h: 0 });
      canvas.setPointerCapture(event.pointerId);
    } else if (tool === 'text') {
      if (textDraft?.value.trim()) commitText();
      else setTextDraft({ dx, dy, value: '' });
    }
  };

  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (tool === 'pen' && drawingRef.current) {
      const ctx = canvas.getContext('2d');
      const point = toCanvasPoint(event.clientX, event.clientY);
      const last = lastPointRef.current;
      if (ctx && last) {
        ctx.strokeStyle = color;
        ctx.lineWidth = Math.max(3, canvas.width / 220);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(last.x, last.y);
        ctx.lineTo(point.x, point.y);
        ctx.stroke();
      }
      lastPointRef.current = point;
    } else if (tool === 'crop' && cropStartRef.current) {
      const rect = canvas.getBoundingClientRect();
      const dx = Math.min(Math.max(event.clientX - rect.left, 0), rect.width);
      const dy = Math.min(Math.max(event.clientY - rect.top, 0), rect.height);
      const start = cropStartRef.current;
      setCropRect({
        x: Math.min(start.x, dx),
        y: Math.min(start.y, dy),
        w: Math.abs(dx - start.x),
        h: Math.abs(dy - start.y),
      });
    }
  };

  const onPointerUp = () => {
    drawingRef.current = false;
    lastPointRef.current = null;
    cropStartRef.current = null;
  };

  const toolButton = (key: 'pen' | 'text' | 'crop', icon: React.ReactNode, title: string) => (
    <button
      type="button"
      title={title}
      onClick={() => {
        if (textDraft) commitText();
        setTool((current) => (current === key ? 'none' : key));
        if (key !== 'crop') setCropRect(null);
      }}
      style={{
        border: 'none',
        cursor: 'pointer',
        width: 36,
        height: 36,
        borderRadius: '50%',
        display: 'inline-grid',
        placeItems: 'center',
        background: tool === key ? '#00a884' : 'transparent',
        color: tool === key ? '#ffffff' : dark ? '#aebac1' : '#54656f',
      }}
    >
      {icon}
    </button>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, maxWidth: '100%', maxHeight: '100%', minHeight: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap', justifyContent: 'center' }}>
        <button
          type="button"
          title="Undo"
          onClick={undo}
          disabled={undoCount === 0}
          style={{ border: 'none', cursor: undoCount ? 'pointer' : 'default', width: 36, height: 36, borderRadius: '50%', display: 'inline-grid', placeItems: 'center', background: 'transparent', color: dark ? '#aebac1' : '#54656f', opacity: undoCount ? 1 : 0.35 }}
        >
          <Undo2 size={19} />
        </button>
        <button
          type="button"
          title="Rotate"
          onClick={rotate}
          style={{ border: 'none', cursor: 'pointer', width: 36, height: 36, borderRadius: '50%', display: 'inline-grid', placeItems: 'center', background: 'transparent', color: dark ? '#aebac1' : '#54656f' }}
        >
          <RotateCw size={19} />
        </button>
        {toolButton('crop', <Crop size={19} />, 'Crop')}
        {toolButton('text', <Type size={19} />, 'Add text')}
        {toolButton('pen', <Pencil size={19} />, 'Draw')}
        {tool === 'crop' && cropRect && cropRect.w > 8 && cropRect.h > 8 ? (
          <button
            type="button"
            onClick={applyCrop}
            style={{ border: 'none', cursor: 'pointer', height: 30, padding: '0 14px', borderRadius: 15, background: '#00a884', color: '#ffffff', fontSize: 12.5, fontWeight: 600 }}
          >
            Apply crop
          </button>
        ) : null}
      </div>
      {(tool === 'pen' || tool === 'text') ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {EDITOR_COLORS.map((swatch) => (
            <button
              key={swatch}
              type="button"
              onClick={() => setColor(swatch)}
              style={{
                width: 20,
                height: 20,
                borderRadius: '50%',
                background: swatch,
                cursor: 'pointer',
                border: color === swatch ? '3px solid #00a884' : `2px solid ${dark ? '#374248' : '#d1d7db'}`,
                padding: 0,
              }}
            />
          ))}
        </div>
      ) : null}
      <div ref={wrapRef} style={{ position: 'relative', minHeight: 0, display: 'grid', placeItems: 'center' }}>
        <canvas
          ref={canvasRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          style={{
            maxWidth: '100%',
            maxHeight: 'calc(100vh - 420px)',
            borderRadius: 6,
            boxShadow: '0 2px 10px rgba(11,20,26,0.2)',
            touchAction: 'none',
            cursor: tool === 'pen' ? 'crosshair' : tool === 'crop' ? 'crosshair' : tool === 'text' ? 'text' : 'default',
          }}
        />
        {tool === 'crop' && cropRect ? (
          <div
            style={{
              position: 'absolute',
              left: cropRect.x,
              top: cropRect.y,
              width: cropRect.w,
              height: cropRect.h,
              border: '2px dashed #00a884',
              background: 'rgba(0,168,132,0.12)',
              pointerEvents: 'none',
            }}
          />
        ) : null}
        {textDraft ? (
          <input
            autoFocus
            value={textDraft.value}
            onChange={(event) => setTextDraft((current) => (current ? { ...current, value: event.target.value } : current))}
            onKeyDown={(event) => {
              if (event.key === 'Enter') commitText();
              if (event.key === 'Escape') setTextDraft(null);
            }}
            onBlur={commitText}
            placeholder="Type…"
            style={{
              position: 'absolute',
              left: textDraft.dx,
              top: textDraft.dy - 16,
              minWidth: 120,
              maxWidth: 260,
              background: 'rgba(0,0,0,0.45)',
              border: `1px dashed ${color}`,
              borderRadius: 4,
              color,
              fontWeight: 700,
              fontSize: 18,
              padding: '3px 6px',
              outline: 'none',
            }}
          />
        ) : null}
      </div>
      {tool === 'crop' ? (
        <div style={{ fontSize: 11.5, color: dark ? '#8696a0' : '#667781' }}>Drag on the image to select the crop area</div>
      ) : tool === 'text' ? (
        <div style={{ fontSize: 11.5, color: dark ? '#8696a0' : '#667781' }}>Click on the image to place text, Enter to apply</div>
      ) : null}
    </div>
  );
}

export default function AgentWhatsAppPage() {
  const qc = useQueryClient();
  const [showAdvancedSend, setShowAdvancedSend] = useState(false);
  const [advancedType, setAdvancedType] = useState<'text' | 'image' | 'video' | 'audio' | 'document' | 'sticker' | 'contact' | 'location' | 'poll' | 'reaction'>('text');
  const [advancedText, setAdvancedText] = useState('');
  const [advancedMediaUrl, setAdvancedMediaUrl] = useState('');
  const [advancedCaption, setAdvancedCaption] = useState('');
  const [advancedFilename, setAdvancedFilename] = useState('');
  const [advancedMime, setAdvancedMime] = useState('');
  const [advancedName, setAdvancedName] = useState('');
  const [advancedAddress, setAdvancedAddress] = useState('');
  const [advancedLatitude, setAdvancedLatitude] = useState('');
  const [advancedLongitude, setAdvancedLongitude] = useState('');
  const [advancedVcard, setAdvancedVcard] = useState('');
  const [advancedQuestion, setAdvancedQuestion] = useState('');
  const [advancedOptions, setAdvancedOptions] = useState('');
  const [advancedSelectableCount, setAdvancedSelectableCount] = useState('1');
  const [advancedMessageId, setAdvancedMessageId] = useState('');
  const [advancedEmoji, setAdvancedEmoji] = useState('👍');
  const [advancedMentions, setAdvancedMentions] = useState('');
  const [advancedQuotedMessageId, setAdvancedQuotedMessageId] = useState('');
  const [advancedSendAt, setAdvancedSendAt] = useState('');
  const [advancedIdempotencyKey, setAdvancedIdempotencyKey] = useState('');
  const [advancedRecipients, setAdvancedRecipients] = useState('');
  const [selectedJid, setSelectedJid] = useState<string>('');
  const [draft, setDraft] = useState<string>('');
  const [search, setSearch] = useState<string>('');
  const [messageSearchOpen, setMessageSearchOpen] = useState(false);
  const [contactInfoOpen, setContactInfoOpen] = useState(false);
  const [messageSearch, setMessageSearch] = useState('');
  const [showChatListOnMobile, setShowChatListOnMobile] = useState(true);
  const [isMobile, setIsMobile] = useState<boolean>(() => (typeof window !== 'undefined' ? window.innerWidth < 960 : false));
  const timelineRef = useRef<HTMLDivElement | null>(null);
  const socketHandlerBoundRef = useRef(false);
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);
  const audioInputRef = useRef<HTMLInputElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingStreamRef = useRef<MediaStream | null>(null);
  const recordingChunksRef = useRef<BlobPart[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const recordingTimerRef = useRef<number | null>(null);
  const discardRecordingRef = useRef(false);
  const [pendingVoice, setPendingVoice] = useState<{ file: File; url: string } | null>(null);
  const [pendingAttachment, setPendingAttachment] = useState<{ file: File; url: string } | null>(null);
  const [attachmentCaption, setAttachmentCaption] = useState('');
  const imageEditorRef = useRef<ImageEditorHandle | null>(null);
  const unreadRef = useRef<Record<string, number>>({});
  const [localUnreadByJid, setLocalUnreadByJid] = useState<Record<string, number>>({});
  const [unreadMarker, setUnreadMarker] = useState<{ jid: string; count: number } | null>(null);
  const [replyTo, setReplyTo] = useState<TimelineMessage | null>(null);
  const [editingMessage, setEditingMessage] = useState<TimelineMessage | null>(null);
  const [openMenuMessageId, setOpenMenuMessageId] = useState<string>('');
  const [reactionPickerMessageId, setReactionPickerMessageId] = useState<string>('');
  const [reactionPickerExpanded, setReactionPickerExpanded] = useState(false);
  const [forwardingMessage, setForwardingMessage] = useState<TimelineMessage | null>(null);
  const [forwardTargetJid, setForwardTargetJid] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const typingStateRef = useRef<{ timer: number | null; lastSent: number }>({ timer: null, lastSent: 0 });
  const [presenceByJid, setPresenceByJid] = useState<Record<string, PresenceInfo>>({});
  const [avatarByJid, setAvatarByJid] = useState<Record<string, string | null>>({});
  const avatarFetchRef = useRef<Set<string>>(new Set());
  const [avatarRefreshKey, setAvatarRefreshKey] = useState(0);
  const [mediaUrlById, setMediaUrlById] = useState<Record<string, string>>({});
  const mediaFetchRef = useRef<Set<string>>(new Set());
  const [olderByJid, setOlderByJid] = useState<Record<string, TimelineMessage[]>>({});
  const [hasMoreByJid, setHasMoreByJid] = useState<Record<string, boolean>>({});
  const loadingOlderRef = useRef(false);
  const [waTheme, setWaTheme] = useState<'light' | 'dark'>(() => {
    try {
      return localStorage.getItem('wa-theme') === 'dark' ? 'dark' : 'light';
    } catch {
      return 'light';
    }
  });
  const [chatFilter, setChatFilter] = useState<string>('all');
  const [mobilePrimaryTab, setMobilePrimaryTab] = useState<'chats' | 'calls'>('chats');
  const [mobileFrameHeight, setMobileFrameHeight] = useState<number | null>(null);
  const [chatTags, setChatTags] = useState<Record<string, string[]>>(() => {
    try {
      return JSON.parse(localStorage.getItem('wa-chat-tags') || '{}');
    } catch {
      return {};
    }
  });
  const [tagPickerOpen, setTagPickerOpen] = useState(false);
  const [newTagInput, setNewTagInput] = useState('');
  const [labelsMenuOpen, setLabelsMenuOpen] = useState(false);
  const [customNames, setCustomNames] = useState<Record<string, string>>(() => {
    try {
      return JSON.parse(localStorage.getItem('wa-chat-names') || '{}');
    } catch {
      return {};
    }
  });
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [pinnedJids, setPinnedJids] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('wa-pinned-chats') || '[]');
    } catch {
      return [];
    }
  });
  const T = WA_THEMES[waTheme];
  const menuStyle: CSSProperties = { ...menuItemStyle, color: T.textPrimary };
  const mobileFrameRef = useRef<HTMLDivElement | null>(null);

  const toggleWaTheme = () => {
    setWaTheme((current) => {
      const next = current === 'dark' ? 'light' : 'dark';
      try {
        localStorage.setItem('wa-theme', next);
      } catch {
        // ignore storage errors
      }
      return next;
    });
  };

  const { data, isLoading } = useQuery({
    queryKey: ['whatsapp-me'],
    queryFn: () => whatsappService.me(),
    refetchInterval: (query) => {
      const state = (query.state.data as any)?.data?.data?.slot?.session?.state;
      return state === 'connected' ? false : 4000;
    },
  });

  const slot = data?.data?.data?.slot;
  const sessionState = slot?.session?.state || 'created';
  const isConnected = sessionState === 'connected';
  const hidePhone = Boolean(slot?.hidePhone);
  const contactTitle = (value: string) => {
    const title = formatContactTitle(value);
    return hidePhone ? maskPhoneTitle(title) : title;
  };

  useEffect(() => {
    if (isConnected) {
      qc.invalidateQueries({ queryKey: ['whatsapp-conversations', slot?.id] });
    }
  }, [isConnected, qc, slot?.id]);

  const { data: conversationsData } = useQuery({
    queryKey: ['whatsapp-conversations', slot?.id],
    queryFn: () => whatsappService.myConversations(),
    enabled: Boolean(slot?.id),
    refetchInterval: (query) => {
      const payload = query.state.data as any;
      const syncing = payload?.data?.data?.syncing;
      const empty = (payload?.data?.data?.conversations || []).length === 0;
      return syncing || empty ? 2000 : 5000;
    },
  });

  const rawConversations: Conversation[] = conversationsData?.data?.data?.conversations || [];
  const isSyncing: boolean = conversationsData?.data?.data?.syncing || false;

  const conversations: Conversation[] = useMemo(() => {
    const withLocalUnread = rawConversations.map((conversation) => ({
      ...conversation,
      unread: localUnreadByJid[conversation.jid] ?? 0,
    }));

    const needle = search.trim().toLowerCase();
    if (!needle) return withLocalUnread;

    return withLocalUnread.filter((conversation: Conversation) => {
      const title = formatContactTitle(conversation.title || conversation.jid).toLowerCase();
      const preview = (conversation.lastMessage || '').toLowerCase();
      const customName = (customNames[conversation.jid] || '').toLowerCase();
      const tags = (chatTags[conversation.jid] || []).join(' ').toLowerCase();
      const number = conversation.jid.split('@')[0];
      return title.includes(needle)
        || preview.includes(needle)
        || customName.includes(needle)
        || tags.includes(needle)
        || number.includes(needle.replace(/[^0-9]/g, '') || '\u0000');
    });
  }, [rawConversations, search, localUnreadByJid, customNames, chatTags]);

  const searchPhoneJid = useMemo(() => {
    const normalized = normalizePhoneToJid(search);
    if (!normalized) return '';
    return conversations.some((conversation) => conversation.jid === normalized) ? '' : normalized;
  }, [conversations, search]);

  const displayedConversations = useMemo(() => {
    let list = conversations;
    if (chatFilter === 'unread') list = list.filter((c) => c.unread > 0);
    if (chatFilter === 'groups') list = list.filter((c) => c.jid.endsWith('@g.us'));
    if (chatFilter.startsWith('tag:')) {
      const tag = chatFilter.slice(4);
      list = list.filter((c) => (chatTags[c.jid] || []).includes(tag));
    }
    const pinned = list.filter((c) => pinnedJids.includes(c.jid));
    const rest = list.filter((c) => !pinnedJids.includes(c.jid));
    list = [...pinned, ...rest];
    if (!searchPhoneJid) return list;
    return [{ jid: searchPhoneJid, title: searchPhoneJid, lastMessage: '', lastMessageAt: new Date().toISOString(), unread: 0 }, ...list];
  }, [conversations, searchPhoneJid, chatFilter, chatTags, pinnedJids]);

  const allTags = useMemo(() => {
    const set = new Set<string>();
    Object.values(chatTags).forEach((tags) => tags.forEach((tag) => set.add(tag)));
    return Array.from(set).sort();
  }, [chatTags]);

  const togglePin = (jid: string) => {
    setPinnedJids((current) => {
      const next = current.includes(jid) ? current.filter((item) => item !== jid) : [...current, jid];
      try {
        localStorage.setItem('wa-pinned-chats', JSON.stringify(next));
      } catch { /* storage unavailable */ }
      return next;
    });
  };

  const saveCustomName = (jid: string, name: string) => {
    const trimmed = name.trim();
    setCustomNames((current) => {
      const next = { ...current };
      if (trimmed) next[jid] = trimmed;
      else delete next[jid];
      try {
        localStorage.setItem('wa-chat-names', JSON.stringify(next));
      } catch { /* storage unavailable */ }
      return next;
    });
  };

  const toggleChatTag = (jid: string, tag: string) => {
    const trimmed = tag.trim();
    if (!jid || !trimmed) return;
    setChatTags((current) => {
      const existing = current[jid] || [];
      const nextForJid = existing.includes(trimmed)
        ? existing.filter((item) => item !== trimmed)
        : [...existing, trimmed];
      const next = { ...current, [jid]: nextForJid };
      if (nextForJid.length === 0) delete next[jid];
      try {
        localStorage.setItem('wa-chat-tags', JSON.stringify(next));
      } catch { /* storage full/unavailable */ }
      return next;
    });
  };

  const selectedConversation = useMemo(
    () => {
      if (selectedJid) {
        return displayedConversations.find((conversation) => conversation.jid === selectedJid)
          || { jid: selectedJid, title: selectedJid, lastMessage: '', lastMessageAt: new Date().toISOString(), unread: 0 };
      }

      return displayedConversations[0];
    },
    [displayedConversations, selectedJid],
  );

  const activeJid = selectedConversation?.jid || '';

  // Load profile pictures for the visible chat list.
  useEffect(() => {
    if (!isConnected) return;
    displayedConversations.slice(0, 30).forEach((conversation) => {
      const jid = conversation.jid;
      if (jid === 'status@broadcast') return;
      if (avatarFetchRef.current.has(jid)) return;
      avatarFetchRef.current.add(jid);
      whatsappService.getChatAvatar(jid)
        .then((res) => {
          setAvatarByJid((current) => ({ ...current, [jid]: res?.data?.data?.url ?? null }));
        })
        .catch(() => {
          avatarFetchRef.current.delete(jid);
        });
    });
  }, [displayedConversations, isConnected, avatarRefreshKey]);

  const { data: messagesData } = useQuery({
    queryKey: ['whatsapp-messages', activeJid],
    queryFn: () => whatsappService.myMessages(activeJid),
    enabled: Boolean(activeJid),
    refetchInterval: 3000,
  });

  const messages: TimelineMessage[] = useMemo(() => {
    const live: TimelineMessage[] = messagesData?.data?.data?.messages || [];
    const older = olderByJid[activeJid] || [];
    if (older.length === 0) return live;
    const liveIds = new Set(live.map((msg) => msg.id));
    return [...older.filter((msg) => !liveIds.has(msg.id)), ...live];
  }, [messagesData, olderByJid, activeJid]);

  const loadOlderMessages = () => {
    if (!activeJid || loadingOlderRef.current) return;
    if (hasMoreByJid[activeJid] === false) return;
    const earliest = messages[0];
    if (!earliest) return;
    loadingOlderRef.current = true;
    const prevHeight = timelineRef.current?.scrollHeight ?? 0;
    whatsappService.getChatHistory(activeJid, earliest.timestamp)
      .then((res) => {
        const older: TimelineMessage[] = res?.data?.data?.messages || [];
        const hasMore = Boolean(res?.data?.data?.hasMore);
        setHasMoreByJid((current) => ({ ...current, [activeJid]: hasMore && older.length > 0 }));
        if (older.length > 0) {
          setOlderByJid((current) => ({ ...current, [activeJid]: [...older, ...(current[activeJid] || [])] }));
          requestAnimationFrame(() => {
            const node = timelineRef.current;
            if (node) node.scrollTop = node.scrollHeight - prevHeight;
          });
        }
      })
      .catch(() => undefined)
      .finally(() => {
        loadingOlderRef.current = false;
      });
  };

  // Fetch inline media blobs (images, stickers, audio, video) for rendered messages.
  useEffect(() => {
    messages.forEach((msg) => {
      if (!msg.mediaType || msg.mediaType === 'document' || msg.deleted) return;
      if (mediaFetchRef.current.has(msg.id)) return;
      mediaFetchRef.current.add(msg.id);
      whatsappService.getMessageMedia(msg.id)
        .then((res) => {
          const url = URL.createObjectURL(res.data);
          setMediaUrlById((current) => ({ ...current, [msg.id]: url }));
        })
        .catch(() => {
          setMediaUrlById((current) => ({ ...current, [msg.id]: 'unavailable' }));
        });
    });
  }, [messages]);

  const downloadDocument = (msg: TimelineMessage) => {
    whatsappService.getMessageMedia(msg.id)
      .then((res) => {
        const url = URL.createObjectURL(res.data);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = msg.mediaName || 'document';
        anchor.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
      })
      .catch(() => toast.error('Media is no longer available'));
  };

  const chatTitle = selectedConversation
    ? (customNames[selectedConversation.jid] || contactTitle(selectedConversation.title || selectedConversation.jid))
    : 'Select a chat';

  const canCallChat = Boolean(activeJid && !activeJid.endsWith('@g.us'));
  const handleCall = async () => {
    if (!activeJid) return;
    if (!canCallChat) {
      toast.error('Calls are not available for group chats');
      return;
    }
    let phone = activeJid.endsWith('@s.whatsapp.net') ? activeJid.split('@')[0] : '';
    if (!phone) {
      // Privacy LID chat — resolve the real phone number from the gateway.
      try {
        const resolved = await whatsappService.getChatPhone(activeJid);
        phone = resolved.data?.data?.phone || '';
      } catch {
        phone = '';
      }
      if (!phone) {
        toast.error('Could not resolve a phone number for this contact');
        return;
      }
    }
    try {
      const lookup = await leadsService.lookupByPhone(phone);
      const lead = lookup.data?.data as { id: string; name: string | null };
      await stringeeService.startCall(lead.id, lead.name || chatTitle);
    } catch (error: any) {
      const code = error?.response?.data?.error?.code;
      if (code === 'LEAD_NOT_FOUND') {
        // Number is not in the leads module — place a direct call without
        // lead logging / status updates.
        try {
          await stringeeService.startDirectCall(`+${phone}`, chatTitle);
        } catch (directError) {
          toast.error(directError instanceof Error ? directError.message : 'Unable to start call');
        }
        return;
      }
      const message = error?.response?.data?.error?.message || (error instanceof Error ? error.message : 'Unable to start call');
      toast.error(message);
    }
  };
  const filteredMessages = useMemo(() => {
    const needle = messageSearch.trim().toLowerCase();
    if (!needle) return messages;
    return messages.filter((msg) => (msg.text || '').toLowerCase().includes(needle));
  }, [messages, messageSearch]);

  const unreadDividerId = useMemo(() => {
    if (!unreadMarker || unreadMarker.jid !== activeJid || unreadMarker.count <= 0 || messageSearch.trim()) return '';
    let remaining = unreadMarker.count;
    for (let i = filteredMessages.length - 1; i >= 0; i -= 1) {
      if (!filteredMessages[i].fromMe) {
        remaining -= 1;
        if (remaining === 0) return filteredMessages[i].id;
      }
    }
    return '';
  }, [unreadMarker, filteredMessages, activeJid, messageSearch]);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 960);
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    if (!isMobile) {
      setMobileFrameHeight(null);
      return;
    }

    const recalcMobileFrame = () => {
      const frameTop = mobileFrameRef.current?.getBoundingClientRect().top;
      if (frameTop == null) return;

      const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
      const dockElement = document.querySelector('.agent-mobile-dock') as HTMLElement | null;
      const dockTop = dockElement?.getBoundingClientRect().top ?? viewportHeight;

      const nextHeight = Math.max(300, Math.floor(dockTop - frameTop - 10));
      setMobileFrameHeight(nextHeight);
    };

    recalcMobileFrame();
    window.addEventListener('resize', recalcMobileFrame);
    window.addEventListener('orientationchange', recalcMobileFrame);
    window.visualViewport?.addEventListener('resize', recalcMobileFrame);
    window.visualViewport?.addEventListener('scroll', recalcMobileFrame);

    return () => {
      window.removeEventListener('resize', recalcMobileFrame);
      window.removeEventListener('orientationchange', recalcMobileFrame);
      window.visualViewport?.removeEventListener('resize', recalcMobileFrame);
      window.visualViewport?.removeEventListener('scroll', recalcMobileFrame);
    };
  }, [isMobile]);

  // Deep link from My Leads: /agent/whatsapp?phone=91XXXXXXXXXX opens (or
  // starts) the chat with that number, like tapping a contact in WhatsApp.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const phone = params.get('phone');
    if (!phone) return;
    const jid = normalizePhoneToJid(phone);
    if (jid) {
      setSelectedJid(jid);
      setMobilePrimaryTab('chats');
      setShowChatListOnMobile(false);
    }
    window.history.replaceState({}, '', window.location.pathname);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!isMobile) {
      setShowChatListOnMobile(true);
    }
  }, [isMobile]);

  const lastMessageId = messages.length > 0 ? messages[messages.length - 1].id : '';

  useEffect(() => {
    if (!timelineRef.current) return;
    timelineRef.current.scrollTop = timelineRef.current.scrollHeight;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastMessageId, activeJid]);

  useEffect(() => {
    const onRealtimeMessage = (payload: { jid?: string; message?: TimelineMessage }) => {
      if (!payload?.jid || !payload?.message) {
        qc.invalidateQueries({ queryKey: ['whatsapp-conversations', slot?.id] });
        return;
      }

      const jid = payload.jid;
      const incoming = payload.message;
      const incomingUnread = incoming.fromMe
        ? (unreadRef.current[jid] || 0)
        : (jid === activeJid ? 0 : (unreadRef.current[jid] || 0) + 1);

      unreadRef.current = { ...unreadRef.current, [jid]: incomingUnread };
      setLocalUnreadByJid(unreadRef.current);

      qc.setQueryData(['whatsapp-conversations', slot?.id], (prev: any) => {
        const previous = prev || { data: { data: { conversations: [], syncing: false } } };
        const list: Conversation[] = previous?.data?.data?.conversations || [];
        const existing = list.find((item) => item.jid === jid);

        const nextConversation: Conversation = {
          jid,
          title: existing?.title || formatContactTitle(jid),
          lastMessage: incoming.text || existing?.lastMessage || '(non-text message)',
          lastMessageAt: incoming.timestamp || new Date().toISOString(),
          unread: incomingUnread,
        };

        const rest = list.filter((item) => item.jid !== jid);
        return {
          ...previous,
          data: {
            ...previous.data,
            data: {
              ...previous.data?.data,
              syncing: false,
              conversations: [nextConversation, ...rest],
            },
          },
        };
      });

      qc.setQueryData(['whatsapp-messages', jid], (prev: any) => {
        const previous = prev || { data: { data: { messages: [] } } };
        const list: TimelineMessage[] = previous?.data?.data?.messages || [];
        const nextMessages = list.some((msg) => msg.id === incoming.id)
          ? list.map((msg) => (msg.id === incoming.id ? { ...msg, ...incoming } : msg))
          : [...list, incoming];

        return {
          ...previous,
          data: {
            ...previous.data,
            data: {
              ...previous.data?.data,
              messages: nextMessages,
            },
          },
        };
      });
    };

    const onRealtimeStatus = (payload: {
      jid?: string;
      messageId?: string;
      status?: TimelineMessage['status'];
      sentAt?: string | null;
      deliveredAt?: string | null;
      readAt?: string | null;
      playedAt?: string | null;
      failedAt?: string | null;
      failureCode?: string | null;
      failureReason?: string | null;
    }) => {
      if (!payload?.jid || !payload?.messageId) return;

      const jid = payload.jid;
      const messageId = payload.messageId;

      qc.setQueryData(['whatsapp-messages', jid], (prev: any) => {
        if (!prev?.data?.data?.messages) return prev;
        const list: TimelineMessage[] = prev.data.data.messages;
        const rank = (s?: TimelineMessage['status']) =>
          s === 'failed' ? 0 : s === 'pending' ? 1 : s === 'sent' ? 2 : s === 'delivered' ? 3 : s === 'read' ? 4 : s === 'played' ? 5 : -1;
        let changed = false;
        const next = list.map((msg) => {
          if (msg.id !== messageId) return msg;
          changed = true;
          const nextStatus = rank(payload.status) >= rank(msg.status) ? (payload.status || msg.status) : msg.status;
          return {
            ...msg,
            status: nextStatus,
            sentAt: payload.sentAt ?? msg.sentAt ?? null,
            deliveredAt: payload.deliveredAt ?? msg.deliveredAt ?? null,
            readAt: payload.readAt ?? msg.readAt ?? null,
            playedAt: payload.playedAt ?? msg.playedAt ?? null,
            failedAt: payload.failedAt ?? msg.failedAt ?? null,
            failureCode: payload.failureCode ?? msg.failureCode ?? null,
            failureReason: payload.failureReason ?? msg.failureReason ?? null,
          };
        });

        if (!changed) return prev;

        return {
          ...prev,
          data: {
            ...prev.data,
            data: {
              ...prev.data.data,
              messages: next,
            },
          },
        };
      });
    };

    const attach = () => {
      const socket = getSocket();
      if (!socket || socketHandlerBoundRef.current) return;

      socket.on('whatsapp:message', onRealtimeMessage);
      socket.on('whatsapp:message-status', onRealtimeStatus);
      socket.on('whatsapp:session', onRealtimeSession);
      socket.on('whatsapp:presence', onRealtimePresence);
      socket.on('whatsapp:avatar', onRealtimeAvatar);
      socketHandlerBoundRef.current = true;
    };

    function onRealtimeSession() {
      qc.invalidateQueries({ queryKey: ['whatsapp-me'] });
    }

    function onRealtimePresence(payload: { jid?: string; presence?: PresenceInfo['presence']; lastSeenAt?: string | null }) {
      if (!payload?.jid || !payload?.presence) return;
      setPresenceByJid((current) => ({
        ...current,
        [payload.jid!]: {
          presence: payload.presence!,
          lastSeenAt: payload.lastSeenAt ?? current[payload.jid!]?.lastSeenAt ?? null,
        },
      }));
    }

    function onRealtimeAvatar() {
      // A contact changed their profile picture; refetch all visible avatars.
      avatarFetchRef.current.clear();
      setAvatarRefreshKey((key) => key + 1);
    }

    attach();
    const timer = window.setInterval(attach, 1000);

    return () => {
      window.clearInterval(timer);
      const socket = getSocket();
      if (socket && socketHandlerBoundRef.current) {
        socket.off('whatsapp:message', onRealtimeMessage);
        socket.off('whatsapp:message-status', onRealtimeStatus);
        socket.off('whatsapp:session', onRealtimeSession);
        socket.off('whatsapp:presence', onRealtimePresence);
        socket.off('whatsapp:avatar', onRealtimeAvatar);
      }
      socketHandlerBoundRef.current = false;
    };
  }, [qc, slot?.id, activeJid]);

  useEffect(() => {
    if (!activeJid) return;

    const pendingUnread = unreadRef.current[activeJid] || 0;
    setUnreadMarker(pendingUnread > 0 ? { jid: activeJid, count: pendingUnread } : null);

    unreadRef.current = { ...unreadRef.current, [activeJid]: 0 };
    setLocalUnreadByJid(unreadRef.current);

    setReplyTo(null);
    setEditingMessage(null);
    setEditingName(false);
    setOpenMenuMessageId('');
    setReactionPickerMessageId('');
    setForwardingMessage(null);
    setContactInfoOpen(false);
    setPendingAttachment((current) => {
      if (current) URL.revokeObjectURL(current.url);
      return null;
    });
    setPendingVoice((current) => {
      if (current) URL.revokeObjectURL(current.url);
      return null;
    });
    setAttachmentCaption('');
    setShowEmojiPicker(false);

    // Send read receipts to WhatsApp for this chat (blue ticks on sender side).
    whatsappService.markMyChatRead(activeJid).catch(() => { /* non-blocking */ });

    // Subscribe to the contact's presence (online / last seen / typing).
    if (activeJid.endsWith('@s.whatsapp.net') || activeJid.endsWith('@lid')) {
      whatsappService.getChatPresence(activeJid)
        .then((res) => {
          const info = res?.data?.data;
          if (info?.presence) {
            setPresenceByJid((current) => ({ ...current, [activeJid]: info }));
          }
        })
        .catch(() => { /* non-blocking */ });
    }

    // Load the contact's profile picture for the header.
    if (!avatarFetchRef.current.has(activeJid) && activeJid !== 'status@broadcast') {
      avatarFetchRef.current.add(activeJid);
      whatsappService.getChatAvatar(activeJid)
        .then((res) => {
          setAvatarByJid((current) => ({ ...current, [activeJid]: res?.data?.data?.url ?? null }));
        })
        .catch(() => {
          avatarFetchRef.current.delete(activeJid);
        });
    }

    qc.setQueryData(['whatsapp-conversations', slot?.id], (prev: any) => {
      if (!prev?.data?.data?.conversations) return prev;
      const list: Conversation[] = prev.data.data.conversations;
      let changed = false;
      const next = list.map((item) => {
        if (item.jid !== activeJid || item.unread === 0) return item;
        changed = true;
        return { ...item, unread: 0 };
      });

      if (!changed) return prev;
      return {
        ...prev,
        data: {
          ...prev.data,
          data: {
            ...prev.data.data,
            conversations: next,
          },
        },
      };
    });
  }, [activeJid, qc, slot?.id]);

  useEffect(() => {
    return () => {
      try {
        mediaRecorderRef.current?.stop();
      } catch {
        // ignore cleanup errors
      }

      if (recordingStreamRef.current) {
        recordingStreamRef.current.getTracks().forEach((track) => track.stop());
        recordingStreamRef.current = null;
      }
    };
  }, []);

  const stopLiveRecording = () => {
    const recorder = mediaRecorderRef.current;
    if (!recorder) return;
    if (recorder.state !== 'inactive') {
      recorder.stop();
    }
  };

  const cancelLiveRecording = () => {
    discardRecordingRef.current = true;
    stopLiveRecording();
  };

  const startLiveRecording = async () => {
    if (!activeJid) return;

    if (typeof window === 'undefined' || typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      toast.error('Live recording is not supported in this browser');
      audioInputRef.current?.click();
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recordingStreamRef.current = stream;

      const preferredTypes = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'];
      const selectedMime = preferredTypes.find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = selectedMime ? new MediaRecorder(stream, { mimeType: selectedMime }) : new MediaRecorder(stream);

      recordingChunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          recordingChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const mimeType = recorder.mimeType || 'audio/webm';
        const blob = new Blob(recordingChunksRef.current, { type: mimeType });
        recordingChunksRef.current = [];

        if (recordingTimerRef.current) {
          window.clearInterval(recordingTimerRef.current);
          recordingTimerRef.current = null;
        }

        if (!discardRecordingRef.current && blob.size > 0) {
          const ext = mimeType.includes('ogg') ? 'ogg' : 'webm';
          const file = new File([blob], `recording-${Date.now()}.${ext}`, { type: mimeType });
          setPendingVoice((current) => {
            if (current) URL.revokeObjectURL(current.url);
            return { file, url: URL.createObjectURL(blob) };
          });
        }
        discardRecordingRef.current = false;

        if (recordingStreamRef.current) {
          recordingStreamRef.current.getTracks().forEach((track) => track.stop());
          recordingStreamRef.current = null;
        }

        mediaRecorderRef.current = null;
        setIsRecording(false);
      };

      recorder.start(300);
      mediaRecorderRef.current = recorder;
      discardRecordingRef.current = false;
      setRecordingSeconds(0);
      recordingTimerRef.current = window.setInterval(() => setRecordingSeconds((value) => value + 1), 1000);
      setIsRecording(true);
      whatsappService.sendMyPresence(activeJid, 'recording').catch(() => { /* non-blocking */ });
    } catch {
      toast.error('Microphone access denied or unavailable');
    }
  };

  const notifyTyping = () => {
    if (!activeJid) return;
    const now = Date.now();
    if (now - typingStateRef.current.lastSent > 2000) {
      typingStateRef.current.lastSent = now;
      whatsappService.sendMyPresence(activeJid, 'composing').catch(() => { /* non-blocking */ });
    }
    if (typingStateRef.current.timer) window.clearTimeout(typingStateRef.current.timer);
    typingStateRef.current.timer = window.setTimeout(() => {
      whatsappService.sendMyPresence(activeJid, 'paused').catch(() => { /* non-blocking */ });
    }, 2500);
  };

  const renderMedia = (msg: TimelineMessage) => {
    const url = mediaUrlById[msg.id];

    if (msg.mediaType === 'document') {
      return (
        <div
          style={{ display: 'flex', alignItems: 'center', gap: 8, background: T.mediaCardBg, borderRadius: 8, padding: '8px 10px', marginBottom: 4, minWidth: 180 }}
        >
          <FileText size={22} color={T.icon} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: T.bubbleText, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {msg.mediaName || 'Document'}
            </div>
            <div style={{ fontSize: 10.5, color: T.textMuted }}>{msg.mediaMime || 'file'}</div>
          </div>
          <button
            type="button"
            onClick={() => downloadDocument(msg)}
            style={{ border: `1px solid ${T.border}`, background: 'transparent', borderRadius: '50%', width: 30, height: 30, display: 'inline-grid', placeItems: 'center', cursor: 'pointer', color: T.icon }}
            title="Download"
          >
            <Download size={14} />
          </button>
        </div>
      );
    }

    if (url === 'unavailable') {
      return (
        <div style={{ fontSize: 11.5, color: T.textMuted, fontStyle: 'italic', background: T.mediaCardBg, borderRadius: 8, padding: '10px 12px', marginBottom: 4 }}>
          Media unavailable
        </div>
      );
    }

    if (!url) {
      return (
        <div style={{ width: msg.mediaType === 'sticker' ? 120 : 220, height: msg.mediaType === 'image' || msg.mediaType === 'video' || msg.mediaType === 'sticker' ? 140 : 46, background: T.mediaCardBg, borderRadius: 8, marginBottom: 4, display: 'grid', placeItems: 'center', color: T.textMuted, fontSize: 11 }}>
          Loading…
        </div>
      );
    }

    if (msg.mediaType === 'image' || msg.mediaType === 'sticker') {
      return (
        <img
          src={url}
          alt=""
          onClick={() => window.open(url, '_blank')}
          style={{ maxWidth: msg.mediaType === 'sticker' ? 140 : 260, maxHeight: 300, borderRadius: 8, marginBottom: 4, cursor: 'pointer', display: 'block' }}
        />
      );
    }

    if (msg.mediaType === 'video') {
      return (
        <video src={url} controls style={{ maxWidth: 260, maxHeight: 300, borderRadius: 8, marginBottom: 4, display: 'block' }} />
      );
    }

    if (msg.mediaType === 'audio' || msg.mediaType === 'voice') {
      return (
        <VoicePlayer
          url={url}
          durationSec={msg.mediaDurationSec}
          dark={waTheme === 'dark'}
          avatarUrl={!msg.fromMe ? avatarByJid[msg.jid] : null}
          isVoice={msg.mediaType === 'voice'}
        />
      );
    }

    return null;
  };

  const sendMutation = useMutation({
    mutationFn: ({ jid, text }: { jid: string; text: string }) => whatsappService.sendMyMessage(jid, text),
    onMutate: async ({ jid, text }) => {
      // Optimistic: clear the input and show the bubble immediately.
      const draftBackup = draft;
      setDraft('');
      const key = ['whatsapp-messages', jid];
      await qc.cancelQueries({ queryKey: key });
      qc.setQueryData(key, (old: any) => {
        if (!old?.data?.data) return old;
        const temp = {
          id: `temp-${Date.now()}`,
          jid,
          fromMe: true,
          text,
          timestamp: new Date().toISOString(),
          status: 'pending',
        };
        return {
          ...old,
          data: { ...old.data, data: { ...old.data.data, messages: [...(old.data.data.messages || []), temp] } },
        };
      });
      return { draftBackup };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['whatsapp-messages', activeJid] });
      qc.invalidateQueries({ queryKey: ['whatsapp-conversations', slot?.id] });
    },
    onError: (err: any, _vars, ctx: any) => {
      if (ctx?.draftBackup) setDraft(ctx.draftBackup);
      qc.invalidateQueries({ queryKey: ['whatsapp-messages', activeJid] });
      toast.error(err?.response?.data?.error?.message || 'Failed to send message');
    },
  });

  const sendAttachmentMutation = useMutation({
    mutationFn: ({ file, voiceNote, caption }: { file: File; voiceNote?: boolean; caption?: string }) => {
      const formData = new FormData();
      formData.append('jid', activeJid);
      formData.append('caption', (caption ?? '').trim());
      if (voiceNote) formData.append('voiceNote', 'true');
      formData.append('file', file);
      return whatsappService.sendMyAttachment(formData);
    },
    onSuccess: () => {
      if (attachmentInputRef.current) {
        attachmentInputRef.current.value = '';
      }
      setPendingAttachment((current) => {
        if (current) URL.revokeObjectURL(current.url);
        return null;
      });
      setPendingVoice((current) => {
        if (current) URL.revokeObjectURL(current.url);
        return null;
      });
      setAttachmentCaption('');
      qc.invalidateQueries({ queryKey: ['whatsapp-messages', activeJid] });
      qc.invalidateQueries({ queryKey: ['whatsapp-conversations', slot?.id] });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error?.message || 'Failed to send attachment');
    },
  });

  const sendPendingAttachment = async () => {
    if (!pendingAttachment || sendAttachmentMutation.isPending) return;
    let file = pendingAttachment.file;
    if (file.type.startsWith('image/') && imageEditorRef.current?.isDirty()) {
      const edited = await imageEditorRef.current.getEditedFile();
      if (edited) file = edited;
    }
    sendAttachmentMutation.mutate({ file, caption: attachmentCaption });
  };

  const advancedSendMutation = useMutation({
    mutationFn: async () => {
      if (!activeJid) throw new Error('Select a chat first');

      const payload: Record<string, unknown> = {
        type: advancedType,
        to: activeJid,
      };

      if (advancedText.trim()) payload.text = advancedText.trim();
      if (advancedMediaUrl.trim()) payload.media_url = advancedMediaUrl.trim();
      if (advancedCaption.trim()) payload.caption = advancedCaption.trim();
      if (advancedFilename.trim()) payload.filename = advancedFilename.trim();
      if (advancedMime.trim()) payload.mime = advancedMime.trim();
      if (advancedName.trim()) payload.name = advancedName.trim();
      if (advancedAddress.trim()) payload.address = advancedAddress.trim();
      if (advancedVcard.trim()) payload.vcard = advancedVcard.trim();
      if (advancedQuestion.trim()) payload.question = advancedQuestion.trim();
      if (advancedMessageId.trim()) payload.messageId = advancedMessageId.trim();
      if (advancedEmoji.trim()) payload.emoji = advancedEmoji.trim();
      if (advancedQuotedMessageId.trim()) payload.quotedMessageId = advancedQuotedMessageId.trim();
      if (advancedSendAt.trim()) payload.send_at = new Date(advancedSendAt).toISOString();
      if (advancedIdempotencyKey.trim()) payload.idempotency_key = advancedIdempotencyKey.trim();

      if (advancedType === 'audio') {
        payload.ptt = true;
      }

      if (advancedType === 'location') {
        payload.latitude = Number(advancedLatitude);
        payload.longitude = Number(advancedLongitude);
      }

      if (advancedType === 'poll') {
        payload.options = advancedOptions.split(',').map((item) => item.trim()).filter(Boolean);
        payload.selectableCount = Number(advancedSelectableCount || '1');
      }

      const mentions = advancedMentions.split(',').map((item) => item.trim()).filter(Boolean);
      if (mentions.length) payload.mentions = mentions;

      const recipients = advancedRecipients.split(',').map((item) => item.trim()).filter(Boolean);
      if (recipients.length > 0) {
        return whatsappService.broadcastMyPayload({
          recipients,
          payload,
          idempotency_key: advancedIdempotencyKey.trim() || undefined,
        });
      }

      return whatsappService.sendMyPayload(payload);
    },
    onSuccess: () => {
      toast.success('Advanced message sent');
      qc.invalidateQueries({ queryKey: ['whatsapp-messages', activeJid] });
      qc.invalidateQueries({ queryKey: ['whatsapp-conversations', slot?.id] });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error?.message || err?.message || 'Failed to send advanced payload');
    },
  });

  const replyMutation = useMutation({
    mutationFn: ({ text, quotedMessageId }: { text: string; quotedMessageId: string }) =>
      whatsappService.sendMyPayload({ type: 'text', to: activeJid, text, quotedMessageId }),
    onSuccess: () => {
      setDraft('');
      setReplyTo(null);
      qc.invalidateQueries({ queryKey: ['whatsapp-messages', activeJid] });
      qc.invalidateQueries({ queryKey: ['whatsapp-conversations', slot?.id] });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error?.message || 'Failed to send reply');
    },
  });

  const reactMutation = useMutation({
    mutationFn: ({ messageId, emoji }: { messageId: string; emoji: string }) =>
      whatsappService.sendMyPayload({ type: 'reaction', to: activeJid, messageId, emoji }),
    onSuccess: () => {
      setReactionPickerMessageId('');
      setOpenMenuMessageId('');
      qc.invalidateQueries({ queryKey: ['whatsapp-messages', activeJid] });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error?.message || 'Failed to send reaction');
    },
  });

  const forwardMutation = useMutation({
    mutationFn: ({ messageId, toJid }: { messageId: string; toJid: string }) =>
      whatsappService.forwardMyMessage(messageId, toJid),
    onSuccess: () => {
      setForwardingMessage(null);
      setForwardTargetJid('');
      toast.success('Message forwarded');
      qc.invalidateQueries({ queryKey: ['whatsapp-conversations', slot?.id] });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error?.message || 'Failed to forward message');
    },
  });

  const deleteMessageMutation = useMutation({
    mutationFn: (messageId: string) => whatsappService.deleteMyMessage(messageId, activeJid),
    onSuccess: () => {
      setOpenMenuMessageId('');
      toast.success('Message deleted');
      qc.invalidateQueries({ queryKey: ['whatsapp-messages', activeJid] });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error?.message || 'Failed to delete message');
    },
  });

  const editMessageMutation = useMutation({
    mutationFn: ({ messageId, text }: { messageId: string; text: string }) =>
      whatsappService.editMyMessage(messageId, activeJid, text),
    onSuccess: () => {
      setDraft('');
      setEditingMessage(null);
      toast.success('Message edited');
      qc.invalidateQueries({ queryKey: ['whatsapp-messages', activeJid] });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error?.message || 'Failed to edit message');
    },
  });

  return (
    <AppLayout>
      <style>{`
        .wa-react-trigger { opacity: 0; transition: opacity 0.12s ease; }
        .wa-bubble-row:hover .wa-react-trigger { opacity: 1; }
        .wa-msg-chevron { opacity: 0; transition: opacity 0.12s ease; }
        .wa-bubble-row:hover .wa-msg-chevron { opacity: 1; }
        .wa-react-emoji { transition: transform 0.1s ease; }
        .wa-react-emoji:hover { transform: scale(1.35); }
        .wa-pin-btn { opacity: 0; transition: opacity 0.12s ease; }
        .wa-chat-row:hover .wa-pin-btn { opacity: 0.8; }
        .wa-pin-btn.pinned { opacity: 0.9; }
      `}</style>
      <div
        ref={mobileFrameRef}
        className="page-container"
        style={isMobile ? { padding: 0, maxWidth: '100%', width: '100%', height: mobileFrameHeight ? `${mobileFrameHeight}px` : '100%', minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', flex: 1 } : undefined}
      >
        <div
          className="card"
          style={{
            margin: 0,
            padding: 0,
            overflow: 'hidden',
            borderRadius: isMobile ? 0 : 12,
            position: 'relative',
            background: T.outerBg,
            minHeight: isMobile ? '100%' : 'calc(100vh - 140px)',
            height: isMobile ? '100%' : undefined,
            flex: isMobile ? 1 : undefined,
            display: isMobile ? 'flex' : undefined,
            flexDirection: isMobile ? 'column' : undefined,
          }}
        >
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: isMobile ? 96 : 112,
              background: T.stripBg,
              pointerEvents: 'none',
            }}
          />
          {isLoading ? (
            <div className="empty-state" style={{ minHeight: 620, position: 'relative', zIndex: 1 }}>
              <RefreshCw className="spin" size={20} />
              <p>Loading chats…</p>
            </div>
          ) : slot && !isConnected ? (
            <div
              style={{
                position: 'relative',
                zIndex: 1,
                margin: isMobile ? 0 : 16,
                minHeight: isMobile ? '100%' : 460,
                height: isMobile ? '100%' : undefined,
                borderRadius: isMobile ? 0 : 10,
                background: T.panelBg,
                boxShadow: isMobile ? 'none' : '0 6px 18px rgba(11,20,26,0.15)',
                display: 'grid',
                placeItems: 'center',
                padding: 32,
              }}
            >
              <div style={{ textAlign: 'center', maxWidth: 420 }}>
                <div style={{ display: 'inline-grid', placeItems: 'center', width: 56, height: 56, borderRadius: '50%', background: '#fff4e5', color: '#f59e0b', marginBottom: 12 }}>
                  <MessageSquare size={26} />
                </div>
                <h3 style={{ margin: '0 0 6px', color: T.textPrimary }}>WhatsApp is not connected</h3>
                <p style={{ margin: '0 0 16px', fontSize: 13, color: T.textSecondary }}>
                  Your WhatsApp session is {sessionState}. Please contact your administrator to link WhatsApp for your account.
                </p>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => qc.invalidateQueries({ queryKey: ['whatsapp-me'] })}
                >
                  <RefreshCw size={14} /> Check again
                </button>
              </div>
            </div>
          ) : slot ? (
            <div
              style={{
                display: isMobile ? 'flex' : 'grid',
                flexDirection: isMobile ? 'column' : undefined,
                gridTemplateColumns: isMobile ? undefined : contactInfoOpen && activeJid ? '340px 1fr 300px' : '340px 1fr',
                height: isMobile ? undefined : 'clamp(460px, calc(100vh - 190px), 760px)',
                maxHeight: isMobile ? '100%' : 'calc(100vh - 190px)',
                minHeight: 0,
                flex: isMobile ? 1 : undefined,
                margin: isMobile ? 0 : 16,
                borderRadius: isMobile ? 0 : 10,
                overflow: 'hidden',
                boxShadow: isMobile ? 'none' : '0 6px 18px rgba(11,20,26,0.15)',
                position: 'relative',
                zIndex: 1,
              }}
            >
              <div
                style={{
                  borderRight: `1px solid ${T.border}`,
                  overflow: 'hidden',
                  background: T.sidebarBg,
                  height: isMobile ? undefined : undefined,
                  flex: isMobile ? 1 : undefined,
                  display: isMobile && !showChatListOnMobile ? 'none' : 'flex',
                  flexDirection: 'column',
                  minHeight: 0,
                }}
              >
                <div
                  style={{
                    padding: 10,
                    borderBottom: `1px solid ${T.border}`,
                    background: T.headerBg,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: '50%',
                        background: T.avatarBg,
                        display: 'grid',
                        placeItems: 'center',
                        color: T.avatarText,
                        fontWeight: 700,
                      }}
                    >
                      A
                    </div>
                    <div style={{ fontWeight: 700, color: T.textPrimary }}>WhatsApp</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, color: T.icon }}>
                    <button
                      type="button"
                      onClick={toggleWaTheme}
                      title={waTheme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
                      style={{ border: 'none', background: 'transparent', color: T.icon, display: 'inline-grid', placeItems: 'center', cursor: 'pointer', padding: 0 }}
                    >
                      {waTheme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
                    </button>
                    <RefreshCw size={16} style={{ cursor: 'pointer' }} onClick={() => qc.invalidateQueries({ queryKey: ['whatsapp-conversations', slot?.id] })} />
                    <MoreVertical size={16} />
                  </div>
                </div>
                {isMobile ? (
                  <div style={{ background: T.headerBg, borderBottom: `1px solid ${T.border}`, display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
                    <button
                      type="button"
                      onClick={() => {
                        setMobilePrimaryTab('chats');
                        setShowChatListOnMobile(true);
                      }}
                      style={{
                        border: 'none',
                        background: 'transparent',
                        color: mobilePrimaryTab === 'chats' ? '#00a884' : T.textSecondary,
                        fontWeight: 700,
                        letterSpacing: 0.4,
                        fontSize: 13,
                        padding: '12px 8px 10px',
                        borderBottom: mobilePrimaryTab === 'chats' ? '2px solid #00a884' : '2px solid transparent',
                      }}
                    >
                      CHATS
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setMobilePrimaryTab('calls');
                        setShowChatListOnMobile(true);
                      }}
                      style={{
                        border: 'none',
                        background: 'transparent',
                        color: mobilePrimaryTab === 'calls' ? '#00a884' : T.textSecondary,
                        fontWeight: 700,
                        letterSpacing: 0.4,
                        fontSize: 13,
                        padding: '12px 8px 10px',
                        borderBottom: mobilePrimaryTab === 'calls' ? '2px solid #00a884' : '2px solid transparent',
                      }}
                    >
                      CALLS
                    </button>
                  </div>
                ) : null}
                <div style={{ padding: '10px 10px 0', background: T.sidebarBg }}>
                  <div style={{ position: 'relative' }}>
                    <Search size={14} style={{ position: 'absolute', top: 11, left: 12, color: T.textMuted }} />
                    <input
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="Search or start a new chat"
                      style={{
                        width: '100%',
                        border: 'none',
                        borderRadius: 18,
                        padding: '9px 12px 9px 36px',
                        fontSize: 13,
                        background: T.searchBg,
                        color: T.textPrimary,
                        outline: 'none',
                      }}
                    />
                  </div>
                  <div style={{ display: 'flex', gap: 6, padding: '10px 0', alignItems: 'center', position: 'relative' }}>
                    {([['all', 'All'], ['unread', 'Unread'], ['groups', 'Groups']] as const).map(([key, label]) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setChatFilter(key)}
                        style={{
                          border: 'none',
                          borderRadius: 16,
                          padding: '6px 14px',
                          fontSize: 12.5,
                          fontWeight: 600,
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 5,
                          background: chatFilter === key ? T.chipActiveBg : T.chipBg,
                          color: chatFilter === key ? T.chipActiveText : T.chipText,
                        }}
                      >
                        {label}
                      </button>
                    ))}
                    {allTags.length > 0 ? (
                      <button
                        type="button"
                        onClick={() => setLabelsMenuOpen((current) => !current)}
                        style={{
                          border: 'none',
                          borderRadius: 16,
                          padding: '6px 10px 6px 14px',
                          fontSize: 12.5,
                          fontWeight: 600,
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 5,
                          background: chatFilter.startsWith('tag:') ? T.chipActiveBg : T.chipBg,
                          color: chatFilter.startsWith('tag:') ? T.chipActiveText : T.chipText,
                        }}
                      >
                        {chatFilter.startsWith('tag:') ? (
                          <>
                            <span style={{ width: 8, height: 8, borderRadius: '50%', background: tagColor(chatFilter.slice(4)) }} />
                            {chatFilter.slice(4)}
                            <X
                              size={13}
                              onClick={(event) => {
                                event.stopPropagation();
                                setChatFilter('all');
                                setLabelsMenuOpen(false);
                              }}
                            />
                          </>
                        ) : (
                          <>
                            Labels
                            <ChevronDown size={14} />
                          </>
                        )}
                      </button>
                    ) : null}
                    {labelsMenuOpen ? (
                      <>
                        <div onClick={() => setLabelsMenuOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 24 }} />
                        <div
                          style={{
                            position: 'absolute',
                            top: '100%',
                            left: 0,
                            zIndex: 25,
                            background: T.menuBg,
                            borderRadius: 10,
                            boxShadow: '0 6px 24px rgba(11,20,26,0.3)',
                            padding: 6,
                            minWidth: 180,
                            maxHeight: 260,
                            overflowY: 'auto',
                            display: 'grid',
                          }}
                        >
                          {allTags.map((tag) => {
                            const active = chatFilter === `tag:${tag}`;
                            const count = conversations.filter((c) => (chatTags[c.jid] || []).includes(tag)).length;
                            return (
                              <button
                                key={tag}
                                type="button"
                                onClick={() => {
                                  setChatFilter(active ? 'all' : `tag:${tag}`);
                                  setLabelsMenuOpen(false);
                                }}
                                style={{
                                  border: 'none',
                                  background: active ? T.activeRow : 'transparent',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 8,
                                  padding: '8px 10px',
                                  borderRadius: 6,
                                  fontSize: 13,
                                  color: T.textPrimary,
                                  textAlign: 'left',
                                }}
                              >
                                <span style={{ width: 10, height: 10, borderRadius: '50%', background: tagColor(tag), flexShrink: 0 }} />
                                <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{tag}</span>
                                <span style={{ fontSize: 11, color: T.textMuted }}>{count}</span>
                              </button>
                            );
                          })}
                        </div>
                      </>
                    ) : null}
                  </div>
                </div>
                <div
                  style={{
                    flex: 1,
                    minHeight: 0,
                    overflowY: 'auto',
                    WebkitOverflowScrolling: 'touch',
                    overscrollBehavior: 'contain',
                    touchAction: 'pan-y',
                  }}
                >
                {isMobile && mobilePrimaryTab === 'calls' ? (
                  <div style={{ padding: 18, display: 'grid', gap: 12 }}>
                    <div style={{ fontSize: 16, fontWeight: 700, color: T.textPrimary }}>Calls</div>
                    <div style={{ fontSize: 13, color: T.textSecondary, lineHeight: 1.5 }}>
                      WhatsApp calling will be implemented later. Current CRM Stringee calling remains unchanged and is available from lead and chat call actions.
                    </div>
                  </div>
                ) : null}
                {(!isMobile || mobilePrimaryTab === 'chats') ? (
                <>
                {displayedConversations.length === 0 && (
                  <div style={{ padding: 16, color: 'var(--text-muted)', fontSize: 13 }}>
                    {sessionState === 'connected' ? (
                      isSyncing ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <RefreshCw size={14} className="spin" />
                          Syncing chats from WhatsApp…
                        </div>
                      ) : (
                        <div>
                          No chats yet. Send or receive a message to start.
                          <div style={{ marginTop: 10 }}>
                            <button
                              type="button"
                              className="btn btn-secondary"
                              style={{ fontSize: 12 }}
                              onClick={() => qc.invalidateQueries({ queryKey: ['whatsapp-conversations', slot?.id] })}
                            >
                              <RefreshCw size={12} /> Sync chats
                            </button>
                          </div>
                        </div>
                      )
                    ) : (
                      <div>
                        {`WhatsApp is ${sessionState}. Please contact your administrator to link WhatsApp.`}
                      </div>
                    )}
                  </div>
                )}
                {displayedConversations.map((conversation) => {
                  const active = conversation.jid === activeJid;
                  const chatTitle = customNames[conversation.jid] || contactTitle(conversation.title || conversation.jid);
                  const unread = conversation.jid === activeJid ? 0 : conversation.unread;
                  return (
                    <button
                      key={conversation.jid}
                      type="button"
                      className="wa-chat-row"
                      onClick={() => {
                        setSelectedJid(conversation.jid);
                        if (isMobile) setMobilePrimaryTab('chats');
                        if (isMobile) setShowChatListOnMobile(false);
                      }}
                      style={{
                        width: '100%',
                        textAlign: 'left',
                        padding: '12px 14px',
                        border: 'none',
                        borderBottom: `1px solid ${T.softBorder}`,
                        background: active ? T.activeRow : 'transparent',
                        cursor: 'pointer',
                        display: 'grid',
                        gridTemplateColumns: '40px 1fr auto',
                        gap: 10,
                        alignItems: 'center',
                      }}
                    >
                      <div
                        style={{
                          width: 40,
                          height: 40,
                          borderRadius: '50%',
                          background: T.avatarBg,
                          color: T.avatarText,
                          display: 'grid',
                          placeItems: 'center',
                          fontWeight: 700,
                          fontSize: 14,
                          overflow: 'hidden',
                          flexShrink: 0,
                        }}
                      >
                        {avatarByJid[conversation.jid] ? (
                          <img src={avatarByJid[conversation.jid]!} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                          chatTitle.slice(0, 1).toUpperCase()
                        )}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 600, color: T.textPrimary, display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                          <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{chatTitle}</span>
                          {(chatTags[conversation.jid] || []).slice(0, 2).map((tag) => (
                            <span
                              key={tag}
                              style={{
                                fontSize: 10,
                                fontWeight: 700,
                                padding: '1px 7px',
                                borderRadius: 8,
                                background: `${tagColor(tag)}22`,
                                color: tagColor(tag),
                                whiteSpace: 'nowrap',
                                flexShrink: 0,
                              }}
                            >
                              {tag}
                            </span>
                          ))}
                          {(chatTags[conversation.jid] || []).length > 2 ? (
                            <span
                              title={(chatTags[conversation.jid] || []).slice(2).join(', ')}
                              style={{
                                fontSize: 10,
                                fontWeight: 700,
                                padding: '1px 6px',
                                borderRadius: 8,
                                background: T.chipBg,
                                color: T.textSecondary,
                                whiteSpace: 'nowrap',
                                flexShrink: 0,
                              }}
                            >
                              +{(chatTags[conversation.jid] || []).length - 2}
                            </span>
                          ) : null}
                        </div>
                        <div style={{ fontSize: 12, color: T.textSecondary, marginTop: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {conversation.lastMessage || '(no text preview)'}
                        </div>
                      </div>
                      <div style={{ fontSize: 11, color: T.textMuted, textAlign: 'right' }}>
                        <div>{new Date(conversation.lastMessageAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4, marginTop: 5 }}>
                          <span
                            className={`wa-pin-btn${pinnedJids.includes(conversation.jid) ? ' pinned' : ''}`}
                            title={pinnedJids.includes(conversation.jid) ? 'Unpin chat' : 'Pin chat'}
                            onClick={(event) => {
                              event.stopPropagation();
                              togglePin(conversation.jid);
                            }}
                            style={{
                              display: 'inline-grid',
                              placeItems: 'center',
                              width: 20,
                              height: 20,
                              borderRadius: '50%',
                              cursor: 'pointer',
                              color: pinnedJids.includes(conversation.jid) ? '#00a884' : T.icon,
                              transform: pinnedJids.includes(conversation.jid) ? 'rotate(45deg)' : 'none',
                            }}
                          >
                            <Pin size={14} fill={pinnedJids.includes(conversation.jid) ? 'currentColor' : 'none'} />
                          </span>
                          {unread > 0 ? (
                            <span
                              style={{
                                display: 'inline-grid',
                                placeItems: 'center',
                                minWidth: 20,
                                height: 20,
                                borderRadius: 10,
                                background: T.unreadBg,
                                color: T.unreadText,
                                fontWeight: 700,
                                padding: '0 6px',
                              }}
                            >
                              {unread}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </button>
                  );
                })}
                </>
                ) : null}
                </div>
              </div>

              <div
                style={{
                  display: isMobile && (showChatListOnMobile || mobilePrimaryTab === 'calls') ? 'none' : 'flex',
                  flexDirection: 'column',
                  height: isMobile ? undefined : undefined,
                  flex: isMobile ? 1 : undefined,
                  minWidth: 0,
                  minHeight: 0,
                  overflow: 'hidden',
                  background: T.timelineBg,
                  position: 'relative',
                }}
              >
                <div
                  style={{
                    padding: 10,
                    borderBottom: `1px solid ${T.border}`,
                    fontWeight: 600,
                    background: T.headerBg,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 8,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                    {isMobile ? (
                      <button
                        type="button"
                        onClick={() => {
                          setShowChatListOnMobile(true);
                          setMobilePrimaryTab('chats');
                        }}
                        style={{ border: 'none', background: 'transparent', display: 'inline-grid', placeItems: 'center', cursor: 'pointer', color: T.icon }}
                      >
                        <ArrowLeft size={18} />
                      </button>
                    ) : null}
                    <div
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: '50%',
                        background: T.avatarBg,
                        color: T.avatarText,
                        display: 'grid',
                        placeItems: 'center',
                        fontWeight: 700,
                        flexShrink: 0,
                        overflow: 'hidden',
                      }}
                    >
                      {avatarByJid[activeJid] ? (
                        <img src={avatarByJid[activeJid]!} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                        chatTitle.slice(0, 1).toUpperCase()
                      )}
                    </div>
                    <div
                      style={{ minWidth: 0, cursor: activeJid ? 'pointer' : 'default', display: 'flex', alignItems: 'center', gap: 8 }}
                    >
                      {editingName && activeJid ? (
                        <input
                          autoFocus
                          value={nameDraft}
                          onChange={(event) => setNameDraft(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                              saveCustomName(activeJid, nameDraft);
                              setEditingName(false);
                            }
                            if (event.key === 'Escape') setEditingName(false);
                          }}
                          onBlur={() => {
                            saveCustomName(activeJid, nameDraft);
                            setEditingName(false);
                          }}
                          placeholder={contactTitle(selectedConversation?.title || activeJid)}
                          style={{
                            border: `1px solid #00a884`,
                            borderRadius: 6,
                            padding: '4px 8px',
                            fontSize: 13.5,
                            fontWeight: 600,
                            background: T.inputBg,
                            color: T.textPrimary,
                            outline: 'none',
                            minWidth: 160,
                          }}
                        />
                      ) : (
                        <div
                          style={{ minWidth: 0 }}
                          onClick={() => {
                            if (activeJid) setContactInfoOpen((value) => !value);
                          }}
                        >
                          <div style={{ color: T.textPrimary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {chatTitle}
                            {customNames[activeJid] ? (
                              <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 400, color: T.textMuted }}>
                                {contactTitle(selectedConversation?.title || activeJid)}
                              </span>
                            ) : null}
                          </div>
                          {(() => {
                            const line = formatPresenceLine(presenceByJid[activeJid]);
                            return line ? (
                              <div style={{ fontSize: 11, color: line === 'typing…' || line === 'recording audio…' ? '#00a884' : T.textSecondary }}>
                                {line}
                              </div>
                            ) : null;
                          })()}
                        </div>
                      )}
                      {activeJid && !editingName ? (
                        <button
                          type="button"
                          title="Set custom name"
                          onClick={(event) => {
                            event.stopPropagation();
                            setNameDraft(customNames[activeJid] || '');
                            setEditingName(true);
                          }}
                          style={{ border: 'none', background: 'transparent', color: T.icon, display: 'inline-grid', placeItems: 'center', cursor: 'pointer', padding: 2, opacity: 0.7, flexShrink: 0 }}
                        >
                          <Pencil size={13} />
                        </button>
                      ) : null}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14, color: T.icon }}>
                    <Video size={17} />
                    <button
                      type="button"
                      title={canCallChat ? 'Call via Stringee' : 'Calls are not available for group chats'}
                      onClick={() => void handleCall()}
                      style={{ border: 'none', background: 'transparent', color: T.icon, display: 'inline-grid', placeItems: 'center', cursor: canCallChat ? 'pointer' : 'not-allowed', padding: 0, opacity: canCallChat ? 1 : 0.45 }}
                    >
                      <Phone size={16} />
                    </button>
                    <button
                      type="button"
                      title="Tag this chat"
                      onClick={() => { setTagPickerOpen((current) => !current); setMessageSearchOpen(false); }}
                      style={{ border: 'none', background: 'transparent', color: tagPickerOpen ? '#00a884' : T.icon, display: 'inline-grid', placeItems: 'center', cursor: 'pointer', padding: 0 }}
                    >
                      <Tag size={16} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setMessageSearchOpen((current) => !current)}
                      style={{ border: 'none', background: 'transparent', color: T.icon, display: 'inline-grid', placeItems: 'center', cursor: 'pointer', padding: 0 }}
                    >
                      <Search size={16} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowAdvancedSend((value) => !value)}
                      style={{ border: 'none', background: 'transparent', color: T.icon, display: 'inline-grid', placeItems: 'center', cursor: 'pointer', padding: 0 }}
                    >
                      <MoreVertical size={16} />
                    </button>
                  </div>
                </div>
                {tagPickerOpen && activeJid ? (
                  <div style={{ padding: '10px 12px', borderBottom: `1px solid ${T.border}`, background: T.headerBg, display: 'grid', gap: 8 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: T.textPrimary }}>Tags for {chatTitle}</div>
                    {allTags.length > 0 ? (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {allTags.map((tag) => {
                          const applied = (chatTags[activeJid] || []).includes(tag);
                          return (
                            <button
                              key={tag}
                              type="button"
                              onClick={() => toggleChatTag(activeJid, tag)}
                              style={{
                                border: `1.5px solid ${tagColor(tag)}`,
                                borderRadius: 14,
                                padding: '4px 12px',
                                fontSize: 12,
                                fontWeight: 600,
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 5,
                                background: applied ? tagColor(tag) : 'transparent',
                                color: applied ? '#ffffff' : tagColor(tag),
                              }}
                            >
                              {tag}
                              {applied ? <X size={12} /> : null}
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <div style={{ fontSize: 12, color: T.textSecondary }}>No tags yet. Create one below.</div>
                    )}
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input
                        value={newTagInput}
                        onChange={(event) => setNewTagInput(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' && newTagInput.trim()) {
                            toggleChatTag(activeJid, newTagInput);
                            setNewTagInput('');
                          }
                        }}
                        placeholder="New tag (e.g. Hot lead, Follow up)"
                        style={{ flex: 1, border: `1px solid ${T.border}`, borderRadius: 8, padding: '7px 10px', fontSize: 12.5, background: T.inputBg, color: T.textPrimary, outline: 'none' }}
                      />
                      <button
                        type="button"
                        disabled={!newTagInput.trim()}
                        onClick={() => {
                          if (!newTagInput.trim()) return;
                          toggleChatTag(activeJid, newTagInput);
                          setNewTagInput('');
                        }}
                        style={{ border: 'none', borderRadius: 8, padding: '7px 14px', fontSize: 12.5, fontWeight: 600, cursor: newTagInput.trim() ? 'pointer' : 'default', background: '#00a884', color: '#ffffff', opacity: newTagInput.trim() ? 1 : 0.5 }}
                      >
                        Add
                      </button>
                    </div>
                  </div>
                ) : null}

                {messageSearchOpen ? (
                  <div style={{ padding: '8px 10px', borderBottom: `1px solid ${T.border}`, background: T.headerBg }}>
                    <input
                      className="form-input"
                      value={messageSearch}
                      onChange={(event) => setMessageSearch(event.target.value)}
                      placeholder="Search in this chat"
                      style={{ background: T.inputBg, border: `1px solid ${T.border}`, color: T.textPrimary }}
                    />
                    <div style={{ marginTop: 6, fontSize: 11, color: T.textSecondary }}>
                      {messageSearch.trim() ? `${filteredMessages.length} matching message${filteredMessages.length === 1 ? '' : 's'}` : 'Type to search messages in this chat'}
                    </div>
                  </div>
                ) : null}

                {showAdvancedSend ? (
                  <div style={{ padding: 10, borderBottom: '1px solid #d1d7db', background: '#ffffff', display: 'grid', gap: 8 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#111b21' }}>Advanced Send</div>
                    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '170px 1fr 1fr', gap: 8 }}>
                      <select className="form-input" value={advancedType} onChange={(e) => setAdvancedType(e.target.value as any)}>
                        <option value="text">Text</option>
                        <option value="image">Image</option>
                        <option value="video">Video</option>
                        <option value="audio">Voice Note (PTT)</option>
                        <option value="document">Document</option>
                        <option value="sticker">Sticker</option>
                        <option value="contact">Contact (vCard)</option>
                        <option value="location">Location</option>
                        <option value="poll">Poll</option>
                        <option value="reaction">Reaction</option>
                      </select>
                      <input className="form-input" value={advancedMentions} onChange={(e) => setAdvancedMentions(e.target.value)} placeholder="Mentions comma separated" />
                      <input className="form-input" value={advancedRecipients} onChange={(e) => setAdvancedRecipients(e.target.value)} placeholder="Broadcast recipients (comma separated)" />
                    </div>

                    <input className="form-input" value={advancedText} onChange={(e) => setAdvancedText(e.target.value)} placeholder="Text / Caption" />

                    {(advancedType === 'image' || advancedType === 'video' || advancedType === 'audio' || advancedType === 'document' || advancedType === 'sticker') ? (
                      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 220px 220px', gap: 8 }}>
                        <input className="form-input" value={advancedMediaUrl} onChange={(e) => setAdvancedMediaUrl(e.target.value)} placeholder="Media URL" />
                        <input className="form-input" value={advancedFilename} onChange={(e) => setAdvancedFilename(e.target.value)} placeholder="Filename (document)" />
                        <input className="form-input" value={advancedMime} onChange={(e) => setAdvancedMime(e.target.value)} placeholder="MIME type" />
                      </div>
                    ) : null}

                    {advancedType === 'contact' ? (
                      <div style={{ display: 'grid', gap: 8 }}>
                        <input className="form-input" value={advancedName} onChange={(e) => setAdvancedName(e.target.value)} placeholder="Contact name" />
                        <textarea className="form-input" value={advancedVcard} onChange={(e) => setAdvancedVcard(e.target.value)} placeholder="vCard content" rows={3} />
                      </div>
                    ) : null}

                    {advancedType === 'location' ? (
                      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr 1fr', gap: 8 }}>
                        <input className="form-input" value={advancedLatitude} onChange={(e) => setAdvancedLatitude(e.target.value)} placeholder="Latitude" />
                        <input className="form-input" value={advancedLongitude} onChange={(e) => setAdvancedLongitude(e.target.value)} placeholder="Longitude" />
                        <input className="form-input" value={advancedName} onChange={(e) => setAdvancedName(e.target.value)} placeholder="Location name" />
                        <input className="form-input" value={advancedAddress} onChange={(e) => setAdvancedAddress(e.target.value)} placeholder="Address" />
                      </div>
                    ) : null}

                    {advancedType === 'poll' ? (
                      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 160px', gap: 8 }}>
                        <input className="form-input" value={advancedQuestion} onChange={(e) => setAdvancedQuestion(e.target.value)} placeholder="Poll question" />
                        <input className="form-input" value={advancedOptions} onChange={(e) => setAdvancedOptions(e.target.value)} placeholder="Options comma separated" />
                        <input className="form-input" value={advancedSelectableCount} onChange={(e) => setAdvancedSelectableCount(e.target.value)} placeholder="Selectable count" />
                      </div>
                    ) : null}

                    {advancedType === 'reaction' ? (
                      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 140px', gap: 8 }}>
                        <input className="form-input" value={advancedMessageId} onChange={(e) => setAdvancedMessageId(e.target.value)} placeholder="Target message ID" />
                        <input className="form-input" value={advancedEmoji} onChange={(e) => setAdvancedEmoji(e.target.value)} placeholder="Emoji" />
                      </div>
                    ) : null}

                    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr', gap: 8 }}>
                      <input className="form-input" value={advancedQuotedMessageId} onChange={(e) => setAdvancedQuotedMessageId(e.target.value)} placeholder="Reply-to message ID (optional)" />
                      <input className="form-input" value={advancedSendAt} onChange={(e) => setAdvancedSendAt(e.target.value)} type="datetime-local" placeholder="Send at" />
                      <input className="form-input" value={advancedIdempotencyKey} onChange={(e) => setAdvancedIdempotencyKey(e.target.value)} placeholder="Idempotency key" />
                    </div>

                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                      <button type="button" className="btn btn-secondary" onClick={() => setShowAdvancedSend(false)}>
                        Close
                      </button>
                      <button
                        type="button"
                        className="btn btn-primary"
                        disabled={!activeJid || advancedSendMutation.isPending}
                        onClick={() => advancedSendMutation.mutate()}
                      >
                        <Send size={14} /> Send Advanced
                      </button>
                    </div>
                  </div>
                ) : null}

                {forwardingMessage ? (
                  <div style={{ padding: '8px 10px', borderBottom: '1px solid #d1d7db', background: '#fff8e6', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <Forward size={14} color="#8a6d1a" />
                    <span style={{ fontSize: 12, color: '#8a6d1a', maxWidth: 220, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      Forward: {forwardingMessage.text || '(non-text message)'}
                    </span>
                    <select
                      className="form-input"
                      value={forwardTargetJid}
                      onChange={(event) => setForwardTargetJid(event.target.value)}
                      style={{ flex: 1, minWidth: 160, fontSize: 12 }}
                    >
                      <option value="">Select chat…</option>
                      {rawConversations.filter((c) => c.jid !== activeJid).map((c) => (
                        <option key={c.jid} value={c.jid}>{customNames[c.jid] || contactTitle(c.title || c.jid)}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="btn btn-primary"
                      style={{ fontSize: 12, padding: '4px 10px' }}
                      disabled={!forwardTargetJid || forwardMutation.isPending}
                      onClick={() => forwardMutation.mutate({ messageId: forwardingMessage.id, toJid: forwardTargetJid })}
                    >
                      Forward
                    </button>
                    <button
                      type="button"
                      onClick={() => { setForwardingMessage(null); setForwardTargetJid(''); }}
                      style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#8a6d1a', display: 'inline-grid', placeItems: 'center' }}
                    >
                      <X size={14} />
                    </button>
                  </div>
                ) : null}

                <div
                  ref={timelineRef}
                  onScroll={(event) => {
                    if (event.currentTarget.scrollTop < 60 && !messageSearch.trim()) {
                      loadOlderMessages();
                    }
                  }}
                  style={{
                    flex: 1,
                    minHeight: 0,
                    padding: 14,
                    overflowY: 'auto',
                    WebkitOverflowScrolling: 'touch',
                    overscrollBehavior: 'contain',
                    touchAction: 'pan-y',
                    display: 'grid',
                    gap: 10,
                    alignContent: 'start',
                    alignItems: 'start',
                    backgroundColor: T.timelineBg,
                    backgroundImage: `radial-gradient(${T.timelineDot} 0.45px, transparent 0.45px)`,
                    backgroundSize: '14px 14px',
                  }}
                >
                  {!selectedConversation && (
                    <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Pick a chat from the left side.</div>
                  )}
                  {selectedConversation && filteredMessages.length === 0 && !messageSearch.trim() && (
                    <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>No messages yet for this chat.</div>
                  )}
                  {selectedConversation && filteredMessages.length === 0 && messageSearch.trim() && (
                    <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>No messages match your search.</div>
                  )}
                  {filteredMessages.map((msg, idx) => {
                    const prev = filteredMessages[idx - 1];
                    const showDay = !prev || messageDayKey(prev.timestamp) !== messageDayKey(msg.timestamp);
                    const effectiveStatus = msg.status
                      || (msg.playedAt ? 'played' : msg.readAt ? 'read' : msg.deliveredAt ? 'delivered' : msg.sentAt ? 'sent' : 'pending');

                    const tickText = (effectiveStatus === 'pending' || effectiveStatus === 'sent')
                      ? '✓'
                      : effectiveStatus === 'failed'
                        ? '!'
                        : '✓✓';

                    const tickColor = effectiveStatus === 'read' || effectiveStatus === 'played'
                      ? '#53bdeb'
                      : effectiveStatus === 'failed'
                        ? '#d9480f'
                        : '#8696a0';

                    const isMediaOnly = Boolean(
                      msg.mediaType
                      && (msg.mediaType === 'image' || msg.mediaType === 'video' || msg.mediaType === 'sticker')
                      && !msg.text
                      && !msg.deleted,
                    );
                    const overlayTime = isMediaOnly && msg.mediaType !== 'sticker';

                    return (
                      <div key={msg.id} style={{ display: 'contents' }}>
                        {showDay ? (
                          <div
                            style={{
                              justifySelf: 'center',
                              background: T.dayChipBg,
                              color: T.dayChipText,
                              fontSize: 11,
                              padding: '4px 10px',
                              borderRadius: 6,
                              boxShadow: '0 1px 0 rgba(11,20,26,0.1)',
                            }}
                          >
                            {formatDayLabel(msg.timestamp)}
                          </div>
                        ) : null}
                        {unreadDividerId === msg.id ? (
                          <div
                            style={{
                              justifySelf: 'center',
                              width: '100%',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 10,
                            }}
                          >
                            <div style={{ flex: 1, height: 1, background: T.softBorder }} />
                            <div
                              style={{
                                background: T.dayChipBg,
                                color: waTheme === 'dark' ? '#8696a0' : '#008069',
                                fontSize: 11,
                                fontWeight: 600,
                                letterSpacing: 0.4,
                                padding: '4px 12px',
                                borderRadius: 6,
                                boxShadow: '0 1px 0 rgba(11,20,26,0.1)',
                                textTransform: 'uppercase',
                              }}
                            >
                              {unreadMarker?.count === 1 ? '1 unread message' : `${unreadMarker?.count} unread messages`}
                            </div>
                            <div style={{ flex: 1, height: 1, background: T.softBorder }} />
                          </div>
                        ) : null}
                        <div
                          className="wa-bubble-row"
                          style={{
                            justifySelf: msg.fromMe ? 'end' : 'start',
                            maxWidth: '72%',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            flexDirection: msg.fromMe ? 'row-reverse' : 'row',
                            position: 'relative',
                          }}
                        >
                        <div
                          id={`wa-msg-${msg.id}`}
                          style={{
                            maxWidth: '100%',
                            width: 'fit-content',
                            padding: isMediaOnly ? 4 : '7px 22px 8px 9px',
                            borderRadius: msg.fromMe ? '8px 8px 2px 8px' : '8px 8px 8px 2px',
                            background: msg.fromMe ? T.bubbleOut : T.bubbleIn,
                            color: T.bubbleText,
                            boxShadow: '0 1px 0 rgba(11,20,26,0.13)',
                            position: 'relative',
                          }}
                        >
                          <div
                            style={{
                              position: 'absolute',
                              top: 1,
                              [msg.fromMe ? 'right' : 'left']: -4,
                              width: 0,
                              height: 0,
                              borderTop: '5px solid transparent',
                              borderBottom: '5px solid transparent',
                              borderLeft: msg.fromMe ? `5px solid ${T.bubbleOut}` : 'none',
                              borderRight: msg.fromMe ? 'none' : `5px solid ${T.bubbleIn}`,
                            }}
                          />
                          <button
                            type="button"
                            className="wa-msg-chevron"
                            onClick={() => {
                              setOpenMenuMessageId((current) => (current === msg.id ? '' : msg.id));
                              setReactionPickerMessageId('');
                            }}
                            style={{
                              position: 'absolute',
                              top: 0,
                              right: 0,
                              border: 'none',
                              cursor: 'pointer',
                              padding: '2px 4px 8px 14px',
                              display: 'inline-grid',
                              placeItems: 'start end',
                              zIndex: 5,
                              borderRadius: msg.fromMe ? '0 8px 0 0' : '0 8px 0 0',
                              background: isMediaOnly
                                ? 'linear-gradient(200deg, rgba(11,20,26,0.5) 0%, rgba(11,20,26,0) 70%)'
                                : `linear-gradient(200deg, ${msg.fromMe ? T.bubbleOut : T.bubbleIn} 45%, transparent 75%)`,
                              color: isMediaOnly ? '#ffffff' : T.icon,
                            }}
                            title="Message actions"
                          >
                            <ChevronDown size={17} />
                          </button>
                          {openMenuMessageId === msg.id ? (
                            <div
                              style={{
                                position: 'absolute',
                                top: 20,
                                [msg.fromMe ? 'right' : 'left']: 4,
                                zIndex: 20,
                                background: T.menuBg,
                                borderRadius: 8,
                                boxShadow: '0 4px 16px rgba(11,20,26,0.24)',
                                padding: 4,
                                display: 'grid',
                                minWidth: 140,
                              }}
                            >
                              {(
                                <>
                                  <button type="button" className="wa-menu-item" style={menuStyle} onClick={() => { setReplyTo(msg); setEditingMessage(null); setOpenMenuMessageId(''); }}>
                                    <CornerUpLeft size={13} /> Reply
                                  </button>
                                  <button type="button" style={menuStyle} onClick={() => { setReactionPickerMessageId(msg.id); setReactionPickerExpanded(false); setOpenMenuMessageId(''); }}>
                                    <SmilePlus size={13} /> React
                                  </button>
                                  <button type="button" style={menuStyle} onClick={() => { setForwardingMessage(msg); setOpenMenuMessageId(''); }}>
                                    <Forward size={13} /> Forward
                                  </button>
                                  <button
                                    type="button"
                                    style={menuStyle}
                                    onClick={() => {
                                      navigator.clipboard?.writeText(msg.text || '').then(() => toast.success('Copied')).catch(() => {});
                                      setOpenMenuMessageId('');
                                    }}
                                  >
                                    <MessageSquare size={13} /> Copy
                                  </button>
                                  {msg.fromMe && !msg.deleted ? (
                                    <>
                                      <button type="button" style={menuStyle} onClick={() => { setEditingMessage(msg); setReplyTo(null); setDraft(msg.text || ''); setOpenMenuMessageId(''); }}>
                                        <Pencil size={13} /> Edit
                                      </button>
                                      <button
                                        type="button"
                                        style={{ ...menuStyle, color: '#f15c6d' }}
                                        disabled={deleteMessageMutation.isPending}
                                        onClick={() => deleteMessageMutation.mutate(msg.id)}
                                      >
                                        <Trash2 size={13} /> Delete
                                      </button>
                                    </>
                                  ) : null}
                                </>
                              )}
                            </div>
                          ) : null}
                          {!msg.fromMe && msg.senderName && activeJid.endsWith('@g.us') ? (
                            <div style={{ fontSize: 11.5, fontWeight: 700, color: '#e17b02', marginBottom: 2 }}>
                              {msg.senderName}
                            </div>
                          ) : null}
                          {msg.quotedPreview && !msg.deleted ? (
                            <div
                              onClick={() => {
                                if (!msg.quotedId) return;
                                document.getElementById(`wa-msg-${msg.quotedId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                              }}
                              style={{
                                borderLeft: '4px solid #06cf9c',
                                background: waTheme === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(11,20,26,0.06)',
                                borderRadius: 6,
                                padding: '5px 8px',
                                marginBottom: 4,
                                cursor: msg.quotedId ? 'pointer' : 'default',
                                maxWidth: 320,
                                minWidth: 140,
                              }}
                            >
                              <div style={{ fontSize: 11, fontWeight: 700, color: '#06cf9c', marginBottom: 1 }}>
                                {msg.quotedSender ? (hidePhone ? maskPhoneTitle(msg.quotedSender) : `+${msg.quotedSender}`) : chatTitle}
                              </div>
                              <div style={{ fontSize: 12, color: T.textSecondary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {msg.quotedPreview}
                              </div>
                            </div>
                          ) : null}
                          {msg.mediaType && !msg.deleted ? renderMedia(msg) : null}
                          <div
                            style={{
                              fontSize: 13,
                              whiteSpace: 'pre-wrap',
                              lineHeight: 1.35,
                              fontStyle: msg.deleted ? 'italic' : 'normal',
                              color: msg.deleted ? T.textMuted : T.bubbleText,
                            }}
                          >
                            {msg.text || (msg.mediaType && !msg.deleted ? '' : '(non-text message)')}
                          </div>
                          {msg.reactions && msg.reactions.length > 0 ? (
                            <div
                              style={{
                                marginTop: 4,
                                display: 'inline-flex',
                                gap: 2,
                                background: T.menuBg,
                                borderRadius: 10,
                                padding: '1px 6px',
                                boxShadow: '0 1px 2px rgba(11,20,26,0.2)',
                                fontSize: 12,
                              }}
                            >
                              {msg.reactions.join(' ')}
                            </div>
                          ) : null}
                          {overlayTime ? (
                            <div
                              style={{
                                position: 'absolute',
                                bottom: 9,
                                right: 10,
                                fontSize: 10,
                                color: '#ffffff',
                                textShadow: '0 1px 2px rgba(0,0,0,0.75)',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 3,
                                pointerEvents: 'none',
                              }}
                            >
                              {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              {msg.fromMe ? (
                                <span style={{ color: effectiveStatus === 'read' || effectiveStatus === 'played' ? '#53bdeb' : '#ffffff', fontWeight: 700, letterSpacing: -1 }}>
                                  {tickText}
                                </span>
                              ) : null}
                            </div>
                          ) : (
                          <div style={{ marginTop: 4, fontSize: 10, color: T.textMuted, textAlign: 'right' }}>
                            {msg.edited && !msg.deleted ? <span style={{ marginRight: 4 }}>edited</span> : null}
                            {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            {msg.fromMe ? (
                              <span
                                title={effectiveStatus}
                                style={{ marginLeft: 4, color: tickColor, fontWeight: 700, letterSpacing: -1 }}
                              >
                                {tickText}
                              </span>
                            ) : ''}
                          </div>
                          )}
                        </div>
                        {!msg.deleted ? (
                          <button
                            type="button"
                            className="wa-react-trigger"
                            title="React"
                            onClick={() => {
                              setReactionPickerExpanded(false);
                              setReactionPickerMessageId((current) => (current === msg.id ? '' : msg.id));
                              setOpenMenuMessageId('');
                            }}
                            style={{
                              border: 'none',
                              cursor: 'pointer',
                              width: 30,
                              height: 30,
                              borderRadius: '50%',
                              flexShrink: 0,
                              display: 'inline-grid',
                              placeItems: 'center',
                              background: T.menuBg,
                              color: T.icon,
                              boxShadow: '0 1px 3px rgba(11,20,26,0.2)',
                            }}
                          >
                            <Smile size={17} />
                          </button>
                        ) : null}
                        {reactionPickerMessageId === msg.id ? (
                          <>
                            <div
                              onClick={() => { setReactionPickerMessageId(''); setReactionPickerExpanded(false); }}
                              style={{ position: 'fixed', inset: 0, zIndex: 29 }}
                            />
                            <div
                              style={{
                                position: 'absolute',
                                bottom: 'calc(100% + 6px)',
                                [msg.fromMe ? 'right' : 'left']: 0,
                                zIndex: 30,
                                background: T.menuBg,
                                borderRadius: reactionPickerExpanded ? 16 : 24,
                                boxShadow: '0 6px 24px rgba(11,20,26,0.3)',
                                padding: reactionPickerExpanded ? '10px 12px' : '5px 10px',
                                maxWidth: reactionPickerExpanded ? 296 : 'none',
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                {QUICK_REACTIONS.map((emoji) => (
                                  <button
                                    key={emoji}
                                    type="button"
                                    className="wa-react-emoji"
                                    onClick={() => {
                                      reactMutation.mutate({ messageId: msg.id, emoji });
                                      setReactionPickerMessageId('');
                                      setReactionPickerExpanded(false);
                                    }}
                                    style={{ border: 'none', background: 'transparent', fontSize: 24, cursor: 'pointer', padding: '3px 5px', lineHeight: 1 }}
                                  >
                                    {emoji}
                                  </button>
                                ))}
                                <button
                                  type="button"
                                  title="More reactions"
                                  onClick={() => setReactionPickerExpanded((current) => !current)}
                                  style={{
                                    border: 'none',
                                    cursor: 'pointer',
                                    width: 30,
                                    height: 30,
                                    borderRadius: '50%',
                                    display: 'inline-grid',
                                    placeItems: 'center',
                                    background: waTheme === 'dark' ? '#182229' : '#f0f2f5',
                                    color: T.icon,
                                    fontSize: 20,
                                    fontWeight: 400,
                                    lineHeight: 1,
                                    flexShrink: 0,
                                    marginLeft: 2,
                                  }}
                                >
                                  +
                                </button>
                              </div>
                              {reactionPickerExpanded ? (
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2, marginTop: 8, maxHeight: 150, overflowY: 'auto' }}>
                                  {MORE_REACTIONS.map((emoji) => (
                                    <button
                                      key={emoji}
                                      type="button"
                                      className="wa-react-emoji"
                                      onClick={() => {
                                        reactMutation.mutate({ messageId: msg.id, emoji });
                                        setReactionPickerMessageId('');
                                        setReactionPickerExpanded(false);
                                      }}
                                      style={{ border: 'none', background: 'transparent', fontSize: 22, cursor: 'pointer', padding: '3px 4px', lineHeight: 1 }}
                                    >
                                      {emoji}
                                    </button>
                                  ))}
                                </div>
                              ) : null}
                            </div>
                          </>
                        ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (!activeJid) return;
                    const text = draft.trim();
                    if (!text) return;
                    if (editingMessage) {
                      editMessageMutation.mutate({ messageId: editingMessage.id, text });
                      return;
                    }
                    if (replyTo) {
                      replyMutation.mutate({ text, quotedMessageId: replyTo.id });
                      return;
                    }
                    sendMutation.mutate({ jid: activeJid, text });
                  }}
                  style={{ borderTop: `1px solid ${T.border}`, padding: 10, background: T.headerBg }}
                >
                  {(replyTo || editingMessage) ? (
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        background: T.menuBg,
                        borderLeft: `4px solid ${editingMessage ? '#f5a623' : '#00a884'}`,
                        borderRadius: 6,
                        padding: '6px 8px',
                        marginBottom: 8,
                      }}
                    >
                      {editingMessage ? <Pencil size={13} color="#f5a623" /> : <CornerUpLeft size={13} color="#00a884" />}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: editingMessage ? '#f5a623' : '#00a884' }}>
                          {editingMessage ? 'Editing message' : `Replying to ${replyTo?.fromMe ? 'yourself' : chatTitle}`}
                        </div>
                        <div style={{ fontSize: 12, color: T.textSecondary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {(editingMessage || replyTo)?.text || '(non-text message)'}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setReplyTo(null);
                          if (editingMessage) setDraft('');
                          setEditingMessage(null);
                        }}
                        style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: T.icon, display: 'inline-grid', placeItems: 'center' }}
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ) : null}
                  {showEmojiPicker ? (
                    <div
                      style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: 4,
                        background: T.menuBg,
                        borderRadius: 8,
                        padding: 8,
                        marginBottom: 8,
                        boxShadow: '0 1px 4px rgba(11,20,26,0.12)',
                      }}
                    >
                      {COMPOSER_EMOJIS.map((emoji) => (
                        <button
                          key={emoji}
                          type="button"
                          onClick={() => setDraft((current) => `${current}${emoji}`)}
                          style={{ border: 'none', background: 'transparent', fontSize: 20, cursor: 'pointer', padding: 2 }}
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  ) : null}
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <button
                    type="button"
                    onClick={() => setShowEmojiPicker((value) => !value)}
                    style={{ border: 'none', background: 'transparent', color: showEmojiPicker ? '#00a884' : T.icon, display: 'inline-grid', placeItems: 'center', cursor: 'pointer' }}
                  >
                    <Smile size={20} />
                  </button>
                  <button
                    type="button"
                    onClick={() => attachmentInputRef.current?.click()}
                    disabled={!activeJid || sendAttachmentMutation.isPending}
                    style={{ border: 'none', background: 'transparent', color: T.icon, display: 'inline-grid', placeItems: 'center', cursor: activeJid ? 'pointer' : 'not-allowed', opacity: activeJid ? 1 : 0.6 }}
                  >
                    <Paperclip size={20} />
                  </button>
                  <input
                    ref={attachmentInputRef}
                    type="file"
                    style={{ display: 'none' }}
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (!file || !activeJid) return;
                      setPendingAttachment((current) => {
                        if (current) URL.revokeObjectURL(current.url);
                        return { file, url: URL.createObjectURL(file) };
                      });
                      setAttachmentCaption('');
                    }}
                  />
                  <input
                    ref={audioInputRef}
                    type="file"
                    accept="audio/*"
                    style={{ display: 'none' }}
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (!file || !activeJid) return;
                      setPendingVoice((current) => {
                        if (current) URL.revokeObjectURL(current.url);
                        return { file, url: URL.createObjectURL(file) };
                      });
                    }}
                  />
                  {isRecording ? (
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'flex-end' }}>
                      <button
                        type="button"
                        onClick={cancelLiveRecording}
                        title="Discard recording"
                        style={{ border: 'none', background: 'transparent', color: T.icon, display: 'inline-grid', placeItems: 'center', cursor: 'pointer' }}
                      >
                        <Trash2 size={20} />
                      </button>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: T.textPrimary, fontVariantNumeric: 'tabular-nums' }}>
                        <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#ea4335', animation: 'pulse 1s infinite' }} />
                        {`${Math.floor(recordingSeconds / 60)}:${String(recordingSeconds % 60).padStart(2, '0')}`}
                      </span>
                      <button
                        type="button"
                        onClick={stopLiveRecording}
                        title="Stop and preview"
                        style={{ border: 'none', background: '#00a884', color: '#ffffff', width: 38, height: 38, borderRadius: '50%', display: 'inline-grid', placeItems: 'center', cursor: 'pointer' }}
                      >
                        <Square size={16} />
                      </button>
                    </div>
                  ) : pendingVoice ? (
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'flex-end' }}>
                      <button
                        type="button"
                        onClick={() => {
                          setPendingVoice((current) => {
                            if (current) URL.revokeObjectURL(current.url);
                            return null;
                          });
                        }}
                        title="Discard voice note"
                        style={{ border: 'none', background: 'transparent', color: T.icon, display: 'inline-grid', placeItems: 'center', cursor: 'pointer' }}
                      >
                        <Trash2 size={20} />
                      </button>
                      <audio src={pendingVoice.url} controls style={{ height: 36, flex: 1, maxWidth: 320 }} />
                      <button
                        type="button"
                        disabled={sendAttachmentMutation.isPending}
                        onClick={() => sendAttachmentMutation.mutate({ file: pendingVoice.file, voiceNote: true })}
                        title="Send voice note"
                        style={{ border: 'none', background: '#00a884', color: '#ffffff', width: 38, height: 38, borderRadius: '50%', display: 'inline-grid', placeItems: 'center', cursor: 'pointer', opacity: sendAttachmentMutation.isPending ? 0.6 : 1 }}
                      >
                        <Send size={16} />
                      </button>
                    </div>
                  ) : (
                    <>
                  <input
                    className="form-input"
                    value={draft}
                    onChange={(event) => {
                      setDraft(event.target.value);
                      notifyTyping();
                    }}
                    onPaste={(event) => {
                      const file = Array.from(event.clipboardData?.files || [])[0];
                      if (!file || !activeJid) return;
                      event.preventDefault();
                      setPendingAttachment((current) => {
                        if (current) URL.revokeObjectURL(current.url);
                        return { file, url: URL.createObjectURL(file) };
                      });
                      setAttachmentCaption('');
                    }}
                    disabled={!activeJid || sendMutation.isPending || sendAttachmentMutation.isPending || replyMutation.isPending || editMessageMutation.isPending}
                    placeholder={activeJid ? (editingMessage ? 'Edit your message…' : 'Type a message…') : 'Select a chat first'}
                    style={{ flex: 1, background: T.inputBg, border: `1px solid ${T.border}`, borderRadius: 8, color: T.textPrimary }}
                  />
                  {draft.trim() ? (
                    <button
                      type="submit"
                      disabled={!activeJid || sendMutation.isPending || sendAttachmentMutation.isPending || replyMutation.isPending || editMessageMutation.isPending || !draft.trim()}
                      title={editingMessage ? 'Save' : 'Send'}
                      style={{ border: 'none', background: '#00a884', color: '#ffffff', width: 38, height: 38, borderRadius: '50%', display: 'inline-grid', placeItems: 'center', cursor: 'pointer', flexShrink: 0 }}
                    >
                      {editingMessage ? <Pencil size={16} /> : <Send size={16} />}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => startLiveRecording()}
                      disabled={!activeJid || sendAttachmentMutation.isPending}
                      title="Record voice note"
                      style={{
                        border: 'none',
                        background: 'transparent',
                        color: T.icon,
                        display: 'inline-grid',
                        placeItems: 'center',
                        cursor: activeJid ? 'pointer' : 'not-allowed',
                        opacity: activeJid ? 1 : 0.6,
                      }}
                    >
                      <Mic size={20} />
                    </button>
                  )}
                    </>
                  )}
                  </div>
                </form>

                {pendingAttachment ? (
                  <div
                    style={{
                      position: 'absolute',
                      inset: 0,
                      zIndex: 8,
                      background: T.overlayBg,
                      display: 'flex',
                      flexDirection: 'column',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', background: T.headerBg, borderBottom: `1px solid ${T.border}` }}>
                      <button
                        type="button"
                        onClick={() => {
                          setPendingAttachment((current) => {
                            if (current) URL.revokeObjectURL(current.url);
                            return null;
                          });
                          setAttachmentCaption('');
                          if (attachmentInputRef.current) attachmentInputRef.current.value = '';
                        }}
                        style={{ border: 'none', background: 'transparent', color: T.icon, display: 'inline-grid', placeItems: 'center', cursor: 'pointer', padding: 0 }}
                      >
                        <X size={20} />
                      </button>
                      <span style={{ fontWeight: 600, color: T.textPrimary, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {pendingAttachment.file.name}
                      </span>
                    </div>
                    <div style={{ flex: 1, minHeight: 0, display: 'grid', placeItems: 'center', padding: 20 }}>
                      {pendingAttachment.file.type.startsWith('image/') ? (
                        <ImageEditor
                          url={pendingAttachment.url}
                          fileName={pendingAttachment.file.name}
                          fileType={pendingAttachment.file.type}
                          dark={waTheme === 'dark'}
                          handleRef={imageEditorRef}
                        />
                      ) : pendingAttachment.file.type.startsWith('video/') ? (
                        <video src={pendingAttachment.url} controls style={{ maxWidth: '90%', maxHeight: '100%', borderRadius: 6 }} />
                      ) : pendingAttachment.file.type.startsWith('audio/') ? (
                        <audio src={pendingAttachment.url} controls style={{ width: '80%', maxWidth: 380 }} />
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, color: T.icon }}>
                          <FileText size={72} />
                          <div style={{ fontSize: 14, fontWeight: 600, color: T.textPrimary }}>{pendingAttachment.file.name}</div>
                          <div style={{ fontSize: 12, color: T.textSecondary }}>
                            {`${(pendingAttachment.file.size / 1024).toFixed(0)} KB${pendingAttachment.file.type ? ` · ${pendingAttachment.file.type}` : ''} · No preview available`}
                          </div>
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', background: T.headerBg }}>
                      <input
                        className="form-input"
                        value={attachmentCaption}
                        onChange={(event) => setAttachmentCaption(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' && !sendAttachmentMutation.isPending) {
                            event.preventDefault();
                            void sendPendingAttachment();
                          }
                        }}
                        placeholder="Add a caption"
                        style={{ flex: 1, background: T.inputBg, border: `1px solid ${T.border}`, borderRadius: 8, color: T.textPrimary }}
                      />
                      <button
                        type="button"
                        disabled={sendAttachmentMutation.isPending}
                        onClick={() => void sendPendingAttachment()}
                        title="Send"
                        style={{ border: 'none', background: '#00a884', color: '#ffffff', width: 46, height: 46, borderRadius: '50%', display: 'inline-grid', placeItems: 'center', cursor: 'pointer', flexShrink: 0, opacity: sendAttachmentMutation.isPending ? 0.6 : 1 }}
                      >
                        <Send size={20} />
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>

              {contactInfoOpen && activeJid ? (
                <div
                  style={{
                    background: T.panelBg,
                    borderLeft: `1px solid ${T.border}`,
                    overflowY: 'auto',
                    WebkitOverflowScrolling: 'touch',
                    overscrollBehavior: 'contain',
                    touchAction: 'pan-y',
                    display: 'flex',
                    flexDirection: 'column',
                    ...(isMobile ? { position: 'absolute' as const, inset: 0, zIndex: 5 } : {}),
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', background: T.headerBg, borderBottom: `1px solid ${T.border}` }}>
                    <button
                      type="button"
                      onClick={() => setContactInfoOpen(false)}
                      style={{ border: 'none', background: 'transparent', color: T.icon, display: 'inline-grid', placeItems: 'center', cursor: 'pointer', padding: 0 }}
                    >
                      <X size={18} />
                    </button>
                    <span style={{ fontWeight: 600, color: T.textPrimary }}>
                      {activeJid.endsWith('@g.us') ? 'Group info' : 'Contact info'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '24px 16px 16px', borderBottom: `8px solid ${T.headerBg}` }}>
                    <div
                      style={{
                        width: 140,
                        height: 140,
                        borderRadius: '50%',
                        background: T.avatarBg,
                        color: T.avatarText,
                        display: 'grid',
                        placeItems: 'center',
                        fontWeight: 700,
                        fontSize: 48,
                        overflow: 'hidden',
                        marginBottom: 12,
                      }}
                    >
                      {avatarByJid[activeJid] ? (
                        <img src={avatarByJid[activeJid]!} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                        chatTitle.slice(0, 1).toUpperCase()
                      )}
                    </div>
                    <div style={{ fontSize: 18, fontWeight: 600, color: T.textPrimary, textAlign: 'center' }}>{chatTitle}</div>
                    {activeJid.endsWith('@s.whatsapp.net') ? (
                      <div style={{ fontSize: 14, color: T.textSecondary, marginTop: 4 }}>{hidePhone ? maskPhoneTitle(activeJid.split('@')[0]) : `+${activeJid.split('@')[0]}`}</div>
                    ) : null}
                    {(() => {
                      const line = formatPresenceLine(presenceByJid[activeJid]);
                      return line ? (
                        <div style={{ fontSize: 12, color: line === 'typing…' || line === 'recording audio…' ? '#00a884' : T.textMuted, marginTop: 4 }}>
                          {line}
                        </div>
                      ) : null;
                    })()}
                  </div>
                  <div style={{ padding: '14px 16px' }}>
                    <div style={{ fontSize: 13, color: '#008069', fontWeight: 600, marginBottom: 10 }}>
                      Media
                    </div>
                    {(() => {
                      const mediaMessages = messages.filter(
                        (msg) => (msg.mediaType === 'image' || msg.mediaType === 'video') && !msg.deleted && mediaUrlById[msg.id] && mediaUrlById[msg.id] !== 'unavailable',
                      );
                      if (mediaMessages.length === 0) {
                        return <div style={{ fontSize: 12, color: T.textMuted }}>No media shared yet</div>;
                      }
                      return (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4 }}>
                          {mediaMessages.slice(-30).reverse().map((msg) => (
                            <div key={msg.id} style={{ aspectRatio: '1', overflow: 'hidden', borderRadius: 4, background: T.headerBg, cursor: 'pointer' }}>
                              {msg.mediaType === 'image' ? (
                                <img
                                  src={mediaUrlById[msg.id]}
                                  alt=""
                                  onClick={() => window.open(mediaUrlById[msg.id], '_blank')}
                                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                />
                              ) : (
                                <video src={mediaUrlById[msg.id]} style={{ width: '100%', height: '100%', objectFit: 'cover' }} onClick={() => window.open(mediaUrlById[msg.id], '_blank')} />
                              )}
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="empty-state" style={{ minHeight: 460 }}>
              <MessageSquare size={28} />
              <p>WhatsApp is not ready for this account yet.</p>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}