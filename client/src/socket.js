import { io } from 'socket.io-client';

/**
 * Create a socket connection.
 *
 * Deliberately a factory, not a module-level singleton: Room.jsx owns exactly
 * one instance in a ref for the lifetime of the room, and disconnects it on
 * unmount. A module singleton would survive navigation and leak listeners
 * between rooms.
 *
 * With an empty VITE_SERVER_URL (the dev default) socket.io-client connects
 * back to the page origin, which Vite proxies to the backend.
 */
export function createSocket() {
  const url = import.meta.env.VITE_SERVER_URL || undefined;

  return io(url, {
    // WebSocket only: skips the HTTP long-poll handshake, which keeps
    // keystroke latency down.
    transports: ['websocket'],
    reconnectionAttempts: 8,
    reconnectionDelay: 800,
  });
}

/** Shared event names — must stay in sync with server/src/socket/events.js. */
export const EVENTS = {
  JOIN_ROOM: 'join-room',
  LEAVE_ROOM: 'leave-room',
  CODE_CHANGE: 'code-change',
  LANGUAGE_CHANGE: 'language-change',

  ROOM_STATE: 'room-state',
  USERS_UPDATE: 'users-update',
  USER_JOINED: 'user-joined',
  USER_LEFT: 'user-left',
  ROOM_SAVED: 'room-saved',
  ERROR: 'room-error',
};
