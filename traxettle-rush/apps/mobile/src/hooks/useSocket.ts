import { useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { ENV } from '../config/env';

const API_BASE = ENV.API_URL;

let globalSocket: Socket | null = null;

function getSocket(): Socket {
  if (!globalSocket) {
    globalSocket = io(API_BASE, {
      path: '/ws',
      transports: ['websocket', 'polling'],
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 2000,
    });
  }
  return globalSocket;
}

const EVENT_TYPES = [
  'expense:created',
  'expense:updated',
  'expense:deleted',
  'event:updated',
  'event:deleted',
  'group:created',
  'group:updated',
  'group:deleted',
  'participant:added',
  'participant:removed',
  'invitation:created',
  'invitation:accepted',
  'invitation:declined',
  'invitation:revoked',
  'settlement:generated',
  'settlement:updated',
];

/**
 * Subscribe to real-time WebSocket events for a specific event room.
 * Automatically joins/leaves the event room on mount/unmount.
 */
export function useEventSocket(
  eventId: string | undefined,
  onUpdate: (type: string, payload: any) => void,
) {
  const callbackRef = useRef(onUpdate);
  callbackRef.current = onUpdate;

  useEffect(() => {
    if (!eventId) return;

    const socket = getSocket();
    socket.emit('join-event', eventId);

    const handlers = EVENT_TYPES.map((type) => {
      const handler = (payload: any) => callbackRef.current(type, payload);
      socket.on(type, handler);
      return { type, handler };
    });

    return () => {
      socket.emit('leave-event', eventId);
      handlers.forEach(({ type, handler }) => socket.off(type, handler));
    };
  }, [eventId]);
}

/**
 * Subscribe to real-time WebSocket events for multiple event rooms.
 * Joins all provided event rooms and listens for event-level updates.
 */
export function useMultiEventSocket(
  eventIds: string[],
  onUpdate: (type: string, payload: any) => void,
) {
  const callbackRef = useRef(onUpdate);
  callbackRef.current = onUpdate;

  useEffect(() => {
    if (!eventIds.length) return;

    const socket = getSocket();
    eventIds.forEach((id) => socket.emit('join-event', id));

    const types = ['event:updated', 'event:deleted', 'settlement:generated', 'settlement:updated'];
    const handlers = types.map((type) => {
      const handler = (payload: any) => callbackRef.current(type, payload);
      socket.on(type, handler);
      return { type, handler };
    });

    return () => {
      eventIds.forEach((id) => socket.emit('leave-event', id));
      handlers.forEach(({ type, handler }) => socket.off(type, handler));
    };
  }, [eventIds.join(',')]);
}
