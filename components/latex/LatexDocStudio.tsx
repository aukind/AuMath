'use client';

// L2 LaTeX 文档工作室（迷你 Overleaf）：左 Monaco 编辑整篇 LaTeX，右实时 PDF 预览。
// 编译走服务端真实 TeX Live（compileLatexDocument → texlive.net/自托管），支持任意 CTAN 宏包。

import { useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import { ArrowLeft, Download, FileWarning, Loader2, Paperclip, Play, X } from 'lucide-react';
import { compileLatexDocument, type LatexAttachment, type LatexEngine } from '@/app/actions/latex-doc';

const MonacoEditor = dynamic(() => import('@monaco-editor/react').then((m) => m.default), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center bg-[#1e1e1e]">
      <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
    </div>
  ),
});

const DEFAULT_DOC = String.raw`\documentclass[12pt]{ctexart}
\usepackage{amsmath, amssymb}
\usepackage{tikz}
\usepackage{pgfplots}
\pgfplotsset{compat=1.18}

\begin{document}
\section*{圆锥曲线小测}

\textbf{1.} 已知椭圆 $\dfrac{x^2}{4}+y^2=1$，求其离心率。

\[ e=\frac{c}{a}=\frac{\sqrt{a^2-b^2}}{a}=\frac{\sqrt{3}}{2}. \]

\textbf{2.} 函数 $f(x)=x^2$ 的图象：

\begin{center}
\begin{tikzpicture}
  \begin{axis}[axis lines=middle, width=9cm, height=6cm,
               xlabel=$x$, ylabel=$y$, samples=80, domain=-2:2]
    \addplot[blue, thick]{x^2};
  \end{axis}
\end{tikzpicture}
\end{center}
\end{document}`;

function base64ToBlobUrl(b64: string): string {
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  return URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
}

type Attachment = { name: string; text?: string; base64?: string; size: number };

// 这些扩展名当作文本读（.sty/.cls 等）；其余（图片/PDF）按二进制 base64 读。
const TEXT_EXT = /\.(sty|cls|tex|bib|def|clo|cfg|ldf|fd|bbx|cbx|dbx|lbx|tikz)$/i;

function readAttachment(file: File): Promise<Attachment> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    const isText = TEXT_EXT.test(file.name);
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      if (isText) {
        resolve({ name: file.name, text: String(reader.result), size: file.size });
      } else {
        const dataUrl = String(reader.result);
        resolve({ name: file.name, base64: dataUrl.slice(dataUrl.indexOf(',') + 1), size: file.size });
      }
    };
    if (isText) reader.readAsText(file);
    else reader.readAsDataURL(file);
  });
}

const ENGINES: { value: LatexEngine; label: string }[] = [
  { value: 'pdflatex', label: 'pdfLaTeX' },
  { value: 'xelatex', label: 'XeLaTeX（中文/字体）' },
  { value: 'lualatex', label: 'LuaLaTeX' },
];

