'use client';

// 沉浸式 PDF 阅读器（react-pdf / PDF.js）。前身 PdfViewerModal —— 阅读内核完整保留，
// 仅把 vaul 抽屉外壳换成 Framer Motion 的 layoutId 共享转场 + 玻璃拟态环境背景。
//
// ⚠️ 必须由父级 next/dynamic(..., { ssr:false }) 懒载 —— react-pdf 触碰 DOMMatrix/Canvas，SSR 会崩。
//
// 转场：卡片封面（layoutId=lib-cover-${id}）平滑放大延展为全屏面板；关闭折回原卡片位。
//   · 防 morph 卡顿：展开动画完成前只显示轻量封面 Hero，完成后才挂载 react-pdf <Document>。
//   · prefers-reduced-motion：直接淡入，跳过 3D/放大缓动。
//
// 能力：左侧可折叠侧栏(目录树 / 缩略图、点击跳页)；主区 @tanstack/react-virtual 虚拟化，
//   几百页只挂载视口内 <Page>，内存恒定；disableAutoFetch + Range 分块「秒开」。
//
// ⚠️ 依赖 Supabase Storage `library-pdfs` 已开 CORS 并暴露 Range/Content-Range/Accept-Ranges/Content-Length，
//    否则大文件首屏会退化为整文件下载、移动端易 OOM（见 018_library_module.sql 头部说明）。

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Document, Page } from 'react-pdf';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  X,
  ChevronUp,
  ChevronDown,
  Download,
  Loader2,
  FileWarning,
  PanelLeft,
  List,
  Images,
  Bookmark,
} from 'lucide-react';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
// 仅导入 PDF_OPTIONS：该模块的 import 副作用会设置 pdfjs worker（版本对齐）。
import { PDF_OPTIONS } from '@/lib/library/pdf-worker';
import { recordView, recordDownload } from '@/app/actions/library';
import CoverArt from '@/components/library/CoverArt';
import { coverLayoutId } from '@/components/library/shared';
import type { LibraryItem } from '@/types/library';

const PAGE_GAP = 12;
const A4_RATIO = 1.414;
const THUMB_W = 130;

interface OutlineNode {
  title: string;
  dest: string | unknown[] | null;
  items?: OutlineNode[];
}

interface Props {
  item: LibraryItem;
  onClose: () => void;
  /** 资源大厅传入：收藏到个人知识库。知识库自身复用本阅读器时不传，故不显示书签按钮。 */
  saved?: boolean;
  onToggleSave?: () => void;
}

