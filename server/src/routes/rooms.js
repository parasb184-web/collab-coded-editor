import { Router } from 'express';
import { loadRoom } from '../services/persistence.js';
import { getUsers } from '../services/roomStore.js';
import { DEFAULT_LANGUAGE } from '../config/languages.js';

const router = Router();

/**
 * GET /api/rooms/:roomId
 *
 * Not required by the editor — the socket handshake already delivers room
 * state on join — but handy for debugging persistence and for a future
 * "preview a room before joining" screen.
 */
router.get('/rooms/:roomId', async (req, res) => {
  const { roomId } = req.params;
  const saved = await loadRoom(roomId);

  res.json({
    roomId,
    exists: Boolean(saved),
    code: saved?.code ?? '',
    language: saved?.language ?? DEFAULT_LANGUAGE,
    updatedAt: saved?.updatedAt ?? null,
    activeUsers: getUsers(roomId).length,
  });
});

export default router;
