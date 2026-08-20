/**
 * Renders whatever came back from /api/execute.
 *
 * `result` is the normalised Piston payload: an optional `compile` stage
 * (C++/Java) plus the `run` stage. Compile errors are shown first because if
 * compilation failed the run stage never produced anything useful.
 */
export default function OutputPanel({ result, error, isRunning, onClear }) {
  const compileFailed = result?.compile && result.compile.code !== 0;
  const exitCode = result?.run?.code;

  return (
    <section className="output">
      <header className="output__header">
        <span className="output__title">Output</span>

        {isRunning && <span className="output__status output__status--busy">Running…</span>}

        {!isRunning && result && (
          <span
            className={`output__status ${
              compileFailed || exitCode !== 0 ? 'output__status--fail' : 'output__status--ok'
            }`}
          >
            {compileFailed ? 'Compile error' : `Exit code ${exitCode}`}
            {result.version && <span className="output__version">{result.language} {result.version}</span>}
          </span>
        )}

        {(result || error) && !isRunning && (
          <button type="button" className="btn btn--ghost btn--sm" onClick={onClear}>
            Clear
          </button>
        )}
      </header>

      <pre className="output__body">
        {error && <span className="stream stream--error">{error}</span>}

        {!error && !result && !isRunning && (
          <span className="output__placeholder">Press “Run” to execute your code.</span>
        )}

        {result?.compile?.stderr && (
          <span className="stream stream--error">{result.compile.stderr}</span>
        )}
        {result?.run?.stdout && <span className="stream">{result.run.stdout}</span>}
        {result?.run?.stderr && <span className="stream stream--error">{result.run.stderr}</span>}

        {/* A program can legitimately succeed while printing nothing. */}
        {result &&
          !result.compile?.stderr &&
          !result.run?.stdout &&
          !result.run?.stderr && (
            <span className="output__placeholder">(no output)</span>
          )}
      </pre>
    </section>
  );
}
