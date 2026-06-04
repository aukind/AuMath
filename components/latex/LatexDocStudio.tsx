'use client';

// L2 LaTeX 文档工作室（迷你 Overleaf）：左 Monaco 编辑整篇 LaTeX，右实时 PDF 预览。
// 多文档：源码/标题/引擎落 Supabase（迁移 026 latex_documents），多标签页 + 输入自动保存，
//   解决「离开工作室代码丢失」。左侧 TeXStudio 式目录大纲点击跳转。
// 编译仍走服务端真实 TeX Live（compileLatexDocument → texlive.net/自托管），支持任意 CTAN 宏包。

import { useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import {
  ArrowLeft, Check, Download, FileWarning, FolderOpen, Loader2,
  Paperclip, PanelLeftClose, PanelLeftOpen, Play, Plus, Trash2, X,
} from 'lucide-react';
import { compileLatexDocument, type LatexAttachment, type LatexEngine } from '@/app/actions/latex-doc';
import {
  createLatexDocument, deleteLatexDocument, getLatexDocument, updateLatexDocument,
} from '@/app/actions/latex-documents';
import LatexOutline from '@/components/latex/LatexOutline';

// 与 latex-documents.ts（'use server'，不能导出类型）共享的文档类型，故定义在此供其 import type。
export type LatexDocMeta = { id: string; title: string; engine: LatexEngine; updated_at: string };
export type LatexDocFull = LatexDocMeta & { content: string };

const MonacoEditor = dynamic(() => import('@monaco-editor/react').then((m) => m.default), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center bg-[#1e1e1e]">
      <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
    </div>
  ),
});

