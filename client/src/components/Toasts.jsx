const ICONS = {
  success: '✓',
  error: '!',
  info: 'i',
};

/** Fixed-position stack of transient notifications. */
export default function Toasts({ toasts, onDismiss }) {
  if (toasts.length === 0) return null;

  return (
    <div className="toast-stack" role="status" aria-live="polite">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast toast--${toast.type}`}>
          <span className="toast__icon" aria-hidden="true">
            {ICONS[toast.type] ?? ICONS.info}
          </span>

          <span className="toast__message">{toast.message}</span>

          {/* An explicit target, so dismissing does not depend on knowing the
              whole toast is clickable. */}
          <button
            type="button"
            className="toast__close"
            onClick={() => onDismiss(toast.id)}
            aria-label="Dismiss notification"
            title="Dismiss"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
