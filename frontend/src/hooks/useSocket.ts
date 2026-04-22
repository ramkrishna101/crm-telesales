import { useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuthStore } from '../store/authStore';
import toast from 'react-hot-toast';

let socket: Socket | null = null;

export function useSocket() {
  const { accessToken, user } = useAuthStore();
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!accessToken || !user) return;

    // Reuse existing connection
    if (socket?.connected) {
      socketRef.current = socket;
      return;
    }

    socket = io(import.meta.env.VITE_API_URL?.replace('/api', '') || 'http://localhost:4000', {
      auth: { token: accessToken },
      transports: ['websocket'],
      reconnectionAttempts: 5,
      reconnectionDelay: 2000,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('🔌 Socket connected');
    });

    socket.on('disconnect', () => {
      console.log('🔌 Socket disconnected');
    });

    socket.on('connect_error', (err) => {
      console.warn('Socket error:', err.message);
    });

    // ── Global event handlers ─────────────────────────────────────────

    socket.on('follow_up:created', (data: { leadName: string; scheduledAt: string }) => {
      const time = new Date(data.scheduledAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      toast(`📅 Follow-up scheduled for ${data.leadName || 'lead'} at ${time}`, {
        duration: 5000,
        style: { background: '#1e1b4b', border: '1px solid #4338ca', color: '#e0e7ff' },
      });
    });

    socket.on('lead:assigned', (data: { leadName: string; campaignName: string }) => {
      toast(`📥 New lead assigned: ${data.leadName || 'Unknown'} (${data.campaignName})`, {
        duration: 4000,
        style: { background: '#14532d', border: '1px solid #16a34a', color: '#dcfce7' },
      });
    });

    socket.on('follow_up:reminder', (data: { leadName: string; minutesOverdue: number }) => {
      toast(`⚠️ Follow-up overdue: ${data.leadName} (${data.minutesOverdue}m ago)`, {
        duration: 8000,
        style: { background: '#451a03', border: '1px solid #b45309', color: '#fef3c7' },
      });
    });

    return () => {
      // Don't disconnect on component unmount — keep shared connection alive
    };
  }, [accessToken, user]);

  return socketRef.current;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

export function getSocket() {
  return socket;
}
