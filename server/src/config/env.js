import 'dotenv/config';

/**
 * Central place for every environment-driven setting, with sane defaults so
 * the server still boots when someone forgets to copy `.env.example`.
 */
export const config = {
  port: Number(process.env.PORT) || 5000,
  mongoUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/codesync',

  // Accept a comma-separated list so you can add a deployed frontend later.
  clientOrigins: (process.env.CLIENT_ORIGIN || 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),

  pistonUrl: process.env.PISTON_API_URL || 'https://emkc.org/api/v2/piston/execute',

  // How long the server waits after the last keystroke before writing to Mongo.
  saveDebounceMs: 1500,
};
