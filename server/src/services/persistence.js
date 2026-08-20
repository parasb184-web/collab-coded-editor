import { Room } from '../models/Room.js';
import { config } from '../config/env.js';
import { isDbReady } from '../config/db.js';

/**
 * Debounced room persistence.
 *
 * Every keystroke broadcasts immediately, but writing each one to Mongo would
 * be thousands of writes per minute. Instead we hold the newest snapshot per
 * room in memory and flush it once the room has been quiet for
 * `config.saveDebounceMs` (1.5s).
 *
 * The debounce lives on the SERVER rather than in each client on purpose:
 * with N people typing, N client-side debouncers would still produce N
 * competing writes. One timer per room means exactly one writer.
 */

/** roomId -> { timer, code?, language? } */
const pending = new Map();

/** Optional hook so the socket layer can tell clients "saved at HH:MM:SS". */
let onSaved = null;
export function setSaveListener(fn) {
  onSaved = fn;
}

/**
 * Load a room's saved snapshot, creating nothing if it does not exist yet.
 * Falls back to an empty buffer when the DB is unavailable.
 */
export async function loadRoom(roomId) {
  if (!isDbReady()) return null;

  try {
    return await Room.findOne({ roomId }).lean();
  } catch (err) {
    console.error('[persistence] load failed:', err.message);
    return null;
  }
}

/**
 * Record the newest state of a room and (re)arm the debounce timer.
 * `patch` may contain `code`, `language`, or both.
 */
export function scheduleSave(roomId, patch) {
  if (!isDbReady()) return;

  const entry = pending.get(roomId) || { timer: null };
  Object.assign(entry, patch);

  // Restart the countdown: we want 1.5s of *silence*, not 1.5s since the
  // first edit.
  if (entry.timer) clearTimeout(entry.timer);
  entry.timer = setTimeout(() => flush(roomId), config.saveDebounceMs);

  pending.set(roomId, entry);
}

/** Write a room's pending snapshot now, cancelling any armed timer. */
export async function flush(roomId) {
  const entry = pending.get(roomId);
  if (!entry) return;

  if (entry.timer) clearTimeout(entry.timer);
  pending.delete(roomId);

  if (!isDbReady()) return;

  const update = { updatedAt: new Date() };
  if (typeof entry.code === 'string') update.code = entry.code;
  if (typeof entry.language === 'string') update.language = entry.language;

  try {
    // upsert: the first save is what actually creates the room document.
    //
    // `roomId` is the only $setOnInsert field: naming anything that also
    // appears in $set (`language`, for instance) makes MongoDB reject the
    // whole update with a path conflict. The schema's own defaults cover the
    // remaining fields on insert.
    await Room.updateOne({ roomId }, { $set: update, $setOnInsert: { roomId } }, { upsert: true });
    onSaved?.(roomId, update.updatedAt);
  } catch (err) {
    console.error('[persistence] save failed for', roomId, '-', err.message);
  }
}

/** Flush every pending room — used on the last leave and on shutdown. */
export async function flushAll() {
  await Promise.all([...pending.keys()].map(flush));
}
