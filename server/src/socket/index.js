import { EVENTS } from './events.js';
import { addUser, removeUser, getUsers, getUser } from '../services/roomStore.js';
import { loadRoom, scheduleSave, flush, setSaveListener } from '../services/persistence.js';
import { isSupportedLanguage, DEFAULT_LANGUAGE } from '../config/languages.js';

const MAX_USERNAME = 32;
const MAX_ROOM_ID = 64;

/** Keep user input from becoming a weird Socket.IO room name or sidebar entry. */
function sanitizeRoomId(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed.length < 3 || trimmed.length > MAX_ROOM_ID) return null;
  return /^[A-Za-z0-9_-]+$/.test(trimmed) ? trimmed : null;
}

function sanitizeUsername(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().slice(0, MAX_USERNAME);
  return trimmed.length > 0 ? trimmed : null;
}

export function registerSocketHandlers(io) {
  // When a debounced save lands, tell the room so the UI can show "Saved".
  setSaveListener((roomId, updatedAt) => {
    io.to(roomId).emit(EVENTS.ROOM_SAVED, { updatedAt });
  });

  io.on('connection', (socket) => {
    console.log('[socket] connected', socket.id);

    /**
     * Join a room: register presence, hand the newcomer the saved buffer, and
     * announce them to everyone already inside.
     */
    socket.on(EVENTS.JOIN_ROOM, async ({ roomId, username } = {}) => {
      const room = sanitizeRoomId(roomId);
      const name = sanitizeUsername(username);

      if (!room || !name) {
        socket.emit(EVENTS.ERROR, { message: 'Invalid room ID or username.' });
        return;
      }

      // One socket = one room in this app; leaving any previous room keeps the
      // presence Map honest if a client re-joins without reconnecting.
      const previous = getUser(socket.id);
      if (previous) {
        socket.leave(previous.roomId);
        removeUser(socket.id);
      }

      socket.join(room);
      addUser(room, socket.id, name);

      // Captured before the await below: is this socket alone in the room? The
      // client uses it to decide whether it is safe to seed a starter snippet.
      const isFirstUser = getUsers(room).length === 1;

      // Saved snapshot first, so a refresh never loses work. If the room has
      // never been saved (or Mongo is down) the client just starts empty.
      const saved = await loadRoom(room);
      socket.emit(EVENTS.ROOM_STATE, {
        roomId: room,
        code: saved?.code ?? '',
        language: saved?.language ?? DEFAULT_LANGUAGE,
        updatedAt: saved?.updatedAt ?? null,
        isNew: !saved,
        isFirstUser,
      });

      // Toast for everyone already here; full roster for everyone including
      // the joiner (so their own sidebar is populated too).
      socket.to(room).emit(EVENTS.USER_JOINED, { username: name, socketId: socket.id });
      io.to(room).emit(EVENTS.USERS_UPDATE, { users: getUsers(room) });

      console.log(`[socket] ${name} (${socket.id}) joined ${room}`);
    });

    /**
     * Full-document sync, last-write-wins.
     *
     * `socket.to(room)` excludes the sender — that is the server half of the
     * echo guard. The client half lives in Room.jsx, where applying a remote
     * edit is flagged so its own onChange does not re-emit.
     */
    socket.on(EVENTS.CODE_CHANGE, ({ roomId, code } = {}) => {
      // Only members may write; `socket.rooms` is the source of truth.
      if (!socket.rooms.has(roomId) || typeof code !== 'string') return;

      socket.to(roomId).emit(EVENTS.CODE_CHANGE, { code });
      scheduleSave(roomId, { code });
    });

    /** Language is part of room state, so it syncs and persists the same way. */
    socket.on(EVENTS.LANGUAGE_CHANGE, ({ roomId, language } = {}) => {
      if (!socket.rooms.has(roomId) || !isSupportedLanguage(language)) return;

      const user = getUser(socket.id);
      socket.to(roomId).emit(EVENTS.LANGUAGE_CHANGE, {
        language,
        username: user?.username ?? 'Someone',
      });
      scheduleSave(roomId, { language });
    });

    /** Explicit "Leave Room" click — cleaner than waiting for the disconnect. */
    socket.on(EVENTS.LEAVE_ROOM, () => {
      handleDeparture(socket);
    });

    /**
     * `disconnecting` (not `disconnect`) fires while `socket.rooms` is still
     * populated, which is what we need to notify the right room.
     */
    socket.on('disconnecting', () => {
      handleDeparture(socket);
      console.log('[socket] disconnected', socket.id);
    });
  });

  /** Shared teardown for both explicit leaves and dropped connections. */
  function handleDeparture(socket) {
    const departed = removeUser(socket.id);
    if (!departed) return;

    const { roomId, username, isRoomEmpty } = departed;
    socket.leave(roomId);

    if (isRoomEmpty) {
      // Nobody left to broadcast to — write the buffer out immediately rather
      // than waiting on a timer that nothing will re-arm.
      flush(roomId);
      return;
    }

    socket.to(roomId).emit(EVENTS.USER_LEFT, { username, socketId: socket.id });
    io.to(roomId).emit(EVENTS.USERS_UPDATE, { users: getUsers(roomId) });
  }
}
