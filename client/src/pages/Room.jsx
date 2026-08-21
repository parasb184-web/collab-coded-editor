import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';

import EditorPane from '../components/EditorPane.jsx';
import UserList from '../components/UserList.jsx';
import OutputPanel from '../components/OutputPanel.jsx';
import Toasts from '../components/Toasts.jsx';
import { useToasts } from '../hooks/useToasts.js';
import { createSocket, EVENTS } from '../socket.js';
import { LANGUAGES, DEFAULT_LANGUAGE, getLanguage } from '../constants/languages.js';

const USERNAME_KEY = 'codesync:username';
const API_BASE = import.meta.env.VITE_SERVER_URL || '';

/** Starter snippets are "disposable" — safe to replace when switching language. */
const STARTERS = new Set(LANGUAGES.map((lang) => lang.starter));
const isDisposableBuffer = (text) => text.trim() === '' || STARTERS.has(text);

/** Output panel sizing. The editor keeps at least MIN_EDITOR_HEIGHT px. */
const OUTPUT_HEIGHT_KEY = 'codesync:outputHeight';
const DEFAULT_OUTPUT_HEIGHT = 210;
const MIN_OUTPUT_HEIGHT = 110;
const MIN_EDITOR_HEIGHT = 160;
/** Mirrors the height of `.resizer` in styles.css. */
const RESIZER_HEIGHT = 7;

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

/** localStorage throws in some privacy modes, so every access is guarded. */
function readStoredHeight() {
  try {
    const saved = Number(localStorage.getItem(OUTPUT_HEIGHT_KEY));
    return Number.isFinite(saved) && saved >= MIN_OUTPUT_HEIGHT ? saved : DEFAULT_OUTPUT_HEIGHT;
  } catch {
    return DEFAULT_OUTPUT_HEIGHT;
  }
}

