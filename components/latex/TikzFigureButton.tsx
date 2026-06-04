'use client';

// 录题作图工作台：在录题页写 TikZ 源码 → 服务端 node-tikzjax 编译成自包含 SVG →
// 实时预览 → 上传为 .svg 后把 ![图形](url) 插入题面光标处。无需 AI、无需管理员密钥。
// 仿 ScreenshotToLatexButton 的弹窗形态，复用 Monaco（TikzCodeEditor）。

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Loader2, Shapes, Sparkles, X } from 'lucide-react';
import TikzCodeEditor from '@/components/tikz/TikzCodeEditor';
import { compileTikzAction, uploadTikzFigureAction } from '@/app/actions/tikz';
import { screenshotToTikz } from '@/app/actions/screenshot-tikz';

interface TikzFigureButtonProps {
  /** 把 Markdown 片段（![图形](url)）插入到当前光标处。 */
  onInsert: (snippet: string) => void;
  className?: string;
}

const DEFAULT_SOURCE = String.raw`\begin{tikzpicture}[scale=1]
  \draw[->] (-3,0) -- (3,0) node[right] {$x$};
  \draw[->] (0,-1) -- (0,4) node[above] {$y$};
  \draw[domain=-1.8:1.8, smooth, variable=\x, blue, thick]
    plot ({\x}, {\x*\x}) node[right] {$y=x^2$};
  \node[below left] at (0,0) {$O$};
\end{tikzpicture}`;

// 常用宏包预设（勾选后以 \usepackage{} 注入导言区）。
const PACKAGE_PRESETS: { key: string; label: string }[] = [
  { key: 'pgfplots', label: 'pgfplots 函数/坐标图' },
  { key: 'circuitikz', label: 'circuitikz 电路' },
  { key: 'chemfig', label: 'chemfig 化学式' },
  { key: 'tikz-cd', label: 'tikz-cd 交换图' },
  { key: 'tikz-3dplot', label: 'tikz-3dplot 三维' },
  { key: 'amsmath', label: 'amsmath 公式' },
];

