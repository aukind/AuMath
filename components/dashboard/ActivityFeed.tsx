import Link from 'next/link';
import { Activity, Compass, MessageSquarePlus } from 'lucide-react';
import FeedItem from '@/components/dashboard/FeedItem';
import type { ActivityFeedItem } from '@/types/dashboard';

/**
 * 右侧核心动态流。参考 GitHub Timeline：一根贯穿的细线串联所有动态。
 * recentActivities 为空时优雅降级为带虚线边框的引导式空状态。
 */
export default function ActivityFeed({ items }: { items: ActivityFeedItem[] }) {
  return (
    <section aria-label="近期动态" className="space-y-4">
      <div className="flex items-center gap-2">
        <Activity size={15} className="text-zinc-400 dark:text-zinc-500" />
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">近期动态</h2>
        {items.length > 0 && (
          <span className="text-xs text-zinc-400 dark:text-zinc-600 tabular-nums">{items.length}</span>
        )}
      </div>

      {items.length === 0 ? (
        <EmptyFeed />
      ) : (
        <ol className="relative">
          {items.map((item, i) => (
            <FeedItem key={item.id} item={item} isLast={i === items.length - 1} />
          ))}
        </ol>
      )}
    </section>
  );
}

/** 空状态：虚线容器 + 引导图标 + 两个行动入口 */
function EmptyFeed() {
  return (
    <div className="flex flex-col items-center justify-center text-center rounded-xl border border-dashed border-zinc-300 dark:border-zinc-700 px-6 py-14">
      <div className="flex items-center justify-center w-12 h-12 rounded-full bg-zinc-100 dark:bg-zinc-800/70">
        <Activity size={22} className="text-zinc-400 dark:text-zinc-500" />
      </div>
      <h3 className="mt-4 text-sm font-semibold text-zinc-800 dark:text-zinc-200">
        还没有任何动态
      </h3>
      <p className="mt-1 max-w-xs text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed">
        开始你的第一道难题，或在论坛发起讨论，学习轨迹会自动出现在这里。
      </p>
      <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 px-3.5 py-2 text-sm font-medium text-white transition-colors"
        >
          <Compass size={15} /> 浏览公共题库
        </Link>
        <Link
          href="/forum"
          className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 px-3.5 py-2 text-sm font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
        >
          <MessageSquarePlus size={15} /> 发布第一篇帖子
        </Link>
      </div>
    </div>
  );
}
