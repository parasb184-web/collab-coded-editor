import { useCallback, useRef, useState } from 'react';

const DEFAULT_DURATION = 3000;

/**
 * Minimal toast queue — no notification library needed for four kinds of
 * message. Timers are tracked so they can be cleared if a toast is dismissed
 * by hand before it expires.
 */
export function useToasts() {
  const [toasts, setToasts] = useState([]);
  const timers = useRef(new Map());

  const dismiss = useCallback((id) => {
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  /** @param {'info'|'success'|'error'} type */
  const push = useCallback(
    (message, type = 'info', duration = DEFAULT_DURATION) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setToasts((current) => [...current, { id, message, type }]);
      timers.current.set(id, setTimeout(() => dismiss(id), duration));
      return id;
    },
    [dismiss]
  );

  return { toasts, push, dismiss };
}
