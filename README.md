# CodeSync

A real-time collaborative code editor built on the MERN stack with Socket.IO. Several people open the same room ID and type into one shared Monaco buffer, with live presence, per-room persistence, and one-click code execution.

- **Home** — enter a name and a room ID, or generate a fresh one.
- **Room** — Monaco editor, language selector (JavaScript / Python / C++ / Java), participant sidebar, output panel.
- **Sync** — every keystroke broadcasts the full document to the room; last write wins.
- **Persistence** — the buffer is saved to MongoDB 1.5 s after typing stops, so a refresh never loses work.
- **Run** — executes the buffer through a Piston instance and shows stdout / stderr.

---

## Requirements

| | |
|---|---|
| Node.js | 18 or newer (the server uses the built-in `fetch`) |
| MongoDB | A local `mongod` or a MongoDB Atlas connection string |
| npm | 9 or newer |

MongoDB is optional for a quick look: without it the editor still syncs in real time, it just cannot save. The server prints a clear warning and retries the connection every 10 s in the background.

---

## Setup

Clone the repo, then set up each half.

### 1. Backend

```bash
cd server
npm install
cp .env.example .env      # Windows: copy .env.example .env
npm run dev               # http://localhost:5000
```

`server/.env`:

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `5000` | Port for Express **and** Socket.IO (they share one HTTP server) |
| `MONGODB_URI` | `mongodb://127.0.0.1:27017/codesync` | Where rooms are stored |
| `CLIENT_ORIGIN` | `http://localhost:5173` | Allowed CORS origins, comma-separated |
| `PISTON_API_URL` | `https://emkc.org/api/v2/piston/execute` | Code-execution endpoint — see [Code execution](#code-execution) |

### 2. Frontend

In a second terminal:

```bash
cd client
npm install
cp .env.example .env      # optional in development
npm run dev               # http://localhost:5173
```

`client/.env`:

| Variable | Default | Purpose |
|---|---|---|
| `VITE_SERVER_URL` | *(empty)* | Backend origin. Leave blank locally — Vite proxies `/api` and `/socket.io` to port 5000 for you. Set it to your deployed backend URL in production. |

### 3. Try it

Open <http://localhost:5173>, enter a name, click **Create Room**, then **Join Room**. Paste the same URL into a second browser window (or an incognito window) and watch the two buffers stay in sync.

### Running both at once

From the repo root:

```bash
npm install     # installs `concurrently` only
npm run dev     # starts server and client together
```

---

## Code execution

The **Run** button POSTs `{ language, code }` to `POST /api/execute`, which forwards it to a [Piston](https://github.com/engineer-man/piston) instance and returns the normalised compile/run output.

> **Heads-up:** as of **15 February 2026** the public instance at `emkc.org` is **whitelist-only** and answers un-registered callers with `401`. The default `PISTON_API_URL` still points there because that is the documented public endpoint, but out of the box **Run will report that the execution backend rejected the request** until you do one of the following:
>
> 1. **Self-host Piston** and point `PISTON_API_URL` at it, e.g. `http://localhost:2000/api/v2/execute`. Install instructions are in the [Piston README](https://github.com/engineer-man/piston#self-hosting).
> 2. **Apply for whitelisting** on the public instance — see the "Important Note" in the same README.
> 3. **Point at any Piston-compatible endpoint** you already have. The request/response shape is unchanged, so only the env var moves.
>
> Everything else in the app — editing, sync, presence, persistence — is entirely independent of this and works as-is.

The request goes through the backend rather than straight from the browser so that the endpoint stays configurable, the language-to-runtime mapping lives in one place, and rate limits or auth failures come back as readable messages instead of opaque console errors.

Java note: the runner compiles the buffer as `Main.java`, so your public class must be named `Main`.

---

## Architecture

```
┌──────────────────────── browser ────────────────────────┐
│  React + Vite                                            │
│    /            Home.jsx    name + room ID               │
│    /room/:id    Room.jsx    owns ONE socket in a ref     │
│                   ├─ EditorPane.jsx   Monaco + echo guard│
│                   ├─ UserList.jsx     presence sidebar   │
│                   └─ OutputPanel.jsx  stdout / stderr    │
└───────────────┬──────────────────────┬──────────────────┘
                │ WebSocket            │ HTTP
                │ (socket.io-client)   │ POST /api/execute
┌───────────────▼──────────────────────▼──────────────────┐
│  Node + Express + Socket.IO  (one HTTP server, one port) │
│    socket/index.js     join / code-change / presence     │
│    services/roomStore  in-memory Map: who is in a room   │
│    services/persistence debounced writes (1.5 s)         │
│    routes/execute.js   proxy to Piston                   │
└───────────────┬──────────────────────┬──────────────────┘
                │ Mongoose             │ HTTPS
        ┌───────▼────────┐     ┌───────▼────────┐
        │    MongoDB     │     │  Piston API    │
        │ { roomId, code,│     │  code runner   │
        │  language,     │     └────────────────┘
        │  updatedAt }   │
        └────────────────┘
```

### Socket events

| Event | Direction | Payload |
|---|---|---|
| `join-room` | client → server | `{ roomId, username }` |
| `code-change` | client ⇄ server | `{ roomId, code }` out, `{ code }` back |
| `language-change` | client ⇄ server | `{ roomId, language }` out, `{ language, username }` back |
| `leave-room` | client → server | — |
| `room-state` | server → joiner | `{ code, language, updatedAt, isNew, isFirstUser }` |
| `users-update` | server → room | `{ users: [{ socketId, username, joinedAt }] }` |
| `user-joined` / `user-left` | server → others | `{ username, socketId }` |
| `room-saved` | server → room | `{ updatedAt }` |
| `room-error` | server → client | `{ message }` |

### Design decisions

**Last-write-wins, no OT/CRDT.** Every keystroke sends the whole document and the newest one to arrive replaces what was there. This is simple and predictable, and it is why there is no `yjs` or `sharedb` in the dependency list. The trade-off is real: if two people edit different parts of the file at the same instant, one of those edits is lost. It suits pair-programming and interviews, not a dozen simultaneous authors.

**The echo guard, in two halves.** Without it, A's edit reaches B, B's editor fires `onChange`, B re-emits, A applies it, A re-emits — forever.

- *Server side* — broadcasts use `socket.to(roomId)`, which sends to everyone in the room **except** the sender.
- *Client side* — `EditorPane` writes incoming text into Monaco with an `isApplyingRemote` ref raised. Monaco fires `onChange` for programmatic edits exactly as it does for typing, so that flag is what tells the handler "you caused this, do not broadcast it." It is lowered in a `finally` block, so a throw inside Monaco can never leave a client permanently mute.

Remote text is applied with `model.pushEditOperations(...)` rather than `setValue`, and the previous selection is restored, so a collaborator typing does not yank your cursor to the top of the file.

**Server-side debounce.** The 1.5 s save timer lives on the server, one per room. Debouncing in each client instead would mean N browsers racing to write the same document N times. One timer per room means exactly one writer. The buffer is also flushed immediately when the last person leaves, and on `SIGINT`/`SIGTERM`, so the final 1.5 s of typing is not lost on shutdown.

**Presence in memory, not in Mongo.** Who is connected right now is ephemeral — restart the process and everyone reconnects anyway. `roomStore.js` keeps two maps in sync: `roomId → Map<socketId, user>` for "who is here", and `socketId → { roomId, username }` so a disconnect cleans up in constant time. Rooms are deleted from the map once empty so it cannot grow without bound.

**Uncontrolled editor.** React never feeds a `value` prop back into Monaco. The editor owns its buffer, and `Room.jsx` talks to it through a small imperative handle (`applyRemote` / `getValue` / `focus`). This keeps re-renders away from the hot path and makes the echo guard explicit instead of relying on library internals.

### Project layout

```
server/
  src/
    config/      env, Mongo connection, language↔runtime table
    models/      Room.js — the whole persistence schema
    routes/      execute.js (Piston proxy), rooms.js (debug lookup)
    services/    roomStore.js (presence), persistence.js (debounced saves)
    socket/      index.js (handlers), events.js (shared event names)
    index.js     Express + Socket.IO bootstrap, graceful shutdown
client/
  src/
    components/  EditorPane, UserList, OutputPanel, Toasts
    constants/   languages.js — selector entries + starter snippets
    hooks/       useToasts.js
    pages/       Home.jsx, Room.jsx
    socket.js    socket factory + shared event names
    styles.css   the entire dark theme, plain CSS
```

`socket.js` and `server/src/socket/events.js` intentionally duplicate the event-name constants — the two halves are separate npm packages, and a shared enum is the one thing most likely to drift silently.

---

## Known limitations

- **Concurrent edits can clobber each other.** That is what last-write-wins means; see above.
- **No authentication.** Anyone with a room ID can join and edit it. Room IDs are the only secret.
- **No cursor sharing.** You see who is in the room, not where they are typing.
- **Undo is per-client.** Remote edits enter your undo stack, so undo can pull back someone else's text.
- **Run depends on an external service** whose public instance now requires whitelisting — see [Code execution](#code-execution).

## Scripts

| Location | Command | Does |
|---|---|---|
| `server` | `npm run dev` | Start with `node --watch` (auto-restart) |
| `server` | `npm start` | Start once |
| `client` | `npm run dev` | Vite dev server with API + WebSocket proxy |
| `client` | `npm run build` | Production bundle into `client/dist` |
| `client` | `npm run preview` | Serve the built bundle |
| root | `npm run dev` | Both halves together via `concurrently` |
