'use client';

import { useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { getResolvedApiBaseUrl } from '../config/dev-options';

let globalSocket: Socket | null = null;

function getSocket(): Socket {
  if (!globalSocket) {
    globalSocket = io(getResolvedApiBaseUrl(), {
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

/**
 * Hook to subscribe to real-time WebSocket events for a specific event room.
 * Automatically joins/leaves the event room on mount/unmount.
 *
 * @param eventId - The event ID to subscribe to
 * @param onUpdate - Callback fired when any relevant WS event is received. Receives the event type and payload.
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

    const eventTypes = [
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

    const handlers = eventTypes.map((type) => {
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
 * Hook to subscribe to real-time WebSocket events for multiple event rooms.
 * Joins all provided event rooms and listens for event:updated and event:deleted.
 * Automatically re-joins when the eventIds list changes.
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

    // Join all event rooms
    eventIds.forEach((id) => socket.emit('join-event', id));

    const eventTypes = ['event:updated', 'event:deleted', 'settlement:generated', 'settlement:updated'];

    const handlers = eventTypes.map((type) => {
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

/**
 * Hook to subscribe to user-level WebSocket notifications.
 */
export function useUserSocket(
  userId: string | undefined,
  onNotification: (type: string, payload: any) => void,
) {
  const callbackRef = useRef(onNotification);
  callbackRef.current = onNotification;

  useEffect(() => {
    if (!userId) return;

    const socket = getSocket();
    socket.emit('join-user', userId);

    const eventTypes = ['notification', 'user:tier-updated'];
    const handlers = eventTypes.map((type) => {
      const handler = (payload: any) => callbackRef.current(type, payload);
      socket.on(type, handler);
      return { type, handler };
    });

    return () => {
      handlers.forEach(({ type, handler }) => socket.off(type, handler));
    };
  }, [userId]);
}
