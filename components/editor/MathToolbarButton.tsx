'use client';

import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { INSERT_MATH_COMMAND } from './MathPlugin';

type Mode = 'inline' | 'block';

interface MathToolbarButtonProps {
  className?: string;
  // Optional headless render — lets host UI supply its own button chrome
  // (shadcn/ui Button, icon-only, etc.) while reusing the prompt + dispatch.
  renderTrigger?: (open: () => void, disabled: boolean) => React.ReactNode;
}

/**
 * Toolbar trigger + lightweight modal for inserting a math node. Kept
 * intentionally dependency-free (no shadcn `Dialog`) so it slots into any
 * Lexical toolbar without coupling.
 */
export function MathToolbarButton({
  className,
  renderTrigger,
}: MathToolbarButtonProps) {
  const [editor] = useLexicalComposerContext();
  const [open, setOpen] = useState(false);
  const [equation, setEquation] = useState('');
  const [mode, setMode] = useState<Mode>('inline');
  const [editable, setEditable] = useState(editor.isEditable());
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const titleId = useId();

  useEffect(
    () => editor.registerEditableListener((next) => setEditable(next)),
    [editor],
  );

  // Autofocus when the dialog mounts.
  useEffect(() => {
    if (open) textareaRef.current?.focus();
  }, [open]);

  const insert = useCallback(() => {
    const value = equation.trim();
    if (!value) return;
    editor.dispatchCommand(INSERT_MATH_COMMAND, {
      equation: value,
      inline: mode === 'inline',
    });
    setEquation('');
    setOpen(false);
  }, [editor, equation, mode]);

  // Escape closes the dialog when it has focus.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const trigger = renderTrigger ? (
    renderTrigger(() => setOpen(true), !editable)
  ) : (
    <button
      type="button"
      disabled={!editable}
      onClick={() => setOpen(true)}
      title="插入数学公式 (Σ)"
      className={
        className ??
        'inline-flex h-8 items-center gap-1 rounded border border-slate-200 ' +
          'bg-white px-2 text-sm font-medium text-slate-700 hover:bg-slate-50 ' +
          'disabled:cursor-not-allowed disabled:opacity-50 ' +
          'dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 ' +
          'dark:hover:bg-slate-800'
      }
    >
      <span aria-hidden className="font-serif italic">Σ</span>
      <span>公式</span>
    </button>
  );

  return (
    <>
      {trigger}
      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onMouseDown={(e) => {
            // Backdrop click closes; inner clicks don't bubble here.
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div
            className={
              'w-full max-w-md rounded-lg border border-slate-200 bg-white ' +
              'p-4 shadow-xl dark:border-slate-700 dark:bg-slate-900'
            }
          >
            <h2
              id={titleId}
              className="mb-3 text-base font-semibold text-slate-900 dark:text-slate-100"
            >
              插入数学公式
            </h2>

            <div className="mb-3 flex gap-2 text-sm">
              {(['inline', 'block'] as const).map((m) => (
                <label
                  key={m}
                  className={
                    'inline-flex cursor-pointer items-center gap-1 rounded border px-2 py-1 ' +
                    (mode === m
                      ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-200'
                      : 'border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-400')
                  }
                >
                  <input
                    type="radio"
                    name="math-mode"
                    value={m}
                    checked={mode === m}
                    onChange={() => setMode(m)}
                    className="sr-only"
                  />
                  {m === 'inline' ? '行内 $…$' : '块级 $$…$$'}
                </label>
              ))}
            </div>

            <textarea
              ref={textareaRef}
              value={equation}
              onChange={(e) => setEquation(e.target.value)}
              onKeyDown={(e) => {
                // Ctrl/Cmd + Enter commits regardless of multi-line content.
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  insert();
                }
              }}
              rows={mode === 'block' ? 4 : 2}
              spellCheck={false}
              placeholder={mode === 'inline' ? 'a^2 + b^2 = c^2' : '\\int_0^1 x^2 \\,dx'}
              className={
                'w-full resize-y rounded border border-slate-300 bg-white px-2 py-1 ' +
                'font-mono text-sm text-slate-900 outline-none ' +
                'focus:border-blue-500 focus:ring-1 focus:ring-blue-500 ' +
                'dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100'
              }
            />

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className={
                  'rounded border border-slate-200 px-3 py-1 text-sm text-slate-600 ' +
                  'hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 ' +
                  'dark:hover:bg-slate-800'
                }
              >
                取消
              </button>
              <button
                type="button"
                onClick={insert}
                disabled={!equation.trim()}
                className={
                  'rounded bg-blue-600 px-3 py-1 text-sm font-medium text-white ' +
                  'hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50'
                }
              >
                插入 (⌘↵)
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
