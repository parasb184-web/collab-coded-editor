/** Shared event-name constants so the client and server cannot drift apart. */
export const EVENTS = {
  // client -> server
  JOIN_ROOM: 'join-room',
  LEAVE_ROOM: 'leave-room',
  CODE_CHANGE: 'code-change',
  LANGUAGE_CHANGE: 'language-change',

  // server -> client
  ROOM_STATE: 'room-state',
  USERS_UPDATE: 'users-update',
  USER_JOINED: 'user-joined',
  USER_LEFT: 'user-left',
  ROOM_SAVED: 'room-saved',
  ERROR: 'room-error',
};
