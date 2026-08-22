import http from 'node:http';
import express from 'express';
import cors from 'cors';
import { Server } from 'socket.io';

import { config } from './config/env.js';
import { connectDB, isDbReady } from './config/db.js';
import { registerSocketHandlers } from './socket/index.js';
import { flushAll } from './services/persistence.js';
import executeRoutes from './routes/execute.js';
import roomRoutes from './routes/rooms.js';

const app = express();

app.use(cors({ origin: config.clientOrigins }));
// Editor buffers can get large; the default 100kb limit is too tight.
app.use(express.json({ limit: '2mb' }));

app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    database: isDbReady() ? 'connected' : 'unavailable',
    execution: config.executionMode,
  });
});

app.use('/api', executeRoutes);
app.use('/api', roomRoutes);

// Express + Socket.IO share one HTTP server, so both live on the same port.
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: config.clientOrigins, methods: ['GET', 'POST'] },
});

registerSocketHandlers(io);

await connectDB(config.mongoUri);

server.listen(config.port, () => {
  console.log(`[server] listening on http://localhost:${config.port}`);
  console.log(`[server] accepting clients from: ${config.clientOrigins.join(', ')}`);

  if (config.executionMode === 'local') {
    // Loud on purpose: this is the one setting that can hurt you.
    console.warn('***************************************************************');
    console.warn('[execute] LOCAL EXECUTION IS ENABLED.');
    console.warn('[execute] Code from any room runs on this machine with no');
    console.warn('[execute] sandbox, as this user. Fine on your own laptop.');
    console.warn('[execute] NEVER enable this on a deployed/public server —');
    console.warn('[execute] anyone with a room ID would get code execution.');
    console.warn('***************************************************************');
  } else {
    console.log(`[execute] mode: piston (${config.pistonUrl})`);
  }
});

/** Don't lose the last 1.5s of typing when the process is stopped. */
let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;

  console.log(`\n[server] ${signal} received — flushing pending saves...`);
  await flushAll();
  io.close();
  server.close(() => process.exit(0));

  // Safety net in case a socket refuses to close.
  setTimeout(() => process.exit(0), 5000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
