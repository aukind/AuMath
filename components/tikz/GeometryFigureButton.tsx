'use client';

// 录题时插入几何图：粘贴/拖入整页截图 → 自动检测候选（或手动框选）→ Pipeline B
// 还原为矢量 → 微调标签 → 「插入」把内联 SVG 塞到 Monaco 光标处（= 当前正编辑的那道题）。
// 与 ScreenshotToLatexButton 同构（截图转 LaTeX 那个），共用 insertLatexAtCursor。

import { useCallback, useEffect, useId, useState } from 'react';
import { useDropzone, type FileRejection } from 'react-dropzone';
import { ClipboardPaste, Loader2, Shapes, X } from 'lucide-react';

import { processPipeline } from '@/app/actions/cv-tikz';
import AutoDetectStrip from '@/components/tikz/AutoDetectStrip';
import OverlaySvgPreview from '@/components/tikz/OverlaySvgPreview';
import RegionCropper from '@/components/tikz/RegionCropper';
import { bakeLabelsIntoSvg, isLowConfidence } from '@/lib/tikz/overpic';
import type { GeoLabel, ProcessResult } from '@/types/tikz';

const ACCEPT = {
  'image/png': ['.png'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/webp': ['.webp'],
};

async function fileToBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

function parseLabels(text: string): GeoLabel[] {
  const data = JSON.parse(text);
  if (!Array.isArray(data)) throw new Error('应为数组');
  return data.map((d, i) => {
    if (typeof d?.text !== 'string') throw new Error(`第 ${i} 项缺少 text`);
    const x = Number(d.x_percent);
    const y = Number(d.y_percent);
    if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error(`第 ${i} 项坐标非法`);
    return { text: d.text, x_percent: x, y_percent: y, confidence: d.confidence == null ? undefined : Number(d.confidence) };
  });
}

type Stage =
  | { kind: 'idle' }
  | { kind: 'select'; src: string }
  | { kind: 'processing'; src: string }
  | { kind: 'refine'; src: string; result: ProcessResult; labels: GeoLabel[]; labelsText: string; parseError: string | null }
  | { kind: 'error'; message: string };

export default function GeometryFigureButton({
  onInsert,
  className,
}: {
  onInsert: (snippet: string) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [stage, setStage] = useState<Stage>({ kind: 'idle' });
  const titleId = useId();
  const lowConf = stage.kind === 'refine' ? stage.labels.filter(isLowConfidence).length : 0;

  const reset = useCallback(() => setStage({ kind: 'idle' }), []);

  const handleFile = useCallback(async (file: File) => {
    const b64 = await fileToBase64(file);
    setStage({ kind: 'select', src: `data:${file.type};base64,${b64}` });
  }, []);

  const handlePick = useCallback(async (cropBase64: string, src: string) => {
    setStage({ kind: 'processing', src });
    const res = await processPipeline(cropBase64, 'B', 'image/png');
    if (!res.success) {
      setStage({ kind: 'error', message: res.error });
      return;
    }
    setStage({
      kind: 'refine',
      src,
      result: res.result,
      labels: res.result.labels,
      labelsText: JSON.stringify(res.result.labels, null, 2),
      parseError: null,
    });
  }, []);

  const onDrop = useCallback(
    (accepted: File[], rejections: FileRejection[]) => {
      if (rejections.length) {
        setStage({ kind: 'error', message: rejections[0]?.errors[0]?.message ?? '不支持的文件类型' });
        return;
      }
      if (accepted[0]) handleFile(accepted[0]);
    },
    [handleFile],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPT,
    multiple: false,
    noClick: stage.kind !== 'idle',
  });

  // 粘贴图片（仅弹窗开启时监听）
  useEffect(() => {
    if (!open) return undefined;
    const onPaste = (e: ClipboardEvent) => {
      for (const item of e.clipboardData?.items ?? []) {
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

  const onLabelsChange = (text: string) => {
    setStage((s) => {
      if (s.kind !== 'refine') return s;
      try {
        return { ...s, labelsText: text, labels: parseLabels(text), parseError: null };
      } catch (e) {
        return { ...s, labelsText: text, parseError: e instanceof Error ? e.message : '解析失败' };
      }
    });
  };

  const insert = useCallback(() => {
    if (stage.kind !== 'refine' || !stage.result.svg) return;
    const inlineSvg = bakeLabelsIntoSvg(stage.result.svg, stage.labels);
    onInsert(`\n\n${inlineSvg}\n\n`); // 前后留空行，让 MathRenderer 当块级 SVG 渲染
    setOpen(false);
    reset();
  }, [stage, onInsert, reset]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="插入几何图（粘贴/拖入整页，自动检测或手动框选）"
        className={
          className ??
          'inline-flex h-7 items-center gap-1 rounded border border-slate-200 bg-white px-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800'
        }
      >
        <Shapes className="h-3.5 w-3.5" />
        <span>插入几何图</span>
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
          <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-700">
              <h2 id={titleId} className="flex items-center gap-2 text-base font-semibold text-slate-900 dark:text-slate-100">
                <Shapes className="h-4 w-4" /> 插入几何图
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
              {stage.kind === 'idle' && (
                <div
                  {...getRootProps()}
                  className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed py-12 text-center transition ${
                    isDragActive ? 'border-blue-500 bg-blue-50 dark:bg-blue-950' : 'border-slate-300 hover:border-slate-400 dark:border-slate-600'
                  }`}
                >
                  <input {...getInputProps()} />
                  <ClipboardPaste className="h-8 w-8 text-slate-400" />
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-200">粘贴 (⌘V) · 拖拽 · 点击选择整页/题图</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">自动检测几何图，或手动框选；PNG / JPEG / WebP</p>
                </div>
              )}

              {stage.kind === 'select' && (
                <div className="space-y-4">
                  <AutoDetectStrip
                    key={stage.src}
                    imageBase64={stage.src.split(',')[1]}
                    onPick={(crop) => handlePick(crop, stage.src)}
                  />
                  <div className="text-xs font-medium text-slate-500">或手动框选：</div>
                  <RegionCropper src={stage.src} onCropped={(crop) => handlePick(crop, stage.src)} />
                </div>
              )}

              {stage.kind === 'processing' && (
                <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-600 dark:text-slate-400">
                  <Loader2 className="h-4 w-4 animate-spin" /> 还原矢量中…
                </div>
              )}

              {stage.kind === 'error' && (
                <div className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-700 dark:bg-red-950 dark:text-red-300">
                  <p className="font-medium">处理失败</p>
                  <p className="mt-1 font-mono text-xs">{stage.message}</p>
                  <button type="button" onClick={reset} className="mt-2 rounded bg-red-100 px-2 py-1 text-xs font-medium hover:bg-red-200 dark:bg-red-900">
                    重新选择
                  </button>
                </div>
              )}

              {stage.kind === 'refine' && stage.result.svg && (
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-slate-600 dark:text-slate-400">
                      预览{lowConf > 0 ? ` · ⚠ ${lowConf} 个低置信度（高亮）需复核` : ''}
                    </p>
                    <div className="rounded border border-slate-200 p-2 dark:border-slate-700">
                      <OverlaySvgPreview svg={stage.result.svg} labels={stage.labels} />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-slate-600 dark:text-slate-400">
                      标签 JSON（改文字/坐标，预览即时更新）
                      {stage.parseError && <span className="ml-2 text-red-600">JSON 错误</span>}
                    </p>
                    <textarea
                      value={stage.labelsText}
                      onChange={(e) => onLabelsChange(e.target.value)}
                      rows={12}
                      spellCheck={false}
                      className="w-full resize-y rounded border border-slate-300 bg-white px-2 py-1 font-mono text-xs leading-relaxed text-slate-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
                    />
                  </div>
                </div>
              )}
            </div>

            {stage.kind === 'refine' && (
              <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-4 py-3 dark:border-slate-700">
                <button type="button" onClick={reset} className="rounded px-3 py-1.5 text-sm text-slate-500 hover:text-slate-800 dark:hover:text-slate-200">
                  重新选择
                </button>
                <button
                  type="button"
                  onClick={insert}
                  disabled={!!stage.parseError}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-1.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  <Shapes className="h-4 w-4" /> 插入到光标处
                </button>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
