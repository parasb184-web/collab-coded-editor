import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';

import { config } from '../config/env.js';

/**
 * Runs code with the compilers/interpreters installed on this machine.
 *
 * ⚠ THERE IS NO SANDBOX. A local run can read and write files, open sockets
 * and spawn processes as whoever owns the server process. That is acceptable
 * for a developer running this on their own laptop, and unacceptable anywhere
 * the room ID could reach a stranger — which is why `EXECUTION_MODE=local`
 * has to be set deliberately and defaults to off. Piston (the default) runs
 * code in a container on someone else's infrastructure, which is the safe
 * path for anything deployed.
 *
 * What we *can* enforce without a container is bounded time and bounded
 * output, and both are enforced below.
 */

const IS_WINDOWS = process.platform === 'win32';

/** Per-language build/run recipes, resolved against the temp working dir. */
function recipeFor(language, dir) {
  const binary = path.join(dir, IS_WINDOWS ? 'program.exe' : 'program.out');

  switch (language) {
    case 'javascript':
      return { file: 'main.js', run: { cmd: process.execPath, args: ['main.js'] } };

    case 'python':
      return { file: 'main.py', run: { cmd: config.pythonBin, args: ['main.py'] } };

    case 'cpp':
      return {
        file: 'main.cpp',
        compile: { cmd: 'g++', args: ['main.cpp', '-o', binary, '-std=c++17'] },
        // Absolute path: a bare "program.exe" is not resolved from cwd on Windows.
        run: { cmd: binary, args: [] },
      };

    case 'java':
      return {
        // javac requires the filename to match the public class, hence Main.
        file: 'Main.java',
        compile: { cmd: 'javac', args: ['Main.java'] },
        run: { cmd: 'java', args: ['-cp', dir, 'Main'] },
      };

    default:
      return null;
  }
}

/** Kill a process and everything it spawned. */
function killTree(child) {
  if (IS_WINDOWS) {
    // child.kill() only kills the direct child on Windows; a compiled program
    // launched from a shell would survive. taskkill /T takes the whole tree.
    spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  } else {
    try {
      process.kill(-child.pid, 'SIGKILL');
    } catch {
      child.kill('SIGKILL');
    }
  }
}

/**
 * Spawn one command, capped by time and output size.
 * @returns {Promise<{stdout: string, stderr: string, code: number|null, timedOut: boolean}>}
 */
function runCommand({ cmd, args }, { cwd, stdin = '', timeoutMs }) {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(cmd, args, {
        cwd,
        // Never `shell: true` — it would let shell metacharacters in a
        // filename or argument turn into a second command.
        shell: false,
        detached: !IS_WINDOWS,
      });
    } catch (err) {
      resolve({ stdout: '', stderr: `Failed to start ${cmd}: ${err.message}`, code: -1, timedOut: false });
      return;
    }

    let stdout = '';
    let stderr = '';
    let truncated = false;
    let timedOut = false;
    let settled = false;

    const cap = config.localMaxOutputBytes;

    const collect = (chunk, target) => {
      if (truncated) return target;
      const next = target + chunk;
      if (next.length > cap) {
        truncated = true;
        // A runaway `while(true) console.log()` must not exhaust our memory.
        killTree(child);
        return next.slice(0, cap) + `\n… output truncated at ${cap} bytes`;
      }
      return next;
    };

    child.stdout?.on('data', (d) => {
      stdout = collect(d.toString(), stdout);
    });
    child.stderr?.on('data', (d) => {
      stderr = collect(d.toString(), stderr);
    });

    const timer = setTimeout(() => {
      timedOut = true;
      killTree(child);
    }, timeoutMs);

    const finish = (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ stdout, stderr, code, timedOut });
    };

    child.on('error', (err) => {
      // ENOENT here means the toolchain is not on PATH.
      stderr += `${stderr ? '\n' : ''}${cmd} could not be started: ${err.message}`;
      finish(-1);
    });

    child.on('close', (code) => finish(code));

    if (stdin) child.stdin?.write(stdin);
    child.stdin?.end();
  });
}

/**
 * Compile (if needed) and run, returning the same shape as the Piston proxy so
 * the output panel does not care which mode produced it.
 */
export async function runLocally(language, code, stdin = '') {
  const dir = await mkdtemp(path.join(tmpdir(), 'codesync-run-'));

  try {
    const recipe = recipeFor(language, dir);
    if (!recipe) throw new Error(`No local recipe for ${language}`);

    await writeFile(path.join(dir, recipe.file), code, 'utf8');

    let compile = null;
    if (recipe.compile) {
      const result = await runCommand(recipe.compile, {
        cwd: dir,
        timeoutMs: config.localCompileTimeoutMs,
      });

      compile = {
        stdout: result.stdout,
        stderr: result.timedOut
          ? `Compilation timed out after ${config.localCompileTimeoutMs / 1000}s.`
          : result.stderr,
        code: result.timedOut ? -1 : result.code,
      };

      // Nothing to run if the build failed.
      if (compile.code !== 0) {
        return {
          language,
          version: 'local',
          compile,
          run: { stdout: '', stderr: '', code: null, signal: null },
        };
      }
    }

    const result = await runCommand(recipe.run, {
      cwd: dir,
      stdin,
      timeoutMs: config.localRunTimeoutMs,
    });

    return {
      language,
      version: 'local',
      compile,
      run: {
        stdout: result.stdout,
        stderr: result.timedOut
          ? `${result.stderr}\nExecution timed out after ${config.localRunTimeoutMs / 1000}s and was killed.`.trim()
          : result.stderr,
        code: result.timedOut ? -1 : result.code,
        signal: result.timedOut ? 'SIGKILL' : null,
      },
    };
  } finally {
    // Always clean up, even if the compile threw.
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