export default function LatexDocStudio() {
  const router = useRouter();
  const { resolvedTheme } = useTheme();
  const [source, setSource] = useState(DEFAULT_DOC);
  // 中文平台默认 XeLaTeX（配合 ctexart 模板直接出中文）；纯英文文档可切回 pdfLaTeX。
  const [engine, setEngine] = useState<LatexEngine>('xelatex');
  const [compiling, setCompiling] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [errorLog, setErrorLog] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [fullLog, setFullLog] = useState<string | null>(null);
  const [showFullLog, setShowFullLog] = useState(false);
  const pdfUrlRef = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 释放旧 blob URL，避免内存泄漏
  const setPdf = useCallback((url: string | null) => {
    if (pdfUrlRef.current) URL.revokeObjectURL(pdfUrlRef.current);
    pdfUrlRef.current = url;
    setPdfUrl(url);
  }, []);
  useEffect(() => () => { if (pdfUrlRef.current) URL.revokeObjectURL(pdfUrlRef.current); }, []);

  const addFiles = useCallback(async (list: FileList | null) => {
    if (!list || list.length === 0) return;
    const read = await Promise.all(Array.from(list).map(readAttachment));
    setAttachments((prev) => {
      const map = new Map(prev.map((a) => [a.name, a]));
      for (const a of read) map.set(a.name, a); // 同名覆盖
      return [...map.values()];
    });
  }, []);
  const removeAttachment = useCallback((name: string) => {
    setAttachments((prev) => prev.filter((a) => a.name !== name));
  }, []);

  const compile = useCallback(async () => {
    setCompiling(true);
    setErrorLog(null);
    setFullLog(null);
    setShowFullLog(false);
    setInfo(null);
    const t0 = performance.now();
    const payload: LatexAttachment[] = attachments.map(({ name, text, base64 }) => ({ name, text, base64 }));
    const res = await compileLatexDocument(source, engine, payload);
    const secs = ((performance.now() - t0) / 1000).toFixed(1);
    setCompiling(false);
    if (res.success) {
      setPdf(base64ToBlobUrl(res.pdfBase64));
      setInfo(`编译成功 · ${(res.bytes / 1024).toFixed(0)} KB · ${secs}s`);
    } else {
      setErrorLog(res.log);
      setFullLog(res.fullLog ?? null);
    }
  }, [source, engine, attachments, setPdf]);

  // Ctrl/Cmd+S 触发编译
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        if (!compiling) compile();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [compile, compiling]);

  return (
    <div className="flex h-screen flex-col bg-zinc-50 dark:bg-zinc-950">
      {/* 顶栏 */}
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-zinc-200 bg-white px-4 dark:border-zinc-800 dark:bg-zinc-900">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-1.5 text-sm text-zinc-500 transition-colors hover:text-zinc-800 dark:hover:text-zinc-100"
        >
          <ArrowLeft size={15} /> 返回
        </button>
        <span className="text-zinc-200 dark:text-zinc-700">|</span>
        <span className="text-sm font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
          LaTeX 文档工作室
        </span>
        <span className="hidden text-xs text-zinc-400 sm:inline">服务端 TeX Live 编译 · 任意宏包</span>

        <div className="ml-auto flex items-center gap-2">
          {info && <span className="hidden text-xs text-emerald-600 dark:text-emerald-400 md:inline">{info}</span>}
          <select
            value={engine}
            onChange={(e) => setEngine(e.target.value as LatexEngine)}
            className="rounded-lg border border-zinc-200 bg-zinc-50 px-2 py-1.5 text-xs text-zinc-700 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
          >
            {ENGINES.map((e) => (
              <option key={e.value} value={e.value}>{e.label}</option>
            ))}
          </select>
          <a
            href={pdfUrl ?? undefined}
            download="document.pdf"
            aria-disabled={!pdfUrl}
            className={[
              'inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm transition-colors',
              pdfUrl
                ? 'border-zinc-200 text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800'
                : 'pointer-events-none border-zinc-100 text-zinc-300 dark:border-zinc-800 dark:text-zinc-700',
            ].join(' ')}
          >
            <Download size={13} /> 下载 PDF
          </a>
          <button
            onClick={compile}
            disabled={compiling}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700 disabled:opacity-50"
          >
            {compiling ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
            {compiling ? '编译中…' : '编译 (⌘S)'}
          </button>
        </div>
      </header>

      {/* 主体：左编辑 / 右预览 */}
      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-2">
        <div
          className="flex min-h-0 flex-col border-r border-zinc-200 dark:border-zinc-800"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); addFiles(e.dataTransfer.files); }}
        >
          {/* 附件条：上传 .sty/.cls/图片，随文档一起送到服务端编译，解决「缺文件」急停 */}
          <div className="flex flex-wrap items-center gap-1.5 border-b border-zinc-200 bg-zinc-50 px-3 py-1.5 dark:border-zinc-800 dark:bg-zinc-900/50">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-1 rounded-md border border-dashed border-zinc-300 px-2 py-1 text-xs text-zinc-500 transition-colors hover:border-zinc-400 hover:text-zinc-700 dark:border-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
            >
              <Paperclip size={12} /> 附件
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }}
            />
            {attachments.length === 0 ? (
              <span className="text-[11px] text-zinc-400">上传 .sty / .cls / 图片，随文档一起编译（亦可拖拽到此）</span>
            ) : (
              attachments.map((a) => (
                <span
                  key={a.name}
                  title={`${(a.size / 1024).toFixed(0)} KB`}
                  className="inline-flex items-center gap-1 rounded-md bg-zinc-200/70 px-2 py-0.5 text-[11px] text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                >
                  {a.name}
                  <button onClick={() => removeAttachment(a.name)} className="text-zinc-400 transition-colors hover:text-red-500">
                    <X size={11} />
                  </button>
                </span>
              ))
            )}
          </div>
          <div className="min-h-0 flex-1">
            <MonacoEditor
              language="latex"
              theme={resolvedTheme === 'dark' ? 'vs-dark' : 'light'}
              value={source}
              onChange={(v) => setSource(v ?? '')}
              height="100%"
              options={{
                minimap: { enabled: false },
                wordWrap: 'on',
                fontSize: 13,
                lineHeight: 20,
                tabSize: 2,
                scrollBeyondLastLine: false,
                padding: { top: 12 },
              }}
            />
          </div>
        </div>

        <div className="relative min-h-0 bg-zinc-100 dark:bg-zinc-900">
          {compiling && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/60 backdrop-blur-sm dark:bg-zinc-950/60">
              <div className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300">
                <Loader2 className="h-4 w-4 animate-spin" /> 服务端 TeX Live 编译中（首次较慢）…
              </div>
            </div>
          )}

          {errorLog ? (
            <div className="h-full overflow-auto p-4">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-sm font-medium text-red-600 dark:text-red-400">
                  <FileWarning size={15} /> 编译失败
                </span>
                {fullLog && fullLog !== errorLog && (
                  <button
                    onClick={() => setShowFullLog((v) => !v)}
                    className="text-xs text-zinc-500 transition-colors hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-100"
                  >
                    {showFullLog ? '精简日志' : '完整日志'}
                  </button>
                )}
              </div>
              <pre className="whitespace-pre-wrap rounded-lg border border-red-200 bg-red-50 p-3 font-mono text-xs leading-relaxed text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
                {showFullLog && fullLog ? fullLog : errorLog}
              </pre>
            </div>
          ) : pdfUrl ? (
            <iframe src={pdfUrl} title="PDF 预览" className="h-full w-full border-0" />
          ) : (
            <div className="flex h-full items-center justify-center px-6 text-center text-sm text-zinc-400">
              点右上「编译」生成 PDF 预览。<br />支持 amsmath、tikz、pgfplots 等任意 CTAN 宏包。
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
