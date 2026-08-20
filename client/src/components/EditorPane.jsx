import { forwardRef, useImperativeHandle, useRef } from 'react';
import Editor from '@monaco-editor/react';
import { getLanguage } from '../constants/languages.js';

/**
 * Monaco wrapper.
 *
 * The editor is *uncontrolled*: React never feeds a `value` prop back into it.
 * Remote text is written straight into the Monaco model through the
 * `applyRemote` imperative handle. That is what keeps the echo loop closed —
 * see the comment on `isApplyingRemote` below.
 */
const EditorPane = forwardRef(function EditorPane({ language, onChange }, ref) {
  const editorRef = useRef(null);

  /**
   * True only for the few synchronous milliseconds while a remote edit is
   * being written into the model.
   *
   * Monaco fires `onChange` for programmatic edits exactly as it does for
   * typing. Without this flag: A types -> B applies -> B emits -> A applies ->
   * A emits -> … an infinite ping-pong. The flag makes `handleChange` ignore
   * changes that we caused ourselves.
   */
  const isApplyingRemote = useRef(false);

  /** Text that arrived before Monaco finished loading, replayed on mount. */
  const pendingRemote = useRef(null);

  useImperativeHandle(ref, () => ({
    /** Overwrite the buffer with an incoming snapshot (last-write-wins). */
    applyRemote(nextCode) {
      const editor = editorRef.current;

      if (!editor) {
        pendingRemote.current = nextCode;
        return;
      }

      const model = editor.getModel();
      if (!model || model.getValue() === nextCode) return; // already in sync

      // Remember where the caret/selection was so a remote edit does not yank
      // the cursor to the top of the file on every keystroke someone else makes.
      const selections = editor.getSelections();

      isApplyingRemote.current = true;
      try {
        model.pushEditOperations(
          selections,
          [{ range: model.getFullModelRange(), text: nextCode, forceMoveMarkers: true }],
          () => selections
        );
        editor.pushUndoStop();
      } finally {
        // `finally` so a throw inside Monaco can never leave the flag stuck on,
        // which would silently stop this client from broadcasting.
        isApplyingRemote.current = false;
      }
    },

    getValue() {
      return editorRef.current?.getModel()?.getValue() ?? '';
    },

    focus() {
      editorRef.current?.focus();
    },
  }));

  function handleMount(editor) {
    editorRef.current = editor;

    // Apply anything that arrived during Monaco's async load.
    if (pendingRemote.current !== null) {
      const queued = pendingRemote.current;
      pendingRemote.current = null;
      isApplyingRemote.current = true;
      try {
        editor.getModel()?.setValue(queued);
      } finally {
        isApplyingRemote.current = false;
      }
    }

    editor.focus();
  }

  function handleChange(value) {
    if (isApplyingRemote.current) return; // echo guard — do not re-broadcast
    onChange(value ?? '');
  }

  return (
    <div className="editor">
      <Editor
        height="100%"
        theme="vs-dark"
        language={getLanguage(language).monaco}
        onMount={handleMount}
        onChange={handleChange}
        loading={<div className="editor__loading">Loading editor…</div>}
        options={{
          fontSize: 14,
          fontFamily: '"JetBrains Mono", "Fira Code", Consolas, monospace',
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          smoothScrolling: true,
          automaticLayout: true,
          tabSize: 2,
          padding: { top: 14, bottom: 14 },
          renderLineHighlight: 'line',
          cursorBlinking: 'smooth',
        }}
      />
    </div>
  );
});

export default EditorPane;
