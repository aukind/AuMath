'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useDropzone, type FileRejection } from 'react-dropzone';
import { Camera, ClipboardPaste, Loader2, X } from 'lucide-react';
import MathRenderer from '@/components/MathRenderer';
import { extractLatexFromImage } from '@/app/actions/extract-latex';

type Stage =
  | { kind: 'idle' }
  | { kind: 'loading'; previewUrl: string }
  | { kind: 'ready'; previewUrl: string; markdown: string }
  | { kind: 'error'; previewUrl: string | null; message: string };

interface ScreenshotToLatexButtonProps {
  /** Receives the Markdown+LaTeX snippet ready to splice into the textarea. */
  onInsert: (snippet: string) => void;
  className?: string;
}

const ACCEPT = {
  'image/png': ['.png'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/webp': ['.webp'],
  'image/gif': ['.gif'],
};

async function fileToBase64(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = '';
  // Chunked because String.fromCharCode(...big array) blows the call stack on
  // multi-MB images.
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

export function ScreenshotToLatexButton({
  onInsert,
  className,
}: ScreenshotToLatexButtonProps) {
  const [open, setOpen] = useState(false);
  const [stage, setStage] = useState<Stage>({ kind: 'idle' });
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const titleId = useId();

  // Revoke object URLs we hand to <img src> so closing the dialog doesn't leak.
  useEffect(() => {
    return () => {
      if (stage.kind === 'loading' || stage.kind === 'ready') {
        URL.revokeObjectURL(stage.previewUrl);
      } else if (stage.kind === 'error' && stage.previewUrl) {
        URL.revokeObjectURL(stage.previewUrl);
      }
    };
  }, [stage]);

  const reset = useCallback(() => setStage({ kind: 'idle' }), []);

  const handleFile = useCallback(async (file: File) => {
    const previewUrl = URL.createObjectURL(file);
    setStage({ kind: 'loading', previewUrl });
    try {
      const base64 = await fileToBase64(file);
      const result = await extractLatexFromImage(base64, file.type);
      if (!result.success) {
        setStage({ kind: 'error', previewUrl, message: result.error });
        return;
      }
      setStage({ kind: 'ready', previewUrl, markdown: result.markdown });
    } catch (e) {
      setStage({
        kind: 'error',
        previewUrl,
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }, []);

  const onDrop = useCallback(
    (accepted: File[], rejections: FileRejection[]) => {
      if (rejections.length > 0) {
        setStage({
          kind: 'error',
          previewUrl: null,
          message: rejections[0]?.errors[0]?.message ?? '不支持的文件类型',
        });
        return;
      }
      const file = accepted[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPT,
    multiple: false,
    noClick: stage.kind !== 'idle',
  });

  // Clipboard paste — only listen while the dialog is open so we don't fight
  // other paste handlers on the page.
  useEffect(() => {
    if (!open) return undefined;
    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.kind === 'file' && item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) {
            e.preventDefault();
            handleFile(file);
            return;
          }
        }
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [open, handleFile]);

  // Esc closes the dialog.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        reset();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, reset]);

  const insert = useCallback(() => {
    if (stage.kind !== 'ready') return;
    onInsert(stage.markdown);
    setOpen(false);
    reset();
  }, [stage, onInsert, reset]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="截图转 LaTeX（粘贴或拖拽题目截图）"
        className={
          className ??
          'inline-flex h-7 items-center gap-1 rounded border border-slate-200 ' +
            'bg-white px-2 text-xs font-medium text-slate-700 hover:bg-slate-50 ' +
            'dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 ' +
            'dark:hover:bg-slate-800'
        }
      >
        <Camera className="h-3.5 w-3.5" />
        <span>截图转 LaTeX</span>
      </button>

      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) {
              setOpen(false);
              reset();
            }
          }}
        >
          <div
            ref={dialogRef}
            className={
              'flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden ' +
              'rounded-lg border border-slate-200 bg-white shadow-2xl ' +
              'dark:border-slate-700 dark:bg-slate-900'
            }
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-700">
              <h2
                id={titleId}
                className="flex items-center gap-2 text-base font-semibold text-slate-900 dark:text-slate-100"
              >
                <Camera className="h-4 w-4" />
                截图转 LaTeX
              </h2>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  reset();
                }}
                className="rounded p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                aria-label="关闭"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {stage.kind === 'idle' ? (
                <div
                  {...getRootProps()}
                  className={
                    'flex cursor-pointer flex-col items-center justify-center gap-2 ' +
                    'rounded-lg border-2 border-dashed py-12 text-center transition ' +
                    (isDragActive
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-950'
                      : 'border-slate-300 hover:border-slate-400 dark:border-slate-600 dark:hover:border-slate-500')
                  }
                >
                  <input {...getInputProps()} />
                  <ClipboardPaste className="h-8 w-8 text-slate-400" />
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                    粘贴 (⌘V) · 拖拽 · 点击选择题目截图
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    整道题（含中文题干 + 公式 + 子小题）会一并转写
                  </p>
                  <p className="text-xs text-slate-400 dark:text-slate-500">
                    PNG / JPEG / WebP / GIF · 上限 6 MB
                  </p>
                </div>
              ) : null}

              {stage.kind !== 'idle' ? (
                <div className="space-y-4">
                  {stage.previewUrl ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={stage.previewUrl}
                      alt="待识别截图"
                      className="mx-auto max-h-56 rounded border border-slate-200 dark:border-slate-700"
                    />
                  ) : null}

                  {stage.kind === 'loading' ? (
                    <div className="flex items-center justify-center gap-2 py-4 text-sm text-slate-600 dark:text-slate-400">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Gemini 识别中…
                    </div>
                  ) : null}

                  {stage.kind === 'error' ? (
                    <div className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-700 dark:bg-red-950 dark:text-red-300">
                      <p className="font-medium">识别失败</p>
                      <p className="mt-1 font-mono text-xs">{stage.message}</p>
                      <button
                        type="button"
                        onClick={reset}
                        className="mt-2 rounded bg-red-100 px-2 py-1 text-xs font-medium hover:bg-red-200 dark:bg-red-900 dark:hover:bg-red-800"
                      >
                        重新选择
                      </button>
                    </div>
                  ) : null}

                  {stage.kind === 'ready' ? (
                    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                      <div>
                        <p className="mb-1 text-xs font-medium text-slate-600 dark:text-slate-400">
                          识别结果（可编辑）
                        </p>
                        <textarea
                          value={stage.markdown}
                          onChange={(e) =>
                            setStage({ ...stage, markdown: e.target.value })
                          }
                          rows={Math.min(
                            14,
                            Math.max(6, stage.markdown.split('\n').length + 1),
                          )}
                          spellCheck={false}
                          className={
                            'w-full resize-y rounded border border-slate-300 bg-white px-2 py-1 ' +
                            'font-mono text-xs leading-relaxed text-slate-900 outline-none ' +
                            'focus:border-blue-500 focus:ring-1 focus:ring-blue-500 ' +
                            'dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100'
                          }
                        />
                      </div>

                      <div>
                        <p className="mb-1 text-xs font-medium text-slate-600 dark:text-slate-400">
                          实时预览
                        </p>
                        <div className="max-h-[18rem] overflow-y-auto rounded border border-slate-200 bg-slate-50 p-3 text-sm dark:border-slate-700 dark:bg-slate-800">
                          <MathRenderer
                            content={stage.markdown}
                            katexOptions={{ throwOnError: false }}
                          />
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-4 py-3 dark:border-slate-700">
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  reset();
                }}
                className="rounded border border-slate-200 px-3 py-1 text-sm text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                取消
              </button>
              <button
                type="button"
                disabled={stage.kind !== 'ready' || (stage.kind === 'ready' && !stage.markdown.trim())}
                onClick={insert}
                className="rounded bg-blue-600 px-3 py-1 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                插入到光标
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
