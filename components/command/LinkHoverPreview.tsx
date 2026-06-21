'use client';

// 维基链接悬停预览（Obsidian 式 hover-peek）。全局事件委托：鼠标悬到「可预览链接」
// （/explore?focus= 知识点/定理、/notes?ref= 或 /notes/<id> 笔记）350ms 后弹出小卡片。
// 仅细指针（鼠标）设备启用；触摸设备无 hover 概念，直接禁用。
import { useEffect, useRef, useState } from 'react';
import { Orbit, Sigma, NotebookPen } from 'lucide-react';
import { getLinkPreview, type LinkPreview } from '@/app/actions/link-preview';

const NOTE_ID_RE = /^\/notes\/[0-9a-fA-F-]{8,}$/;

/** 该 href 是否为可预览的维基链接（排除侧栏等普通导航）。 */
function previewable(href: string): boolean {
  try {
    const u = new URL(href, window.location.origin);
    if (u.pathname === '/explore' && u.searchParams.get('focus')) return true;
    if (u.pathname === '/notes' && u.searchParams.get('ref')) return true;
    if (NOTE_ID_RE.test(u.pathname)) return true;
    return false;
  } catch { return false; }
}

const ICON = {
  topic: <Orbit size={14} className="text-violet-500" />,
  theorem: <Sigma size={14} className="text-amber-500" />,
  note: <NotebookPen size={14} className="text-cyan-500" />,
} as const;

export default function LinkHoverPreview() {
  const [data, setData] = useState<LinkPreview | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number; above: boolean } | null>(null);
  const cache = useRef(new Map<string, LinkPreview | null>());
  const showTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentHref = useRef<string | null>(null);

  useEffect(() => {
    // 触摸/粗指针设备无 hover：不挂监听。
    if (window.matchMedia?.('(pointer: coarse)')?.matches) return;

    const clearTimers = () => {
      if (showTimer.current) clearTimeout(showTimer.current);
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };

    const hide = () => {
      clearTimers();
      currentHref.current = null;
      setData(null);
      setPos(null);
    };

    const place = (a: HTMLAnchorElement) => {
      const r = a.getBoundingClientRect();
      const above = r.bottom + 160 > window.innerHeight;
      const left = Math.min(Math.max(8, r.left), window.innerWidth - 332);
      setPos({ left, top: above ? r.top - 8 : r.bottom + 6, above });
    };

    const onOver = (e: MouseEvent) => {
      const a = (e.target as HTMLElement)?.closest?.('a') as HTMLAnchorElement | null;
      if (!a) return;
      const href = a.getAttribute('href') ?? '';
      if (!href || !previewable(href)) return;
      if (href === currentHref.current) return;

      clearTimers();
      currentHref.current = href;
      showTimer.current = setTimeout(async () => {
        let preview = cache.current.get(href);
        if (preview === undefined) {
          preview = await getLinkPreview(href).catch(() => null);
          cache.current.set(href, preview);
        }
        // 期间鼠标可能已移走。
        if (currentHref.current !== href || !preview) { if (currentHref.current === href && !preview) hide(); return; }
        place(a);
        setData(preview);
      }, 350);
    };

    const onOut = (e: MouseEvent) => {
      const a = (e.target as HTMLElement)?.closest?.('a');
      if (!a) return;
      // 移出链接：留 140ms 余地以便移到卡片上。
      if (hideTimer.current) clearTimeout(hideTimer.current);
      hideTimer.current = setTimeout(hide, 140);
    };

    document.addEventListener('mouseover', onOver);
    document.addEventListener('mouseout', onOut);
    window.addEventListener('scroll', hide, true);
    window.addEventListener('resize', hide);
    return () => {
      clearTimers();
      document.removeEventListener('mouseover', onOver);
      document.removeEventListener('mouseout', onOut);
      window.removeEventListener('scroll', hide, true);
      window.removeEventListener('resize', hide);
    };
  }, []);

  if (!data || !pos) return null;

  return (
    <div
      className="pointer-events-none fixed z-[55] w-[320px] rounded-xl border border-zinc-200 bg-white/95 p-3 shadow-xl backdrop-blur-sm dark:border-zinc-700 dark:bg-zinc-900/95"
      style={{ left: pos.left, top: pos.top, transform: pos.above ? 'translateY(-100%)' : undefined }}
    >
      <div className="flex items-center gap-1.5">
        {ICON[data.kind]}
        <span className="flex-1 truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">{data.title}</span>
        {data.meta && <span className="shrink-0 text-xs text-zinc-400">{data.meta}</span>}
      </div>
      {data.description && (
        <p className="mt-1.5 line-clamp-3 text-xs leading-relaxed text-zinc-600 dark:text-zinc-300">{data.description}</p>
      )}
      {data.snippet && (
        <p className="mt-1.5 line-clamp-3 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">{data.snippet}</p>
      )}
      {!data.description && !data.snippet && (
        <p className="mt-1.5 text-xs italic text-zinc-400">（暂无摘要）</p>
      )}
    </div>
  );
}
