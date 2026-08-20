/**
 * In-memory presence tracking.
 *
 * This is intentionally NOT in Mongo: it is ephemeral state that is only
 * meaningful while the process is alive. Restart the server and everyone
 * reconnects anyway.
 *
 * Two structures kept in sync:
 *   rooms   : roomId   -> Map<socketId, User>   (fast "who is in this room")
 *   sockets : socketId -> { roomId, username }  (fast cleanup on disconnect)
 */

/** @typedef {{ socketId: string, username: string, joinedAt: number }} User */

const rooms = new Map();
const sockets = new Map();

export function addUser(roomId, socketId, username) {
  if (!rooms.has(roomId)) rooms.set(roomId, new Map());

  const user = { socketId, username, joinedAt: Date.now() };
  rooms.get(roomId).set(socketId, user);
  sockets.set(socketId, { roomId, username });

  return user;
}

/**
 * Remove a socket from its room.
 * @returns {{ roomId: string, username: string, isRoomEmpty: boolean } | null}
 *          null if the socket was not tracked (e.g. never joined a room).
 */
export function removeUser(socketId) {
  const entry = sockets.get(socketId);
  if (!entry) return null;

  sockets.delete(socketId);

  const members = rooms.get(entry.roomId);
  if (!members) return { ...entry, isRoomEmpty: true };

  members.delete(socketId);

  // Drop the room entirely once the last person leaves so the Map does not
  // grow without bound over the life of the process.
  const isRoomEmpty = members.size === 0;
  if (isRoomEmpty) rooms.delete(entry.roomId);

  return { ...entry, isRoomEmpty };
}

/** Everyone currently in a room, oldest join first (stable sidebar ordering). */
export function getUsers(roomId) {
  const members = rooms.get(roomId);
  if (!members) return [];
  return [...members.values()].sort((a, b) => a.joinedAt - b.joinedAt);
}

export function getUser(socketId) {
  return sockets.get(socketId) || null;
}