export default function Room() {
  const { roomId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { toasts, push, dismiss } = useToasts();

  /**
   * The name comes from the Home page via router state. On a hard refresh that
   * state is gone, so we fall back to sessionStorage — which is also what lets
   * "a refresh doesn't lose work" hold true end to end.
   */
  const [username] = useState(
    () => location.state?.username?.trim() || sessionStorage.getItem(USERNAME_KEY)?.trim() || ''
  );

  const [users, setUsers] = useState([]);
  const [language, setLanguage] = useState(DEFAULT_LANGUAGE);
  const [isConnected, setIsConnected] = useState(false);
  const [socketId, setSocketId] = useState(null);
  const [lastSavedAt, setLastSavedAt] = useState(null);
  const [hasUnsavedEdits, setHasUnsavedEdits] = useState(false);

  const [isRunning, setIsRunning] = useState(false);
  const [runResult, setRunResult] = useState(null);
  const [runError, setRunError] = useState(null);

  const [outputHeight, setOutputHeight] = useState(readStoredHeight);
  const [isOutputCollapsed, setIsOutputCollapsed] = useState(false);
  const [justCopied, setJustCopied] = useState(false);

  /** Guards the Run shortcut against firing while a run is already in flight. */
  const isRunningRef = useRef(false);

  /** The single socket instance for this room. */
  const socketRef = useRef(null);
  /** Imperative handle onto Monaco (applyRemote / getValue / focus). */
  const editorApiRef = useRef(null);
  /**
   * Mirrors `language` for use inside callbacks that were registered in an
   * earlier render and would otherwise close over a stale value.
   */
  const languageRef = useRef(DEFAULT_LANGUAGE);
  /** The editor+output column, measured when clamping the output height. */
  const workspaceRef = useRef(null);

  // Without a name we cannot join — bounce back to Home with the room prefilled.
  useEffect(() => {
    if (!username) {
      navigate(`/?room=${encodeURIComponent(roomId)}`, { replace: true });
    }
  }, [username, roomId, navigate]);

  /* ------------------------------------------------------------------ */
  /* Socket lifecycle                                                    */
  /* ------------------------------------------------------------------ */
  useEffect(() => {
    if (!username) return undefined;

    const socket = createSocket();
    socketRef.current = socket;

    /* --- connection state --- */

    const handleConnect = () => {
      setIsConnected(true);
      setSocketId(socket.id);
      // Emitted on every connect, so a reconnect re-joins automatically.
      socket.emit(EVENTS.JOIN_ROOM, { roomId, username });
    };

    const handleDisconnect = () => setIsConnected(false);

    const handleConnectError = () => {
      setIsConnected(false);
      push('Cannot reach the server. Is the backend running?', 'error', 5000);
    };

    /* --- room state --- */

    // Sent only to the joining socket: the saved buffer, so a refresh or a
    // late joiner picks up exactly where the room left off.
    const handleRoomState = ({ code, language: savedLanguage, updatedAt, isNew, isFirstUser }) => {
      setLanguage(savedLanguage);
      languageRef.current = savedLanguage;
      setLastSavedAt(updatedAt ? new Date(updatedAt) : null);
      setHasUnsavedEdits(false);

      // Seed a genuinely new room with a starter snippet, but only when we are
      // the first person in it — otherwise we could clobber a teammate who
      // started typing less than one debounce window ago.
      if (isNew && !code && isFirstUser) {
        const starter = getLanguage(savedLanguage).starter;
        editorApiRef.current?.applyRemote(starter);
        socket.emit(EVENTS.CODE_CHANGE, { roomId, code: starter });
        return;
      }

      editorApiRef.current?.applyRemote(code);
    };

    /* --- collaboration --- */

    // A remote keystroke. `applyRemote` writes it into Monaco with the echo
    // guard raised, so this does NOT bounce back out as a new code-change.
    const handleRemoteCode = ({ code }) => {
      editorApiRef.current?.applyRemote(code);
      setHasUnsavedEdits(true);
    };

    const handleRemoteLanguage = ({ language: nextLanguage, username: who }) => {
      setLanguage(nextLanguage);
      languageRef.current = nextLanguage;
      push(`${who} switched the language to ${getLanguage(nextLanguage).label}.`, 'info');
    };

    /* --- presence --- */

    const handleUsersUpdate = ({ users: roster }) => setUsers(roster);
    const handleUserJoined = ({ username: who }) => push(`${who} joined the room.`, 'success');
    const handleUserLeft = ({ username: who }) => push(`${who} left the room.`, 'info');

    /* --- persistence feedback --- */

    const handleRoomSaved = ({ updatedAt }) => {
      setLastSavedAt(new Date(updatedAt));
      setHasUnsavedEdits(false);
    };

    const handleRoomError = ({ message }) => {
      push(message, 'error', 5000);
      navigate('/', { replace: true });
    };

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('connect_error', handleConnectError);
    socket.on(EVENTS.ROOM_STATE, handleRoomState);
    socket.on(EVENTS.CODE_CHANGE, handleRemoteCode);
    socket.on(EVENTS.LANGUAGE_CHANGE, handleRemoteLanguage);
    socket.on(EVENTS.USERS_UPDATE, handleUsersUpdate);
    socket.on(EVENTS.USER_JOINED, handleUserJoined);
    socket.on(EVENTS.USER_LEFT, handleUserLeft);
    socket.on(EVENTS.ROOM_SAVED, handleRoomSaved);
    socket.on(EVENTS.ERROR, handleRoomError);

    // Remove every listener before disconnecting, so React StrictMode's
    // double-mount in development cannot leave a second set attached.
    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('connect_error', handleConnectError);
      socket.off(EVENTS.ROOM_STATE, handleRoomState);
      socket.off(EVENTS.CODE_CHANGE, handleRemoteCode);
      socket.off(EVENTS.LANGUAGE_CHANGE, handleRemoteLanguage);
      socket.off(EVENTS.USERS_UPDATE, handleUsersUpdate);
      socket.off(EVENTS.USER_JOINED, handleUserJoined);
      socket.off(EVENTS.USER_LEFT, handleUserLeft);
      socket.off(EVENTS.ROOM_SAVED, handleRoomSaved);
      socket.off(EVENTS.ERROR, handleRoomError);

      socket.disconnect();
      socketRef.current = null;
    };
  }, [roomId, username, navigate, push]);

  /* ------------------------------------------------------------------ */
  /* Output panel: resize + collapse                                     */
  /* ------------------------------------------------------------------ */

  // Persist the chosen height so the layout survives a refresh.
  useEffect(() => {
    try {
      localStorage.setItem(OUTPUT_HEIGHT_KEY, String(outputHeight));
    } catch {
      // Private mode / blocked storage — the layout just resets next time.
    }
  }, [outputHeight]);

  /**
   * Largest the output may grow while leaving the editor usable.
   *
   * Measured against the workspace column rather than the window: the topbar
   * (which wraps to two rows on narrow screens) and the sidebar strip also eat
   * vertical space, so window.innerHeight would let the output squeeze the
   * editor down to a few pixels on a small viewport.
   */
  const maxOutputHeight = () => {
    const available = workspaceRef.current?.clientHeight ?? window.innerHeight;
    // The divider sits between the two, so it comes out of the budget as well.
    return Math.max(MIN_OUTPUT_HEIGHT, available - MIN_EDITOR_HEIGHT - RESIZER_HEIGHT);
  };

  const resizeTo = useCallback((next) => {
    setOutputHeight(clamp(next, MIN_OUTPUT_HEIGHT, maxOutputHeight()));
  }, []);

  /**
   * Drag the divider between editor and output.
   *
   * Pointer events (not mouse events) so a trackpad, touch screen or stylus
   * all work, and setPointerCapture keeps the drag alive even when the cursor
   * crosses into the Monaco iframe-like surface below.
   */
  function startResize(event) {
    event.preventDefault();
    if (isOutputCollapsed) setIsOutputCollapsed(false);

    const startY = event.clientY;
    const startHeight = outputHeight;
    const handle = event.currentTarget;

    handle.setPointerCapture?.(event.pointerId);
    document.body.classList.add('is-resizing');

    const onMove = (moveEvent) => {
      // Dragging up grows the panel, hence the inverted delta.
      resizeTo(startHeight - (moveEvent.clientY - startY));
    };

    const onUp = () => {
      handle.releasePointerCapture?.(event.pointerId);
      handle.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerup', onUp);
      handle.removeEventListener('pointercancel', onUp);
      document.body.classList.remove('is-resizing');
    };

    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onUp);
    handle.addEventListener('pointercancel', onUp);
  }

  /** The divider is focusable, so arrow keys must resize it too. */
  function handleResizeKey(event) {
    const STEP = event.shiftKey ? 40 : 12;
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      resizeTo(outputHeight + STEP);
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      resizeTo(outputHeight - STEP);
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      setIsOutputCollapsed((collapsed) => !collapsed);
    }
  }

  // Shrink the panel if the window becomes too short to honour the saved size.
  useEffect(() => {
    const onResize = () => setOutputHeight((current) => clamp(current, MIN_OUTPUT_HEIGHT, maxOutputHeight()));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  /** Brief inline confirmation on the copy button, alongside the toast. */
  const copyTimer = useRef(null);
  function flashCopied() {
    setJustCopied(true);
    clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setJustCopied(false), 1600);
  }
  useEffect(() => () => clearTimeout(copyTimer.current), []);

  /* ------------------------------------------------------------------ */
  /* Editor + toolbar handlers                                           */
  /* ------------------------------------------------------------------ */

  /** Local keystroke: broadcast the full document (last-write-wins). */
  const handleLocalChange = useCallback(
    (code) => {
      setHasUnsavedEdits(true);
      socketRef.current?.emit(EVENTS.CODE_CHANGE, { roomId, code });
    },
    [roomId]
  );

  function handleLanguageChange(nextId) {
    setLanguage(nextId);
    languageRef.current = nextId;
    socketRef.current?.emit(EVENTS.LANGUAGE_CHANGE, { roomId, language: nextId });

    // If nobody has written anything real yet, swap in the new starter so the
    // buffer is not stale C++ sitting under a "Python" label.
    const current = editorApiRef.current?.getValue() ?? '';
    if (isDisposableBuffer(current)) {
      const starter = getLanguage(nextId).starter;
      // applyRemote() suppresses onChange, so we emit the change ourselves.
      editorApiRef.current?.applyRemote(starter);
      socketRef.current?.emit(EVENTS.CODE_CHANGE, { roomId, code: starter });
    }
  }

  const handleRun = useCallback(async () => {
    // The keyboard shortcut can fire while a request is already in flight.
    if (isRunningRef.current) return;

    const code = editorApiRef.current?.getValue() ?? '';

    isRunningRef.current = true;
    setIsRunning(true);
    setRunResult(null);
    setRunError(null);

    try {
      const response = await fetch(`${API_BASE}/api/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ language: languageRef.current, code }),
      });

      const payload = await response.json();

      if (!response.ok) {
        setRunError(payload.error || `Execution failed (${response.status}).`);
        return;
      }

      setRunResult(payload);
    } catch {
      setRunError('Could not reach the execution service. Is the backend running?');
    } finally {
      isRunningRef.current = false;
      setIsRunning(false);
    }
  }, []);

  /* ------------------------------------------------------------------ */
  /* Keyboard shortcut                                                   */
  /* ------------------------------------------------------------------ */

  /**
   * Ctrl/Cmd+Enter runs the code from anywhere on the page. Monaco registers
   * the same shortcut internally (see EditorPane) for when the editor has
   * focus and swallows the keydown before it reaches window.
   */
  useEffect(() => {
    const onKeyDown = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        event.preventDefault();
        handleRun();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleRun]);


  async function handleCopyRoomId() {
    try {
      await navigator.clipboard.writeText(roomId);
      push('Room ID copied to clipboard.', 'success');
      flashCopied();
      return;
    } catch {
      // The clipboard API needs a secure context; fall back for plain http.
    }

    const scratch = document.createElement('textarea');
    scratch.value = roomId;
    scratch.style.position = 'fixed';
    scratch.style.opacity = '0';
    document.body.appendChild(scratch);
    scratch.select();
    const copied = document.execCommand('copy');
    document.body.removeChild(scratch);

    push(
      copied ? 'Room ID copied to clipboard.' : 'Copy failed — select the ID manually.',
      copied ? 'success' : 'error'
    );
    if (copied) flashCopied();
  }

  function handleLeave() {
    // Tell the room right away; the effect cleanup then closes the socket.
    socketRef.current?.emit(EVENTS.LEAVE_ROOM);
    navigate('/');
  }

  if (!username) return null; // redirecting to Home

  return (
    <div className="room">
      <header className="topbar">
        <div className="topbar__brand">
          <span className="logo logo--sm" aria-hidden="true">&lt;/&gt;</span>
          <span className="topbar__name">CodeSync</span>
        </div>

        <div className="topbar__room">
          <span className="topbar__roomlabel">Room</span>
          <code className="topbar__roomid" title={roomId}>{roomId}</code>
          <button
            type="button"
            className={`btn btn--ghost btn--sm ${justCopied ? 'btn--copied' : ''}`}
            onClick={handleCopyRoomId}
            title="Copy this room's ID so you can share it"
          >
            {justCopied ? '✓ Copied' : 'Copy ID'}
          </button>
        </div>

        <div className="topbar__actions">
          <label className="select">
            <span className="sr-only">Language</span>
            <select value={language} onChange={(event) => handleLanguageChange(event.target.value)}>
              {LANGUAGES.map((lang) => (
                <option key={lang.id} value={lang.id}>
                  {lang.label}
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            className="btn btn--primary"
            onClick={handleRun}
            disabled={isRunning}
            title="Run the code (Ctrl+Enter)"
          >
            {isRunning ? (
              <>
                <span className="spinner spinner--sm" aria-hidden="true" />
                Running…
              </>
            ) : (
              <>
                Run
                <kbd className="kbd kbd--on-primary">Ctrl ↵</kbd>
              </>
            )}
          </button>

          <button type="button" className="btn btn--danger" onClick={handleLeave}>
            Leave Room
          </button>
        </div>
      </header>

      <div className="room__body">
        <aside className="sidebar">
          <UserList users={users} currentSocketId={socketId} />

          <div className="sidebar__footer">
            <div className={`status ${isConnected ? 'status--on' : 'status--off'}`}>
              <span className="status__dot" aria-hidden="true" />
              {isConnected ? 'Connected' : 'Reconnecting…'}
            </div>

            <div className="status status--muted" title="Edits are saved 1.5s after typing stops">
              <span className="status__dot" aria-hidden="true" />
              {hasUnsavedEdits
                ? 'Unsaved changes…'
                : lastSavedAt
                  ? `Saved ${lastSavedAt.toLocaleTimeString()}`
                  : 'Not saved yet'}
            </div>
          </div>
        </aside>

        <main className="workspace" ref={workspaceRef}>
          <EditorPane
            ref={editorApiRef}
            language={language}
            onChange={handleLocalChange}
            onRunShortcut={handleRun}
          />

          {/* Drag (or focus + arrow keys) to resize the output panel. */}
          <div
            className="resizer"
            role="separator"
            aria-orientation="horizontal"
            aria-label="Resize output panel"
            aria-valuenow={isOutputCollapsed ? 0 : Math.round(outputHeight)}
            tabIndex={0}
            onPointerDown={startResize}
            onKeyDown={handleResizeKey}
            onDoubleClick={() => setIsOutputCollapsed((collapsed) => !collapsed)}
            title="Drag to resize · double-click to collapse"
          >
            <span className="resizer__grip" aria-hidden="true" />
          </div>

          <div style={{ height: isOutputCollapsed ? 'auto' : outputHeight, flexShrink: 0 }}>
            <OutputPanel
              result={runResult}
              error={runError}
              isRunning={isRunning}
              isCollapsed={isOutputCollapsed}
              onToggleCollapse={() => setIsOutputCollapsed((collapsed) => !collapsed)}
              onClear={() => {
                setRunResult(null);
                setRunError(null);
              }}
            />
          </div>
        </main>
      </div>

      <Toasts toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}
