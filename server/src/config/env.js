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

  /**
   * 'piston' (default) sends code to a Piston instance. 'local' runs it with
   * the toolchains installed on this machine — convenient offline, but there
   * is NO sandbox, so it must stay off for anything reachable by others.
   */
  executionMode: process.env.EXECUTION_MODE === 'local' ? 'local' : 'piston',

  // Windows ships `python`; most other systems use `python3`.
  pythonBin: process.env.PYTHON_BIN || (process.platform === 'win32' ? 'python' : 'python3'),

  localCompileTimeoutMs: Number(process.env.LOCAL_COMPILE_TIMEOUT_MS) || 20_000,
  localRunTimeoutMs: Number(process.env.LOCAL_RUN_TIMEOUT_MS) || 10_000,
  localMaxOutputBytes: Number(process.env.LOCAL_MAX_OUTPUT_BYTES) || 64_000,

  // How long the server waits after the last keystroke before writing to Mongo.
  saveDebounceMs: 1500,
};
