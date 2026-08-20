import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Toasts from '../components/Toasts.jsx';
import { useToasts } from '../hooks/useToasts.js';

const USERNAME_KEY = 'codesync:username';

/** Room IDs are typed and pasted by hand, so keep them short and readable. */
function generateRoomId() {
  const raw =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID().replace(/-/g, '')
      : Math.random().toString(16).slice(2).padEnd(12, '0');

  // "a1b2-c3d4-e5f6"
  return raw.slice(0, 12).match(/.{1,4}/g).join('-');
}

export default function Home() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toasts, push, dismiss } = useToasts();

  // Remember the name across refreshes so rejoining a room is one click.
  const [username, setUsername] = useState(() => sessionStorage.getItem(USERNAME_KEY) ?? '');
  // `?room=` is set when Room.jsx bounces someone back here after a refresh.
  const [roomId, setRoomId] = useState(() => searchParams.get('room') ?? '');

  useEffect(() => {
    if (searchParams.get('room')) {
      push('Enter your name to rejoin that room.', 'info');
    }
    // Intentionally runs once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleCreateRoom() {
    setRoomId(generateRoomId());
    push('New room ID generated — share it with a teammate.', 'success');
  }

  function handleSubmit(event) {
    event.preventDefault();

    const name = username.trim();
    const room = roomId.trim();

    if (!name) return push('Please enter your name.', 'error');
    if (!room) return push('Please enter or generate a room ID.', 'error');
    // Mirrors the server-side validation in socket/index.js.
    if (room.length < 3) return push('Room ID must be at least 3 characters.', 'error');
    if (!/^[A-Za-z0-9_-]+$/.test(room)) {
      return push('Room ID can only contain letters, numbers, hyphens and underscores.', 'error');
    }

    sessionStorage.setItem(USERNAME_KEY, name);
    // `state` carries the name for this navigation; sessionStorage is the
    // fallback if the user later hits refresh inside the room.
    navigate(`/room/${encodeURIComponent(room)}`, { state: { username: name } });
  }

  return (
    <main className="home">
      <form className="card" onSubmit={handleSubmit}>
        <div className="card__brand">
          <span className="logo" aria-hidden="true">&lt;/&gt;</span>
          <div>
            <h1 className="card__title">CodeSync</h1>
            <p className="card__subtitle">Real-time collaborative code editing</p>
          </div>
        </div>

        <label className="field">
          <span className="field__label">Your name</span>
          <input
            className="input"
            type="text"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder="Ada Lovelace"
            maxLength={32}
            autoComplete="name"
            autoFocus
          />
        </label>

        <label className="field">
          <span className="field__label">Room ID</span>
          <input
            className="input"
            type="text"
            value={roomId}
            onChange={(event) => setRoomId(event.target.value)}
            placeholder="e.g. a1b2-c3d4-e5f6"
            maxLength={64}
            spellCheck="false"
            autoComplete="off"
          />
        </label>

        <div className="card__actions">
          <button type="submit" className="btn btn--primary">Join Room</button>
          <button type="button" className="btn btn--ghost" onClick={handleCreateRoom}>
            Create Room
          </button>
        </div>

        <p className="card__hint">
          Paste an existing room ID to join your team, or create a new one and share it.
        </p>
      </form>

      <Toasts toasts={toasts} onDismiss={dismiss} />
    </main>
  );
}
