import mongoose from 'mongoose';

/**
 * Connect to MongoDB.
 *
 * If the connection fails we deliberately do NOT kill the process: real-time
 * collaboration works fine without a database, you just lose persistence.
 * Every write goes through `services/persistence.js`, which checks
 * `isDbReady()` before touching a model, so a missing DB degrades gracefully
 * instead of throwing on every keystroke.
 */
export async function connectDB(uri) {
  mongoose.connection.on('connected', () => console.log('[db] connected'));
  mongoose.connection.on('disconnected', () => console.warn('[db] disconnected'));
  mongoose.connection.on('error', (err) => console.error('[db] error:', err.message));

  try {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000,
      // Fail fast instead of queueing operations forever when Mongo is down.
      bufferCommands: false,
    });
    return true;
  } catch (err) {
    console.warn('---------------------------------------------------------------');
    console.warn('[db] Could not reach MongoDB:', err.message);
    console.warn('[db] Running WITHOUT persistence — edits sync live but are');
    console.warn('[db] not saved. Start MongoDB or fix MONGODB_URI in .env.');
    console.warn('[db] Retrying in the background every 10s...');
    console.warn('---------------------------------------------------------------');

    // Mongoose only auto-reconnects a connection that succeeded at least once,
    // so after a failed *initial* connect we have to keep trying ourselves.
    // Otherwise starting the server before MongoDB would disable persistence
    // for the whole life of the process.
    retryConnect(uri);
    return false;
  }
}

function retryConnect(uri, intervalMs = 10_000) {
  const timer = setInterval(async () => {
    if (isDbReady()) {
      clearInterval(timer);
      return;
    }
    try {
      await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000, bufferCommands: false });
      console.log('[db] reconnected — persistence is active again');
      clearInterval(timer);
    } catch {
      // Still down; stay quiet and try again on the next tick.
    }
  }, intervalMs);

  // Don't hold the event loop open just for the retry timer.
  timer.unref();
}

/** 1 === connected. Guards every read/write so we never buffer or throw. */
export function isDbReady() {
  return mongoose.connection.readyState === 1;
}
