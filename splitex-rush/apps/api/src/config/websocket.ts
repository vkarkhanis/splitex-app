import { Server as SocketIOServer, Socket } from 'socket.io';
import http from 'http';

let io: SocketIOServer | null = null;

/**
 * Initialize Socket.IO server attached to the HTTP server.
 * Clients join rooms named after eventIds they're interested in.
 */
export function initWebSocket(server: http.Server): SocketIOServer {
  io = new SocketIOServer(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
    path: '/ws',
  });

  io.on('connection', (socket: Socket) => {
    console.log(`🔌 WebSocket client connected: ${socket.id}`);

    // Client joins an event room to receive real-time updates for that event
    socket.on('join-event', (eventId: string) => {
      if (eventId && typeof eventId === 'string') {
        socket.join(`event:${eventId}`);
        console.log(`🔌 ${socket.id} joined event:${eventId}`);
      }
    });

    // Client leaves an event room
    socket.on('leave-event', (eventId: string) => {
      if (eventId && typeof eventId === 'string') {
        socket.leave(`event:${eventId}`);
        console.log(`🔌 ${socket.id} left event:${eventId}`);
      }
    });

    // Client joins their personal room for user-level notifications
    socket.on('join-user', (userId: string) => {
      if (userId && typeof userId === 'string') {
        socket.join(`user:${userId}`);
        console.log(`🔌 ${socket.id} joined user:${userId}`);
      }
    });

    socket.on('disconnect', () => {
      console.log(`🔌 WebSocket client disconnected: ${socket.id}`);
    });
  });

  console.log('🔌 WebSocket server initialized');
  return io;
}

/** Get the Socket.IO server instance (null if not initialized) */
export function getIO(): SocketIOServer | null {
  return io;
}

// ── Typed event emitters ──────────────────────────────────────────────

export type WsEventType =
  | 'expense:created'
  | 'expense:updated'
  | 'expense:deleted'
  | 'event:updated'
  | 'event:deleted'
  | 'group:created'
  | 'group:updated'
  | 'group:deleted'
  | 'participant:added'
  | 'participant:removed'
  | 'invitation:created'
  | 'invitation:accepted'
  | 'invitation:declined'
  | 'invitation:revoked'
  | 'settlement:generated'
  | 'settlement:updated';

/**
 * Emit a real-time event to all clients in an event room.
 * Safe to call even if WebSocket is not initialized (no-op).
 */
export function emitToEvent(eventId: string, type: WsEventType, payload: any): void {
  if (!io) return;
  io.to(`event:${eventId}`).emit(type, { eventId, ...payload, timestamp: new Date().toISOString() });
}

/**
 * Emit a real-time event to a specific user.
 */
export function emitToUser(userId: string, type: WsEventType, payload: any): void {
  if (!io) return;
  io.to(`user:${userId}`).emit(type, { userId, ...payload, timestamp: new Date().toISOString() });
}
