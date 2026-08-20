import { Router } from 'express';
import { config } from '../config/env.js';
import { LANGUAGES, isSupportedLanguage } from '../config/languages.js';

const router = Router();

const EXECUTION_TIMEOUT_MS = 20_000;
const MAX_CODE_LENGTH = 100_000;

/**
 * POST /api/execute  { language, code, stdin? }
 *
 * Thin proxy in front of the public Piston API.
 *
 * The browser could call Piston directly, but proxying buys three things:
 * the endpoint stays configurable via .env, the language -> runtime mapping
 * lives in one place next to the socket layer, and Piston's rate limit
 * (~5 requests/second per IP) is reported back as a readable message instead
 * of an opaque CORS/429 failure in the console.
 */
router.post('/execute', async (req, res) => {
  const { language, code, stdin = '' } = req.body ?? {};

  if (!isSupportedLanguage(language)) {
    return res.status(400).json({ error: `Unsupported language: ${language}` });
  }
  if (typeof code !== 'string' || code.trim() === '') {
    return res.status(400).json({ error: 'Nothing to run — the editor is empty.' });
  }
  if (code.length > MAX_CODE_LENGTH) {
    return res.status(413).json({ error: 'Code is too large to execute.' });
  }

  const runtime = LANGUAGES[language];

  // Abort rather than hanging the request forever if Piston is slow/down.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), EXECUTION_TIMEOUT_MS);

  try {
    const pistonRes = await fetch(config.pistonUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        language: runtime.piston,
        // "*" tells Piston to pick its latest installed version, so we do not
        // have to pin (and later chase) exact runtime versions.
        version: '*',
        files: [{ name: runtime.filename, content: code }],
        stdin,
      }),
    });

    if (pistonRes.status === 429) {
      return res.status(429).json({
        error: 'Piston rate limit reached (about 5 runs/second). Wait a moment and try again.',
      });
    }

    // As of 2026-02-15 the public emkc.org instance is whitelist-only, so an
    // un-registered deployment gets 401 here. Say so plainly instead of
    // surfacing a bare status code — see the README's "Code execution" section.
    if (pistonRes.status === 401 || pistonRes.status === 403) {
      return res.status(502).json({
        error:
          'The execution backend rejected this request. The public Piston API ' +
          'is whitelist-only, so point PISTON_API_URL at your own Piston ' +
          'instance (see README > Code execution).',
      });
    }

    if (!pistonRes.ok) {
      const detail = await pistonRes.text();
      return res.status(502).json({
        error: `Execution service responded with ${pistonRes.status}.`,
        detail: detail.slice(0, 500),
      });
    }

    const result = await pistonRes.json();

    // Normalise Piston's shape into something the output panel can render
    // directly. `compile` is only present for compiled languages (C++, Java)
    // and is where syntax errors show up.
    res.json({
      language: result.language,
      version: result.version,
      compile: result.compile
        ? { stdout: result.compile.stdout ?? '', stderr: result.compile.stderr ?? '', code: result.compile.code }
        : null,
      run: {
        stdout: result.run?.stdout ?? '',
        stderr: result.run?.stderr ?? '',
        code: result.run?.code ?? null,
        signal: result.run?.signal ?? null,
      },
    });
  } catch (err) {
    if (err.name === 'AbortError') {
      return res.status(504).json({ error: 'Execution timed out after 20 seconds.' });
    }
    console.error('[execute] failed:', err.message);
    res.status(502).json({ error: 'Could not reach the execution service.' });
  } finally {
    clearTimeout(timeout);
  }
});

export default router;
