import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import LibraryMark from '@/components/library/LibraryMark';
import CoverArt from '@/components/library/CoverArt';
import type { LibraryItem } from '@/types/library';

/**
 * 首页「资源大厅」显著入口 Hero 横幅。
 * 渐变大卡 + 品牌标识 + 文案 + CTA + 右侧最新封面缩略。仅在首页默认（社区）视图顶部渲染。
 */
export default function LibraryHeroBanner({ highlights }: { highlights: LibraryItem[] }) {
  const covers = highlights.slice(0, 4);
  return (
    <Link
      href="/library"
      className="group relative mb-5 block overflow-hidden rounded-2xl border border-indigo-200/60 bg-gradient-to-br from-indigo-50 via-violet-50 to-fuchsia-50 p-5 transition-shadow hover:shadow-md dark:border-indigo-500/20 dark:from-indigo-950/40 dark:via-violet-950/30 dark:to-fuchsia-950/20"
    >
      {/* 背景光斑 */}
      <div className="pointer-events-none absolute -right-10 -top-12 h-40 w-40 rounded-full bg-violet-400/20 blur-3xl" />

      <div className="relative flex items-center gap-4">
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex items-center gap-2">
            <LibraryMark size={36} />
            <div>
              <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100">资源大厅</h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">教材 · 讲义 · 真题，随手翻阅</p>
            </div>
          </div>
          <p className="mb-3 line-clamp-1 text-sm text-zinc-600 dark:text-zinc-300">
            官方严选 + 社区共享的高质量数学资料库，网页内沉浸式阅读、带目录、秒开大文件。
          </p>
          <span className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors group-hover:bg-indigo-500">
            进入大厅 <ArrowRight size={13} className="transition-transform group-hover:translate-x-0.5" />
          </span>
        </div>

        {/* 右侧最新封面缩略（桌面端） */}
        {covers.length > 0 && (
          <div className="hidden shrink-0 items-end gap-2 sm:flex">
            {covers.map((it, i) => (
              <div
                key={it.id}
                className="h-24 w-16 overflow-hidden rounded-lg shadow-md ring-1 ring-black/5 transition-transform group-hover:-translate-y-0.5"
                style={{ transform: `rotate(${(i - 1.5) * 4}deg)` }}
              >
                <CoverArt item={it} className="h-full" />
              </div>
            ))}
          </div>
        )}
      </div>
    </Link>
  );
}
