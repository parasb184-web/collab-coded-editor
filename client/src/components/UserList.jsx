/** Initials for the avatar circle: "Ada Lovelace" -> "AL", "ada" -> "AD". */
function initials(name) {
  const parts = name.trim().split(/\s+/);
  if (parts.length > 1) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

/**
 * Deterministic avatar colour so the same person keeps the same colour for
 * everyone in the room without the server having to assign one.
 */
function hueFor(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) {
    hash = (hash * 31 + name.charCodeAt(i)) % 360;
  }
  return hash;
}

export default function UserList({ users, currentSocketId }) {
  return (
    <div className="userlist">
      <div className="sidebar__label">
        In this room <span className="badge">{users.length}</span>
      </div>

      <ul className="userlist__items">
        {users.map((user) => {
          const isYou = user.socketId === currentSocketId;
          return (
            <li key={user.socketId} className="user">
              <span
                className="user__avatar"
                style={{ background: `hsl(${hueFor(user.username)} 55% 32%)` }}
                aria-hidden="true"
              >
                {initials(user.username)}
              </span>
              <span className="user__name" title={user.username}>
                {user.username}
                {isYou && <span className="user__you">you</span>}
              </span>
            </li>
          );
        })}

        {users.length === 0 && <li className="userlist__empty">Connecting…</li>}
      </ul>
    </div>
  );
}