function svgToDataUrl(svg: string): string {
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/** 分块 base64，避免 String.fromCharCode(...大数组) 爆栈（多 MB 图）。 */
async function fileToBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

export default function TikzFigureButton({ onInsert, className }: TikzFigureButtonProps) {
  const [open, setOpen] = useState(false);
  const [source, setSource] = useState(DEFAULT_SOURCE);
  const [pkgs, setPkgs] = useState<Record<string, boolean>>({});
  const [libs, setLibs] = useState('');
  const [compiling, setCompiling] = useState(false);
  const [inserting, setInserting] = useState(false);
  const [recognizing, setRecognizing] = useState(false);
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const titleId = useId();

  // 截图转 TikZ：把图发给服务端（HF DeTikZify）→ 取回 tikzpicture + 用到的库，填入编辑器。
  const handleImage = useCallback(async (file: File | null | undefined) => {
    if (!file) return;
    setRecognizing(true);
    setError(null);
    try {
      const base64 = await fileToBase64(file);
      const res = await screenshotToTikz(base64, file.type || 'image/png');
      if (res.success) {
        setSource(res.tikz);
        setSvg(null); // 清掉旧预览，提示用户重新「编译预览」
        if (res.libraries) {
          setLibs((prev) => {
            const merged = new Set(
              [...prev.split(','), ...res.libraries.split(',')].map((s) => s.trim()).filter(Boolean),
            );
            return [...merged].join(',');
          });
        }
      } else {
        setError(res.error);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRecognizing(false);
    }
  }, []);

  const togglePkg = useCallback((key: string) => {
    setPkgs((p) => ({ ...p, [key]: !p[key] }));
  }, []);

  const compile = useCallback(async () => {
    setCompiling(true);
    setError(null);
    const texPackages: Record<string, string> = {};
    for (const [k, on] of Object.entries(pkgs)) if (on) texPackages[k] = '';
    const res = await compileTikzAction(source, {
      texPackages,
      tikzLibraries: libs.trim(),
    });
    setCompiling(false);
    if (res.success) {
      setSvg(res.svg);
    } else {
      setSvg(null);
      setError(res.error);
    }
  }, [source, pkgs, libs]);

  const insert = useCallback(async () => {
    if (!svg) return;
    setInserting(true);
    setError(null);
    const res = await uploadTikzFigureAction(svg);
    setInserting(false);
    if (res.success) {
      onInsert(`\n\n![图形](${res.url})\n\n`);
      setOpen(false);
    } else {
      setError(res.error);
    }
  }, [svg, onInsert]);

  // Esc 关闭
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  // 粘贴截图（⌘V）即转 TikZ —— 用 document 的**捕获阶段**监听，先于 Monaco 编辑器吞掉粘贴
  // （Monaco 打开即抢焦点，若用 window/冒泡监听会被它先截走 → 粘贴失灵）。
  useEffect(() => {
    if (!open) return undefined;
    const onPaste = (e: ClipboardEvent) => {
      for (const item of e.clipboardData?.items ?? []) {
        if (item.kind === 'file' && item.type.startsWith('image/')) {
          const f = item.getAsFile();
          if (f) {
            e.preventDefault();
            e.stopPropagation();
            handleImage(f);
            return;
          }
        }
      }
    };
    document.addEventListener('paste', onPaste, true);
    return () => document.removeEventListener('paste', onPaste, true);
  }, [open, handleImage]);

  // 拖拽图片到工作台即转 TikZ。
  const [dragOver, setDragOver] = useState(false);
  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const f = Array.from(e.dataTransfer.files).find((x) => x.type.startsWith('image/'));
      if (f) handleImage(f);
    },
    [handleImage],
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="用 TikZ 画图并插入题面（无需 AI）"
        className={
          className ??
          'inline-flex h-7 items-center gap-1 rounded border border-slate-200 ' +
            'bg-white px-2 text-xs font-medium text-slate-700 hover:bg-slate-50 ' +
            'dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800'
        }
      >
        <Shapes className="h-3.5 w-3.5" />
        <span>TikZ 作图</span>
      </button>

      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div
            className="relative flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"
            onDragOver={(e) => {
              if (Array.from(e.dataTransfer.types).includes('Files')) {
                e.preventDefault();
                setDragOver(true);
              }
            }}
            onDragLeave={(e) => {
              if (e.target === e.currentTarget) setDragOver(false);
            }}
            onDrop={onDrop}
          >
            {dragOver ? (
              <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-lg border-2 border-dashed border-violet-400 bg-violet-50/80 text-sm font-medium text-violet-700 dark:bg-violet-950/70 dark:text-violet-300">
                松开图片即转 TikZ
              </div>
            ) : null}
            {/* 标题栏 */}
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-700">
              <h2
                id={titleId}
                className="flex items-center gap-2 text-base font-semibold text-slate-900 dark:text-slate-100"
              >
                <Shapes className="h-4 w-4" />
                TikZ 作图工作台
              </h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                aria-label="关闭"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* 宏包/库工具条 */}
            <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-4 py-2 dark:border-slate-700">
              {/* 截图转 TikZ（上传/粘贴一张图，AI 自动转成 TikZ 源码） */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={recognizing}
                title="上传或粘贴（⌘V）一张图，AI 自动转成 TikZ"
                className="inline-flex items-center gap-1 rounded-full border border-violet-300 bg-violet-50 px-2.5 py-1 text-xs font-medium text-violet-700 transition hover:bg-violet-100 disabled:opacity-50 dark:border-violet-700 dark:bg-violet-950/40 dark:text-violet-300"
              >
                {recognizing ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5" />
                )}
                截图转 TikZ
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(e) => {
                  handleImage(e.target.files?.[0]);
                  e.target.value = '';
                }}
              />
              <span className="mx-0.5 h-4 w-px bg-slate-200 dark:bg-slate-700" />
              {PACKAGE_PRESETS.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => togglePkg(p.key)}
                  className={[
                    'rounded-full border px-2.5 py-1 text-xs font-medium transition',
                    pkgs[p.key]
                      ? 'border-blue-600 bg-blue-600 text-white'
                      : 'border-slate-200 text-slate-600 hover:border-blue-300 dark:border-slate-700 dark:text-slate-300',
                  ].join(' ')}
                >
                  {p.label}
                </button>
              ))}
              <input
                type="text"
                value={libs}
                onChange={(e) => setLibs(e.target.value)}
                placeholder="tikz 库，逗号分隔：arrows.meta,calc"
                className="ml-auto w-56 rounded border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-700 outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              />
            </div>

            {/* 主体：左编辑 / 右预览 */}
            <div className="grid flex-1 grid-cols-1 gap-0 overflow-hidden lg:grid-cols-2">
              <div className="flex flex-col border-r border-slate-200 dark:border-slate-700">
                <div className="px-3 py-1.5 text-[0.6875rem] uppercase tracking-widest text-slate-400">
                  TikZ 源码（只写 \begin{'{tikzpicture}'} … 即可，会自动包文档）
                </div>
                <div className="min-h-[320px] flex-1">
                  <TikzCodeEditor value={source} onChange={setSource} language="latex" height={360} />
                </div>
              </div>

              <div className="flex flex-col">
                <div className="px-3 py-1.5 text-[0.6875rem] uppercase tracking-widest text-slate-400">
                  预览
                </div>
                <div className="flex-1 overflow-auto bg-slate-50 p-4 dark:bg-slate-800/40">
                  {recognizing ? (
                    <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-xs text-violet-500">
                      <Loader2 className="h-5 w-5 animate-spin" />
                      <p>AI 识别中（DeTikZify，约 30–60 秒）…</p>
                      <p className="text-slate-400">识别完成后会把 TikZ 填入左侧编辑器，再点「编译预览」</p>
                    </div>
                  ) : error ? (
                    <div className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-700 dark:bg-red-950 dark:text-red-300">
                      <p className="font-medium">出错了</p>
                      <p className="mt-1 whitespace-pre-wrap font-mono text-xs">{error}</p>
                    </div>
                  ) : svg ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={svgToDataUrl(svg)}
                      alt="TikZ 预览"
                      className="mx-auto max-h-[50vh] max-w-full rounded bg-white p-2"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-center text-xs text-slate-400">
                      点「编译预览」生成图形
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* 底栏 */}
            <div className="flex items-center justify-between gap-2 border-t border-slate-200 px-4 py-3 dark:border-slate-700">
              <p className="text-xs text-slate-400">
                图形将上传为 SVG，并以 <code>![图形](url)</code> 插入题面。
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={compile}
                  disabled={compiling || !source.trim()}
                  className="inline-flex items-center gap-1.5 rounded border border-slate-200 px-3 py-1 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  {compiling ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                  编译预览
                </button>
                <button
                  type="button"
                  onClick={insert}
                  disabled={!svg || inserting}
                  className="inline-flex items-center gap-1.5 rounded bg-blue-600 px-3 py-1 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {inserting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                  插入到题面
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
