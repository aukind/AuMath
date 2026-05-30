'use client';

import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import {
  $getNodeByKey,
  $getSelection,
  $isNodeSelection,
  COMMAND_PRIORITY_LOW,
  KEY_ESCAPE_COMMAND,
  SELECTION_CHANGE_COMMAND,
  type NodeKey,
} from 'lexical';
import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { $isMathNode } from './MathNode';

interface MathComponentProps {
  equation: string;
  inline: boolean;
  nodeKey: NodeKey;
}

// KaTeX throws a ParseError subclass; we duck-type to avoid importing the
// internal class (which is not stable across versions).
function getKatexErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

function MathComponent({ equation, inline, nodeKey }: MathComponentProps) {
  const [editor] = useLexicalComposerContext();
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(equation);
  const [parseError, setParseError] = useState<string | null>(null);
  const renderRef = useRef<HTMLSpanElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Keep local draft in sync if the node's equation is mutated from elsewhere
  // (e.g. collaborative edits, undo/redo).
  useEffect(() => {
    if (!isEditing) setDraft(equation);
  }, [equation, isEditing]);

  // Render KaTeX synchronously after layout so the resulting node measures
  // correctly inside Lexical's selection rects.
  useLayoutEffect(() => {
    if (isEditing) return;
    const host = renderRef.current;
    if (!host) return;

    try {
      katex.render(equation, host, {
        displayMode: !inline,
        throwOnError: true,
        // SECURITY: hard-disable \href and similar trust-gated macros so the
        // editor cannot be coerced into rendering `javascript:` URLs from
        // pasted/imported LaTeX.
        trust: false,
        strict: 'warn',
        output: 'html',
        macros: {},
      });
      setParseError(null);
    } catch (err) {
      // Wipe partial DOM left behind by KaTeX before signaling the error so
      // the React-managed fallback below is the only visible artifact.
      host.innerHTML = '';
      setParseError(getKatexErrorMessage(err));
    }
  }, [equation, inline, isEditing]);

  // Auto-focus + select the textarea as soon as we flip into edit mode.
  useLayoutEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.select();
    }
  }, [isEditing]);

  const enterEdit = useCallback(() => {
    setDraft(equation);
    setIsEditing(true);
  }, [equation]);

  const commit = useCallback(
    (nextEquation: string) => {
      editor.update(() => {
        const node = $getNodeByKey(nodeKey);
        if ($isMathNode(node)) {
          node.setEquation(nextEquation);
        }
      });
      setIsEditing(false);
    },
    [editor, nodeKey],
  );

  const cancel = useCallback(() => {
    setDraft(equation);
    setIsEditing(false);
  }, [equation]);

  // Escape exits edit mode without saving — only while the textarea owns focus.
  useEffect(() => {
    if (!isEditing) return undefined;
    return editor.registerCommand(
      KEY_ESCAPE_COMMAND,
      () => {
        cancel();
        return true;
      },
      COMMAND_PRIORITY_LOW,
    );
  }, [editor, isEditing, cancel]);

  // If the Lexical selection moves to a different node while we are editing,
  // treat that as an implicit save (mirrors typical inline-formula UX).
  useEffect(() => {
    if (!isEditing) return undefined;
    return editor.registerCommand(
      SELECTION_CHANGE_COMMAND,
      () => {
        const selection = $getSelection();
        if ($isNodeSelection(selection)) {
          const nodes = selection.getNodes();
          if (nodes.length === 1 && nodes[0]?.getKey() === nodeKey) return false;
        }
        commit(draft);
        return false;
      },
      COMMAND_PRIORITY_LOW,
    );
  }, [editor, isEditing, draft, nodeKey, commit]);

  if (isEditing) {
    return (
      <span
        className={
          inline
            ? 'math-node math-node--editing inline-flex align-middle'
            : 'math-node math-node--editing block my-2'
        }
        data-lexical-decorator="true"
      >
        <textarea
          ref={textareaRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => commit(draft)}
          onKeyDown={(e) => {
            // Enter without Shift commits; Shift+Enter inserts a newline so
            // multi-line LaTeX (matrices, aligned envs) stays authorable.
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              commit(draft);
            }
          }}
          // Stop Lexical from intercepting cursor keys while typing LaTeX.
          onKeyDownCapture={(e) => e.stopPropagation()}
          rows={inline ? 1 : Math.max(2, draft.split('\n').length)}
          spellCheck={false}
          autoCorrect="off"
          autoCapitalize="off"
          className={
            'min-w-[6rem] resize-none rounded border border-blue-400 ' +
            'bg-blue-50 px-2 py-1 font-mono text-sm text-slate-900 ' +
            'outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-500 ' +
            'dark:bg-slate-900 dark:text-slate-100 dark:border-blue-500'
          }
        />
      </span>
    );
  }

  return (
    <span
      className={
        inline
          ? 'math-node math-node--inline inline-flex flex-col align-middle'
          : 'math-node math-node--block my-2 flex flex-col items-center'
      }
      data-lexical-decorator="true"
      tabIndex={0}
      role="button"
      aria-label={`数学公式：${equation}`}
      onDoubleClick={enterEdit}
      onFocus={enterEdit}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          enterEdit();
        }
      }}
    >
      <span
        ref={renderRef}
        className={
          parseError
            ? 'math-node__broken text-red-500'
            : 'math-node__rendered cursor-pointer'
        }
        // KaTeX writes the markup itself; React must not stomp it.
        suppressHydrationWarning
      >
        {/* Fallback text shown only if KaTeX has not yet written into the host
            (e.g. SSR snapshot, before useLayoutEffect runs). */}
        {parseError ? equation : null}
      </span>
      {parseError ? (
        <span
          role="alert"
          className={
            'math-node__error mt-1 max-w-prose whitespace-pre-wrap break-words ' +
            'rounded border border-red-300 bg-red-50 px-2 py-1 ' +
            'font-mono text-xs text-red-700 ' +
            'dark:border-red-700 dark:bg-red-950 dark:text-red-300'
          }
        >
          KaTeX ParseError: {parseError}
        </span>
      ) : null}
    </span>
  );
}

export default memo(MathComponent);