// 新建文档的空白骨架（无示范内容）：CJK 可用、可直接编译，用户从空白起写。
const DEFAULT_DOC = String.raw`\documentclass[12pt]{ctexart}

\begin{document}

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

// 单篇打开文档的内存缓冲（标签页切换时各自独立；附件不落库，仅会话内保留）。
type Buffer = { content: string; engine: LatexEngine; title: string; attachments: Attachment[]; loaded: boolean };
// 单篇编译产物（切回标签仍在）。
type Preview = { pdfUrl: string | null; errorLog: string | null; fullLog: string | null; info: string | null };
type SaveState = 'idle' | 'saving' | 'saved' | 'error';
type EditorLike = {
  revealLineInCenter: (line: number) => void;
  setPosition: (p: { lineNumber: number; column: number }) => void;
  focus: () => void;
};

const TABS_KEY = 'latex-studio-tabs';

export default function LatexDocStudio({ initialDocs = [] }: { initialDocs?: LatexDocMeta[] }) {
  const router = useRouter();
  const { resolvedTheme } = useTheme();

  const [docs, setDocs] = useState<LatexDocMeta[]>(initialDocs);
  // 默认值只依赖服务端传入的 initialDocs（SSR 确定、首屏与服务端一致，无水合不匹配）；
  // 上次会话的标签由挂载后的 effect 从 localStorage 恢复。
  const [openIds, setOpenIds] = useState<string[]>(() => (initialDocs[0] ? [initialDocs[0].id] : []));
  const [activeId, setActiveId] = useState<string | null>(() => initialDocs[0]?.id ?? null);
  const [buffers, setBuffers] = useState<Record<string, Buffer>>({});
  const [previews, setPreviews] = useState<Record<string, Preview>>({});
  const [compilingIds, setCompilingIds] = useState<string[]>([]);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [showOutline, setShowOutline] = useState(true);
  const [showDocList, setShowDocList] = useState(false);
  const [showFullLog, setShowFullLog] = useState(false);
  const [renaming, setRenaming] = useState<{ id: string; value: string } | null>(null);

  // 让定时器/卸载等延迟回调读到最新值，避免闭包陈旧（在 effect 里同步，勿在渲染期写 ref）。
  const buffersRef = useRef(buffers);
  const previewsRef = useRef(previews);
  const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const editorRef = useRef<EditorLike | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { buffersRef.current = buffers; }, [buffers]);
  useEffect(() => { previewsRef.current = previews; }, [previews]);

  const active = activeId ? buffers[activeId] : undefined;
  const activePreview = activeId ? previews[activeId] : undefined;
  const isCompiling = !!(activeId && compilingIds.includes(activeId));

  // ── 自动保存 ──────────────────────────────────────────────────────────────
  const flushSave = useCallback(async (id: string) => {
    const t = saveTimers.current[id];
    if (t) { clearTimeout(t); delete saveTimers.current[id]; }
    const b = buffersRef.current[id];
    if (!b || !b.loaded) return;
    setSaveState('saving');
    const res = await updateLatexDocument(id, { title: b.title, content: b.content, engine: b.engine });
    if (res.success) {
      setSaveState('saved');
      setDocs((prev) => {
        const now = new Date().toISOString();
        const others = prev.filter((d) => d.id !== id);
        return [{ id, title: b.title, engine: b.engine, updated_at: now }, ...others];
      });
    } else {
      setSaveState('error');
    }
  }, []);

  const scheduleSave = useCallback((id: string) => {
    setSaveState('saving');
    if (saveTimers.current[id]) clearTimeout(saveTimers.current[id]);
    saveTimers.current[id] = setTimeout(() => { void flushSave(id); }, 1500);
  }, [flushSave]);

  const patchBuffer = useCallback((id: string, patch: Partial<Buffer>) => {
    setBuffers((prev) => (prev[id] ? { ...prev, [id]: { ...prev[id], ...patch } } : prev));
  }, []);

  // 挂载后从 localStorage 恢复上次打开/激活的标签（与现有文档求交集）。useState 默认值已兜 SSR，
  // 故无水合不匹配；这里是「读外部存储后同步到 state」的合理一次性用法。
  const restoredRef = useRef(false);
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    let open: string[] = [];
    let act: string | null = null;
    try {
      const raw = localStorage.getItem(TABS_KEY);
      if (raw) {
        const p = JSON.parse(raw);
        open = Array.isArray(p.open) ? p.open : [];
        act = typeof p.active === 'string' ? p.active : null;
      }
    } catch { /* ignore */ }
    const valid = new Set(initialDocs.map((d) => d.id));
    open = open.filter((id) => valid.has(id));
    if (open.length === 0) return; // 没有有效的历史标签 → 保留 useState 默认（最近一篇）
    if (!act || !open.includes(act)) act = open[0] ?? null;
    setOpenIds(open);
    setActiveId(act);
  }, [initialDocs]);

  // 持久化「打开的标签 + 激活项」这种纯 UI 偏好。
  useEffect(() => {
    try { localStorage.setItem(TABS_KEY, JSON.stringify({ open: openIds, active: activeId })); } catch { /* ignore */ }
  }, [openIds, activeId]);

  // 激活标签若未加载正文 → 懒加载。
  useEffect(() => {
    if (!activeId) return;
    const b = buffersRef.current[activeId];
    if (b && b.loaded) return;
    let cancelled = false;
    (async () => {
      const doc = await getLatexDocument(activeId);
      if (cancelled) return;
      if (!doc) {
        setPreviews((prev) => ({
          ...prev,
          [activeId]: { pdfUrl: prev[activeId]?.pdfUrl ?? null, errorLog: '无法加载该文档（可能迁移 026 未运行，或文档已删除）。', fullLog: null, info: null },
        }));
        setBuffers((prev) => ({ ...prev, [activeId]: { content: '', engine: 'xelatex', title: '加载失败', attachments: [], loaded: true } }));
        return;
      }
      setBuffers((prev) => ({
        ...prev,
        [activeId]: { content: doc.content, engine: doc.engine, title: doc.title, attachments: prev[activeId]?.attachments ?? [], loaded: true },
      }));
    })();
    return () => { cancelled = true; };
  }, [activeId]);

  // 应用切后台时把待保存全部落盘；卸载时回收 blob URL 与定时器。
  useEffect(() => {
    const timers = saveTimers.current; // 整个生命周期同一对象引用，提前捕获供 cleanup 用
    const onHide = () => { if (document.visibilityState === 'hidden') Object.keys(timers).forEach((id) => { void flushSave(id); }); };
    document.addEventListener('visibilitychange', onHide);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      Object.values(previewsRef.current).forEach((p) => { if (p.pdfUrl) URL.revokeObjectURL(p.pdfUrl); });
      Object.values(timers).forEach((t) => clearTimeout(t));
    };
  }, [flushSave]);

  // ── 标签 / 文档操作 ───────────────────────────────────────────────────────
  const openDoc = useCallback((id: string) => {
    setActiveId((cur) => { if (cur && cur !== id) void flushSave(cur); return id; });
    setOpenIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
    setShowFullLog(false);
    setShowDocList(false);
  }, [flushSave]);

  const closeTab = useCallback((id: string) => {
    void flushSave(id);
    setOpenIds((prev) => {
      const next = prev.filter((x) => x !== id);
      setActiveId((cur) => (cur === id ? (next[next.length - 1] ?? null) : cur));
      return next;
    });
    setPreviews((prev) => {
      const p = prev[id];
      if (!p) return prev;
      if (p.pdfUrl) URL.revokeObjectURL(p.pdfUrl);
      const rest = { ...prev };
      delete rest[id];
      return rest;
    });
  }, [flushSave]);

  const createDoc = useCallback(async () => {
    if (activeId) void flushSave(activeId);
    const res = await createLatexDocument({ content: DEFAULT_DOC });
    if (!res.success) { setSaveState('error'); alert(res.error); return; }
    const doc = res.doc;
    setDocs((prev) => [{ id: doc.id, title: doc.title, engine: doc.engine, updated_at: doc.updated_at }, ...prev]);
    setBuffers((prev) => ({ ...prev, [doc.id]: { content: doc.content, engine: doc.engine, title: doc.title, attachments: [], loaded: true } }));
    setOpenIds((prev) => [...prev, doc.id]);
    setActiveId(doc.id);
    setShowFullLog(false);
    setShowDocList(false);
  }, [activeId, flushSave]);

  const deleteDoc = useCallback(async (id: string) => {
    if (!confirm('删除这篇文档？此操作不可撤销。')) return;
    const res = await deleteLatexDocument(id);
    if (!res.success) { alert(res.error); return; }
    setDocs((prev) => prev.filter((d) => d.id !== id));
    setOpenIds((prev) => {
      const next = prev.filter((x) => x !== id);
      setActiveId((cur) => (cur === id ? (next[next.length - 1] ?? null) : cur));
      return next;
    });
    setBuffers((prev) => { if (!prev[id]) return prev; const rest = { ...prev }; delete rest[id]; return rest; });
    setPreviews((prev) => {
      const p = prev[id];
      if (!p) return prev;
      if (p.pdfUrl) URL.revokeObjectURL(p.pdfUrl);
      const rest = { ...prev };
      delete rest[id];
      return rest;
    });
  }, []);

  const commitRename = useCallback(async () => {
    if (!renaming) return;
    const { id, value } = renaming;
    const title = value.trim() || '未命名文档';
    setRenaming(null);
    setDocs((prev) => prev.map((d) => (d.id === id ? { ...d, title } : d)));
    patchBuffer(id, { title });
    setSaveState('saving');
    const res = await updateLatexDocument(id, { title });
    setSaveState(res.success ? 'saved' : 'error');
  }, [renaming, patchBuffer]);

  // ── 编辑 / 编译 ───────────────────────────────────────────────────────────
  const onSourceChange = useCallback((v: string | undefined) => {
    if (!activeId) return;
    patchBuffer(activeId, { content: v ?? '' });
    scheduleSave(activeId);
  }, [activeId, patchBuffer, scheduleSave]);

  const onEngineChange = useCallback((engine: LatexEngine) => {
    if (!activeId) return;
    patchBuffer(activeId, { engine });
    scheduleSave(activeId);
  }, [activeId, patchBuffer, scheduleSave]);

  const addFiles = useCallback(async (list: FileList | null) => {
    if (!activeId || !list || list.length === 0) return;
    const read = await Promise.all(Array.from(list).map(readAttachment));
    setBuffers((prev) => {
      const b = prev[activeId];
      if (!b) return prev;
      const map = new Map(b.attachments.map((a) => [a.name, a]));
      for (const a of read) map.set(a.name, a);
      return { ...prev, [activeId]: { ...b, attachments: [...map.values()] } };
    });
  }, [activeId]);

  const removeAttachment = useCallback((name: string) => {
    if (!activeId) return;
    setBuffers((prev) => {
      const b = prev[activeId];
      if (!b) return prev;
      return { ...prev, [activeId]: { ...b, attachments: b.attachments.filter((a) => a.name !== name) } };
    });
  }, [activeId]);

  const compile = useCallback(async () => {
    const id = activeId;
    if (!id) return;
    const b = buffersRef.current[id];
    if (!b || !b.loaded) return;
    await flushSave(id);
    setCompilingIds((p) => (p.includes(id) ? p : [...p, id]));
    setPreviews((prev) => ({ ...prev, [id]: { pdfUrl: prev[id]?.pdfUrl ?? null, errorLog: null, fullLog: null, info: null } }));
    const payload: LatexAttachment[] = b.attachments.map(({ name, text, base64 }) => ({ name, text, base64 }));
    const t0 = performance.now();
    const res = await compileLatexDocument(b.content, b.engine, payload);
    const secs = ((performance.now() - t0) / 1000).toFixed(1);
    setCompilingIds((p) => p.filter((x) => x !== id));
    setPreviews((prev) => {
      const old = prev[id];
      if (res.success) {
        if (old?.pdfUrl) URL.revokeObjectURL(old.pdfUrl);
        return { ...prev, [id]: { pdfUrl: base64ToBlobUrl(res.pdfBase64), errorLog: null, fullLog: null, info: `编译成功 · ${(res.bytes / 1024).toFixed(0)} KB · ${secs}s` } };
      }
      return { ...prev, [id]: { pdfUrl: old?.pdfUrl ?? null, errorLog: res.log, fullLog: res.fullLog ?? null, info: null } };
    });
  }, [activeId, flushSave]);

  // Ctrl/Cmd+S 触发编译
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        if (!isCompiling) void compile();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [compile, isCompiling]);

  const jumpToLine = useCallback((line: number) => {
    const ed = editorRef.current;
    if (!ed) return;
    ed.revealLineInCenter(line);
    ed.setPosition({ lineNumber: line, column: 1 });
    ed.focus();
  }, []);

  const saveLabel =
    saveState === 'saving' ? '保存中…' : saveState === 'saved' ? '已保存' : saveState === 'error' ? '保存失败' : '';

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
        <span className="text-sm font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">LaTeX 文档工作室</span>
        <button
          onClick={() => setShowOutline((v) => !v)}
          title={showOutline ? '隐藏目录' : '显示目录'}
          className="ml-1 hidden text-zinc-400 transition-colors hover:text-zinc-700 sm:inline-flex dark:hover:text-zinc-200"
        >
          {showOutline ? <PanelLeftClose size={16} /> : <PanelLeftOpen size={16} />}
        </button>

        <div className="ml-auto flex items-center gap-2">
          {saveLabel && (
            <span className={`hidden items-center gap-1 text-xs md:inline-flex ${saveState === 'error' ? 'text-red-500' : 'text-zinc-400'}`}>
              {saveState === 'saving' ? <Loader2 size={12} className="animate-spin" /> : saveState === 'saved' ? <Check size={12} /> : null}
              {saveLabel}
            </span>
          )}
          {activePreview?.info && <span className="hidden text-xs text-emerald-600 dark:text-emerald-400 md:inline">{activePreview.info}</span>}
          <select
            value={active?.engine ?? 'xelatex'}
            onChange={(e) => onEngineChange(e.target.value as LatexEngine)}
            disabled={!active}
            className="rounded-lg border border-zinc-200 bg-zinc-50 px-2 py-1.5 text-xs text-zinc-700 focus:outline-none disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
          >
            {ENGINES.map((e) => (
              <option key={e.value} value={e.value}>{e.label}</option>
            ))}
          </select>
          <a
            href={activePreview?.pdfUrl ?? undefined}
            download="document.pdf"
            aria-disabled={!activePreview?.pdfUrl}
            className={[
              'inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm transition-colors',
              activePreview?.pdfUrl
                ? 'border-zinc-200 text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800'
                : 'pointer-events-none border-zinc-100 text-zinc-300 dark:border-zinc-800 dark:text-zinc-700',
            ].join(' ')}
          >
            <Download size={13} /> 下载 PDF
          </a>
          <button
            onClick={compile}
            disabled={isCompiling || !active}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700 disabled:opacity-50"
          >
            {isCompiling ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
            {isCompiling ? '编译中…' : '编译 (⌘S)'}
          </button>
        </div>
      </header>

      {/* 标签页栏 */}
      <div className="relative flex h-9 shrink-0 items-stretch border-b border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900/60">
        {/* 文档库下拉 */}
        <button
          onClick={() => setShowDocList((v) => !v)}
          title="所有文档"
          className="flex items-center gap-1 border-r border-zinc-200 px-3 text-xs text-zinc-500 transition-colors hover:bg-zinc-200/60 dark:border-zinc-800 dark:hover:bg-zinc-800"
        >
          <FolderOpen size={14} />
        </button>
        {showDocList && (
          <div className="absolute left-0 top-9 z-20 max-h-80 w-72 overflow-auto rounded-b-lg border border-zinc-200 bg-white py-1 shadow-lg dark:border-zinc-800 dark:bg-zinc-900">
            {docs.length === 0 ? (
              <p className="px-3 py-3 text-xs text-zinc-400">还没有文档，点 + 新建一篇。</p>
            ) : (
              docs.map((d) => (
                <div key={d.id} className="group flex items-center gap-1 px-1">
                  <button
                    onClick={() => openDoc(d.id)}
                    className="flex-1 truncate rounded px-2 py-1.5 text-left text-xs text-zinc-700 transition-colors hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800"
                  >
                    {d.title}
                  </button>
                  <button
                    onClick={() => deleteDoc(d.id)}
                    title="删除"
                    className="rounded p-1 text-zinc-300 opacity-0 transition-opacity hover:text-red-500 group-hover:opacity-100"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))
            )}
          </div>
        )}

        <div className="flex min-w-0 flex-1 items-stretch overflow-x-auto">
          {openIds.map((id) => {
            const meta = docs.find((d) => d.id === id);
            const title = buffers[id]?.title ?? meta?.title ?? '未命名文档';
            const isActive = id === activeId;
            return (
              <div
                key={id}
                onClick={() => openDoc(id)}
                onDoubleClick={() => setRenaming({ id, value: title })}
                className={[
                  'flex cursor-pointer items-center gap-1.5 border-r border-zinc-200 px-3 text-xs dark:border-zinc-800',
                  isActive
                    ? 'bg-white text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100'
                    : 'text-zinc-500 hover:bg-zinc-200/50 dark:hover:bg-zinc-800',
                ].join(' ')}
              >
                {renaming?.id === id ? (
                  <input
                    autoFocus
                    value={renaming.value}
                    onChange={(e) => setRenaming({ id, value: e.target.value })}
                    onBlur={commitRename}
                    onKeyDown={(e) => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setRenaming(null); }}
                    onClick={(e) => e.stopPropagation()}
                    className="w-28 rounded border border-blue-400 bg-transparent px-1 py-0.5 text-xs focus:outline-none"
                  />
                ) : (
                  <span className="max-w-[12rem] truncate">{title}</span>
                )}
                <button
                  onClick={(e) => { e.stopPropagation(); closeTab(id); }}
                  className="rounded p-0.5 text-zinc-400 transition-colors hover:bg-zinc-300/60 hover:text-zinc-700 dark:hover:bg-zinc-700"
                >
                  <X size={12} />
                </button>
              </div>
            );
          })}
          <button
            onClick={createDoc}
            title="新建文档"
            className="flex items-center px-3 text-zinc-400 transition-colors hover:bg-zinc-200/60 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
          >
            <Plus size={15} />
          </button>
        </div>
      </div>

      {/* 主体：目录 | 编辑 | 预览 */}
      <div className="flex min-h-0 flex-1">
        {showOutline && (
          <div className="hidden w-56 shrink-0 border-r border-zinc-200 sm:block dark:border-zinc-800">
            <LatexOutline source={active?.content ?? ''} onJump={jumpToLine} />
          </div>
        )}

        {!activeId ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center text-sm text-zinc-400">
            <p>还没有打开的文档。</p>
            <button
              onClick={createDoc}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700"
            >
              <Plus size={14} /> 新建文档
            </button>
          </div>
        ) : (
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
                {(active?.attachments.length ?? 0) === 0 ? (
                  <span className="text-[11px] text-zinc-400">上传 .sty / .cls / 图片，随文档一起编译（亦可拖拽到此）</span>
                ) : (
                  active?.attachments.map((a) => (
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
              <div className="relative min-h-0 flex-1">
                {!active?.loaded && (
                  <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#1e1e1e]">
                    <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
                  </div>
                )}
                <MonacoEditor
                  language="latex"
                  theme={resolvedTheme === 'dark' ? 'vs-dark' : 'light'}
                  value={active?.content ?? ''}
                  onChange={onSourceChange}
                  onMount={(ed) => { editorRef.current = ed as unknown as EditorLike; }}
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
              {isCompiling && (
                <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/60 backdrop-blur-sm dark:bg-zinc-950/60">
                  <div className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300">
                    <Loader2 className="h-4 w-4 animate-spin" /> 服务端 TeX Live 编译中（首次较慢）…
                  </div>
                </div>
              )}

              {activePreview?.errorLog ? (
                <div className="h-full overflow-auto p-4">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 text-sm font-medium text-red-600 dark:text-red-400">
                      <FileWarning size={15} /> 编译失败
                    </span>
                    {activePreview.fullLog && activePreview.fullLog !== activePreview.errorLog && (
                      <button
                        onClick={() => setShowFullLog((v) => !v)}
                        className="text-xs text-zinc-500 transition-colors hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-100"
                      >
                        {showFullLog ? '精简日志' : '完整日志'}
                      </button>
                    )}
                  </div>
                  <pre className="whitespace-pre-wrap rounded-lg border border-red-200 bg-red-50 p-3 font-mono text-xs leading-relaxed text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
                    {showFullLog && activePreview.fullLog ? activePreview.fullLog : activePreview.errorLog}
                  </pre>
                </div>
              ) : activePreview?.pdfUrl ? (
                <iframe src={activePreview.pdfUrl} title="PDF 预览" className="h-full w-full border-0" />
              ) : (
                <div className="flex h-full items-center justify-center px-6 text-center text-sm text-zinc-400">
                  点右上「编译」生成 PDF 预览。<br />支持 amsmath、tikz、pgfplots 等任意 CTAN 宏包。
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
