/**
 * Renders whatever came back from /api/execute.
 *
 * `result` is the normalised Piston payload: an optional `compile` stage
 * (C++/Java) plus the `run` stage. Compile errors are shown first because if
 * compilation failed the run stage never produced anything useful.
 */
export default function OutputPanel({
  result,
  error,
  isRunning,
  onClear,
  isCollapsed,
  onToggleCollapse,
}) {
  const compileFailed = result?.compile && result.compile.code !== 0;
  const exitCode = result?.run?.code;
  const hasContent = Boolean(result || error);

  return (
    <section className="output" aria-label="Program output">
      <header className="output__header">
        <button
          type="button"
          className="output__toggle"
          onClick={onToggleCollapse}
          aria-expanded={!isCollapsed}
          title={isCollapsed ? 'Expand output' : 'Collapse output'}
        >
          <span className={`chevron ${isCollapsed ? 'chevron--up' : ''}`} aria-hidden="true" />
          <span className="output__title">Output</span>
        </button>

        {isRunning && (
          <span className="output__status output__status--busy">
            <span className="spinner spinner--sm" aria-hidden="true" />
            Running…
          </span>
        )}

        {!isRunning && result && (
          <span
            className={`output__status ${
              compileFailed || exitCode !== 0 ? 'output__status--fail' : 'output__status--ok'
            }`}
          >
            {compileFailed ? 'Compile error' : `Exit code ${exitCode}`}
            {result.version && (
              <span className="output__version">
                {result.language} {result.version}
              </span>
            )}
          </span>
        )}

        {/* Collapsed-but-populated needs a hint that there is something inside. */}
        {isCollapsed && hasContent && !isRunning && (
          <span className="output__hidden-hint">output hidden</span>
        )}

        {hasContent && !isRunning && (
          <button type="button" className="btn btn--ghost btn--sm output__clear" onClick={onClear}>
            Clear
          </button>
        )}
      </header>

      {!isCollapsed && (
        <pre className="output__body">
          {error && <span className="stream stream--error">{error}</span>}

          {!error && !result && !isRunning && (
            <span className="output__placeholder">
              Press <kbd className="kbd">Run</kbd> or <kbd className="kbd">Ctrl</kbd>
              <kbd className="kbd">↵</kbd> to execute your code.
            </span>
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
            !result.run?.stderr && <span className="output__placeholder">(no output)</span>}
        </pre>
      )}
    </section>
  );
}