export default function ImmersiveReader({ item, onClose, saved, onToggleSave }: Props) {
  const reduce = useReducedMotion();
  const [open, setOpen] = useState(true); // AnimatePresence 控制：false → 播放退场后 onExitComplete 卸载
  const [ready, setReady] = useState(false); // 展开动画结束才挂载 <Document>
  const requestClose = useCallback(() => setOpen(false), []);

  const scrollRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdfRef = useRef<any>(null);
  const [numPages, setNumPages] = useState(0);
  const [pageWidth, setPageWidth] = useState(800);
  const [error, setError] = useState<string | null>(null);
  const [jump, setJump] = useState('');
  const [outline, setOutline] = useState<OutlineNode[] | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sideTab, setSideTab] = useState<'outline' | 'thumbs'>('outline');

  const showDoc = open && ready;

  // 浏览埋点（打开即计）
  useEffect(() => {
    void recordView(item.id);
  }, [item.id]);

  // 锁 body 滚动；Esc 关闭
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') requestClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [requestClose]);

  // 兜底：reduce 立即就绪；否则等 onLayoutAnimationComplete，再加超时兜底防回调未触发。
  useEffect(() => {
    if (reduce) {
      setReady(true);
      return;
    }
    const t = setTimeout(() => setReady(true), 480);
    return () => clearTimeout(t);
  }, [reduce]);

  // 测量阅读区可用宽度（侧栏开合 / 窗口变化 / 文档就绪都会触发），只接受正值。
  useEffect(() => {
    if (!showDoc) return;
    const el = scrollRef.current;
    if (!el) return;
    const measure = () => {
      const w = Math.min(el.clientWidth - 24, 900);
      if (w > 0) setPageWidth(w);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [showDoc, sidebarOpen]);

  const estimatedPageHeight = useMemo(
    () => (pageWidth > 0 ? pageWidth * A4_RATIO + PAGE_GAP : 800),
    [pageWidth],
  );

  const virtualizer = useVirtualizer({
    count: numPages,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => estimatedPageHeight,
    overscan: 2,
    gap: PAGE_GAP,
  });

  const virtualItems = virtualizer.getVirtualItems();
  const currentPage = virtualItems.length ? virtualItems[0].index + 1 : 1;

  useEffect(() => {
    if (numPages === 0) return;
    const id = requestAnimationFrame(() => virtualizer.measure());
    return () => cancelAnimationFrame(id);
  }, [numPages, pageWidth, sidebarOpen, virtualizer]);

  const goTo = useCallback(
    (page: number) => {
      const clamped = Math.max(1, Math.min(numPages, page));
      virtualizer.scrollToIndex(clamped - 1, { align: 'start' });
    },
    [numPages, virtualizer],
  );

  // 目录项 dest → 页码 → 跳转。
  const jumpToDest = useCallback(
    async (dest: OutlineNode['dest']) => {
      const pdf = pdfRef.current;
      if (!pdf || !dest) return;
      try {
        const explicit = typeof dest === 'string' ? await pdf.getDestination(dest) : dest;
        if (!Array.isArray(explicit) || !explicit[0]) return;
        const pageIndex = await pdf.getPageIndex(explicit[0]);
        virtualizer.scrollToIndex(pageIndex, { align: 'start' });
      } catch {
        /* 无效 dest 静默忽略 */
      }
    },
    [virtualizer],
  );

  const handleJump = (e: React.FormEvent) => {
    e.preventDefault();
    const n = parseInt(jump, 10);
    if (!Number.isNaN(n)) goTo(n);
    setJump('');
  };

  const hasOutline = !!outline && outline.length > 0;
  const fade = { duration: 0.2 };

  return (
    <AnimatePresence onExitComplete={onClose}>
      {open && (
        // 作为 AnimatePresence 的直接 keyed motion 子节点：移除时挂起卸载，
        // 让内部 遮罩/环境层 播放 exit 淡出、面板经 layoutId 折回卡片，再触发 onExitComplete。
        <motion.div key={item.id} className="fixed inset-0 z-50">
          {/* 背景遮罩（点击关闭） */}
          <motion.div
            className="absolute inset-0 bg-black/60"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={fade}
            onClick={requestClose}
          />

          {/* 玻璃拟态环境背景：封面/渐变放大 + 深度高斯模糊（等效主色调铺底） */}
          <motion.div
            aria-hidden
            className="pointer-events-none absolute inset-0 overflow-hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={fade}
          >
            <CoverArt
              item={item}
              className="absolute inset-0 h-full w-full scale-125 object-cover opacity-50 blur-[64px] saturate-150"
            />
            <div className="absolute inset-0 bg-black/30 dark:bg-black/55" />
          </motion.div>

          {/* 居中面板容器（pointer-events-none 让面板外点击落到遮罩） */}
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-3 sm:p-6">
            <motion.div
              layoutId={coverLayoutId(item.id)}
              onLayoutAnimationComplete={() => setReady(true)}
              transition={reduce ? fade : { type: 'spring', stiffness: 260, damping: 30 }}
              className="pointer-events-auto relative flex h-[94vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-white/20 bg-white/85 shadow-2xl backdrop-blur-2xl dark:border-white/10 dark:bg-zinc-950/85"
            >
              {showDoc ? (
                <ReaderBody
                  item={item}
                  scrollRef={scrollRef}
                  numPages={numPages}
                  pageWidth={pageWidth}
                  error={error}
                  jump={jump}
                  setJump={setJump}
                  outline={outline}
                  hasOutline={hasOutline}
                  sidebarOpen={sidebarOpen}
                  setSidebarOpen={setSidebarOpen}
                  sideTab={sideTab}
                  setSideTab={setSideTab}
                  virtualizer={virtualizer}
                  virtualItems={virtualItems}
                  currentPage={currentPage}
                  goTo={goTo}
                  jumpToDest={jumpToDest}
                  handleJump={handleJump}
                  onClose={requestClose}
                  saved={saved}
                  onToggleSave={onToggleSave}
                  onLoadSuccess={(pdf: {
                    numPages: number;
                    getOutline: () => Promise<OutlineNode[] | null>;
                  }) => {
                    setError(null);
                    setNumPages(pdf.numPages);
                    pdfRef.current = pdf;
                    pdf
                      .getOutline()
                      .then((o: OutlineNode[] | null) => {
                        setOutline(o ?? []);
                        if (!o || o.length === 0) setSideTab('thumbs');
                      })
                      .catch(() => setOutline([]));
                  }}
                  onLoadError={(e: Error) => setError('PDF 加载失败：' + e.message)}
                />
              ) : (
                <ReaderHero item={item} />
              )}
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// 展开过程中的轻量占位：封面铺满 + 标题 + spinner（与卡片封面无缝衔接）
function ReaderHero({ item }: { item: LibraryItem }) {
  return (
    <div className="relative flex h-full w-full items-end overflow-hidden">
      <CoverArt item={item} className="absolute inset-0 h-full w-full object-cover" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
      <div className="relative flex w-full items-center gap-3 p-5">
        <Loader2 className="h-5 w-5 animate-spin text-white/90" />
        <span className="line-clamp-1 text-base font-semibold text-white drop-shadow">
          {item.title}
        </span>
      </div>
    </div>
  );
}

// ── 阅读主体（顶栏 + 侧栏 + 虚拟化主区） ──────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ReaderBody(props: any) {
  const {
    item,
    scrollRef,
    numPages,
    pageWidth,
    error,
    jump,
    setJump,
    outline,
    hasOutline,
    sidebarOpen,
    setSidebarOpen,
    sideTab,
    setSideTab,
    virtualizer,
    virtualItems,
    currentPage,
    goTo,
    jumpToDest,
    handleJump,
    onClose,
    onLoadSuccess,
    onLoadError,
    saved,
    onToggleSave,
  } = props;

  return (
    <>
      {/* 顶栏 */}
      <div className="flex shrink-0 items-center gap-2 border-b border-zinc-200/70 px-3 py-2.5 dark:border-zinc-800/70">
        <button
          type="button"
          onClick={() => setSidebarOpen((v: boolean) => !v)}
          className={`rounded-md p-1.5 transition-colors ${
            sidebarOpen
              ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-400'
              : 'text-zinc-500 hover:bg-zinc-200/70 dark:hover:bg-zinc-800'
          }`}
          aria-label="目录"
          title="目录 / 缩略图"
        >
          <PanelLeft size={16} />
        </button>
        <h2 className="min-w-0 flex-1 truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          {item.title}
        </h2>

        {numPages > 0 && (
          <div className="flex items-center gap-1 text-xs text-zinc-600 dark:text-zinc-400">
            <button
              type="button"
              onClick={() => goTo(currentPage - 1)}
              disabled={currentPage <= 1}
              className="rounded-md p-1 hover:bg-zinc-200/70 disabled:opacity-40 dark:hover:bg-zinc-800"
              aria-label="上一页"
            >
              <ChevronUp size={16} />
            </button>
            <form onSubmit={handleJump} className="flex items-center gap-1">
              <input
                value={jump}
                onChange={(e) => setJump(e.target.value.replace(/\D/g, ''))}
                placeholder={String(currentPage)}
                className="w-9 rounded border border-zinc-300 bg-white px-1 py-0.5 text-center tabular-nums outline-none focus:border-indigo-500 dark:border-zinc-700 dark:bg-zinc-900"
                aria-label="跳转到页码"
              />
              <span className="tabular-nums">/ {numPages}</span>
            </form>
            <button
              type="button"
              onClick={() => goTo(currentPage + 1)}
              disabled={currentPage >= numPages}
              className="rounded-md p-1 hover:bg-zinc-200/70 disabled:opacity-40 dark:hover:bg-zinc-800"
              aria-label="下一页"
            >
              <ChevronDown size={16} />
            </button>
          </div>
        )}

        {onToggleSave && (
          <button
            type="button"
            onClick={onToggleSave}
            aria-pressed={saved}
            title={saved ? '已在我的知识库 · 点击移除' : '收藏到我的知识库'}
            className={`rounded-md p-1.5 hover:bg-zinc-200/70 dark:hover:bg-zinc-800 ${
              saved ? 'text-indigo-500' : 'text-zinc-600 dark:text-zinc-400'
            }`}
          >
            <Bookmark size={16} className={saved ? 'fill-current' : ''} />
          </button>
        )}
        <a
          href={item.pdf_url}
          target="_blank"
          rel="noopener noreferrer"
          download
          onClick={() => void recordDownload(item.id)}
          className="rounded-md p-1.5 text-zinc-600 hover:bg-zinc-200/70 dark:text-zinc-400 dark:hover:bg-zinc-800"
          aria-label="下载原文件"
        >
          <Download size={16} />
        </a>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md p-1.5 text-zinc-600 hover:bg-zinc-200/70 dark:text-zinc-400 dark:hover:bg-zinc-800"
          aria-label="关闭"
        >
          <X size={16} />
        </button>
      </div>

      {error ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-zinc-500">
          <FileWarning className="h-10 w-10 text-amber-500" />
          <p className="text-sm">{error}</p>
        </div>
      ) : (
        <Document
          file={item.pdf_url}
          options={PDF_OPTIONS}
          className="flex min-h-0 flex-1"
          onLoadSuccess={onLoadSuccess}
          onLoadError={onLoadError}
          loading={<ReaderSkeleton />}
          error={
            <div className="flex flex-1 items-center justify-center py-20 text-center text-sm text-zinc-500">
              无法加载该 PDF（可能是跨域或文件损坏）
            </div>
          }
        >
          {/* 侧栏 */}
          {numPages > 0 && sidebarOpen && (
            <aside className="flex w-56 max-w-[72vw] shrink-0 flex-col border-r border-zinc-200/70 bg-white/70 dark:border-zinc-800/70 dark:bg-zinc-900/70">
              <div className="flex shrink-0 gap-1 border-b border-zinc-200/70 p-1.5 dark:border-zinc-800/70">
                <SideTabButton
                  active={sideTab === 'outline'}
                  onClick={() => setSideTab('outline')}
                  icon={<List size={13} />}
                  label="目录"
                />
                <SideTabButton
                  active={sideTab === 'thumbs'}
                  onClick={() => setSideTab('thumbs')}
                  icon={<Images size={13} />}
                  label="缩略图"
                />
              </div>
              {sideTab === 'outline' ? (
                <div data-lenis-prevent className="min-h-0 flex-1 overflow-y-auto p-1.5">
                  {hasOutline ? (
                    <OutlineTree nodes={outline!} onJump={jumpToDest} />
                  ) : (
                    <p className="px-2 py-6 text-center text-xs text-zinc-400">
                      此文档无内置目录，<br />可用「缩略图」翻阅。
                    </p>
                  )}
                </div>
              ) : (
                <ThumbnailRail numPages={numPages} currentPage={currentPage} onJump={goTo} />
              )}
            </aside>
          )}

          {/* 主阅读区（虚拟化） */}
          <div ref={scrollRef} data-lenis-prevent className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-4">
            {numPages > 0 && pageWidth > 0 && (
              <div
                className="relative mx-auto w-full"
                style={{ height: virtualizer.getTotalSize(), maxWidth: 900 }}
              >
                {virtualItems.map((vi: { key: React.Key; index: number; start: number }) => (
                  <div
                    key={vi.key}
                    data-index={vi.index}
                    ref={virtualizer.measureElement}
                    className="absolute left-0 top-0 flex w-full justify-center"
                    style={{ transform: `translateY(${vi.start}px)` }}
                  >
                    <Page
                      pageNumber={vi.index + 1}
                      width={pageWidth}
                      className="overflow-hidden rounded-md bg-white shadow-md"
                      loading={
                        <div
                          className="flex items-center justify-center rounded-md bg-white shadow-md"
                          style={{ width: pageWidth, height: pageWidth * A4_RATIO }}
                        >
                          <Loader2 className="h-6 w-6 animate-spin text-zinc-300" />
                        </div>
                      }
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        </Document>
      )}
    </>
  );
}

function SideTabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-1 items-center justify-center gap-1 rounded-md py-1.5 text-xs font-medium transition-colors ${
        active
          ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-400'
          : 'text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function OutlineTree({
  nodes,
  onJump,
  depth = 0,
}: {
  nodes: OutlineNode[];
  onJump: (dest: OutlineNode['dest']) => void;
  depth?: number;
}) {
  return (
    <ul className={depth === 0 ? '' : 'ml-2.5 border-l border-zinc-200 dark:border-zinc-800'}>
      {nodes.map((n, i) => (
        <li key={i}>
          <button
            type="button"
            onClick={() => onJump(n.dest)}
            className="block w-full truncate rounded px-2 py-1.5 text-left text-xs text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
            title={n.title}
          >
            {n.title || '（无标题）'}
          </button>
          {n.items && n.items.length > 0 && (
            <OutlineTree nodes={n.items} onJump={onJump} depth={depth + 1} />
          )}
        </li>
      ))}
    </ul>
  );
}

function ThumbnailRail({
  numPages,
  currentPage,
  onJump,
}: {
  numPages: number;
  currentPage: number;
  onJump: (page: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const v = useVirtualizer({
    count: numPages,
    getScrollElement: () => ref.current,
    estimateSize: () => THUMB_W * A4_RATIO + 28,
    overscan: 3,
  });
  return (
    <div ref={ref} data-lenis-prevent className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
      <div className="relative w-full" style={{ height: v.getTotalSize() }}>
        {v.getVirtualItems().map((vi) => {
          const p = vi.index + 1;
          return (
            <div
              key={vi.key}
              className="absolute left-0 top-0 flex w-full flex-col items-center"
              style={{ transform: `translateY(${vi.start}px)` }}
            >
              <button
                type="button"
                onClick={() => onJump(p)}
                className={`overflow-hidden rounded border-2 transition-colors ${
                  p === currentPage
                    ? 'border-indigo-500'
                    : 'border-transparent hover:border-zinc-300 dark:hover:border-zinc-600'
                }`}
              >
                <Page
                  pageNumber={p}
                  width={THUMB_W}
                  renderTextLayer={false}
                  renderAnnotationLayer={false}
                  loading={
                    <div
                      style={{ width: THUMB_W, height: THUMB_W * A4_RATIO }}
                      className="bg-zinc-100 dark:bg-zinc-800"
                    />
                  }
                />
              </button>
              <span className="mb-2 mt-0.5 text-[10px] text-zinc-400">{p}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ReaderSkeleton() {
  return (
    <div className="flex flex-1 flex-col items-center gap-4 py-10">
      <Loader2 className="h-7 w-7 animate-spin text-indigo-500" />
      <div className="h-[60vh] w-full max-w-[640px] animate-pulse rounded-md bg-zinc-200 dark:bg-zinc-800" />
    </div>
  );
}
