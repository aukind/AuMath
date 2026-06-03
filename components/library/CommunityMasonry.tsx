'use client';

// 社区海域：Notion 风高密度瀑布流文档卡片。
//   · 布局沿用 CSS columns（零 JS、break-inside-avoid），不引入 JS masonry 库。
//   · 卡片封面包 motion.div layoutId={lib-cover-${id}} —— 与 ImmersiveReader 共享放大转场。
//   · 新增点赞（爱心）；保留 浏览 / 举报 / 加精。
//   · XSS：标题/简介全程 React 文本渲染（天然转义），禁 dangerouslySetInnerHTML。

import { motion } from 'framer-motion';
import { BadgeCheck, Eye, Flag, Heart, Sparkles } from 'lucide-react';
import CoverArt from '@/components/library/CoverArt';
import { Avatar, coverLayoutId } from '@/components/library/shared';
import SquishyButton from '@/components/motion/SquishyButton';
import type { LibraryItem } from '@/types/library';

export default function CommunityMasonry({
  items,
  isAdmin,
  currentUserId,
  votedIds,
  onOpen,
  onReport,
  onPromote,
  onToggleUpvote,
}: {
  items: LibraryItem[];
  isAdmin: boolean;
  currentUserId: string | null;
  votedIds: Set<string>;
  onOpen: (item: LibraryItem) => void;
  onReport: (item: LibraryItem) => void;
  onPromote: (item: LibraryItem) => void;
  onToggleUpvote: (item: LibraryItem) => void;
}) {
  return (
    <div className="gap-4 [column-fill:_balance] sm:columns-2 lg:columns-3">
      {items.map((item) => (
        <FeedCard
          key={item.id}
          item={item}
          isAdmin={isAdmin}
          voted={votedIds.has(item.id)}
          canReport={!!currentUserId && item.author_id !== currentUserId}
          onOpen={() => onOpen(item)}
          onReport={() => onReport(item)}
          onPromote={() => onPromote(item)}
          onToggleUpvote={() => onToggleUpvote(item)}
        />
      ))}
    </div>
  );
}

function FeedCard({
  item,
  isAdmin,
  voted,
  canReport,
  onOpen,
  onReport,
  onPromote,
  onToggleUpvote,
}: {
  item: LibraryItem;
  isAdmin: boolean;
  voted: boolean;
  canReport: boolean;
  onOpen: () => void;
  onReport: () => void;
  onPromote: () => void;
  onToggleUpvote: () => void;
}) {
  return (
    <div className="mb-4 break-inside-avoid overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md hover:ring-1 hover:ring-indigo-500/20 dark:border-zinc-800 dark:bg-zinc-900">
      <button type="button" onClick={onOpen} className="block w-full text-left">
        <motion.div layoutId={coverLayoutId(item.id)} className="overflow-hidden">
          <CoverArt item={item} className="h-32" />
        </motion.div>
        <div className="p-3">
          <div className="mb-1 flex items-center gap-1">
            {item.is_official && <BadgeCheck size={14} className="shrink-0 text-sky-500" />}
            <span className="line-clamp-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              {item.title}
            </span>
          </div>
          {item.description && (
            <p className="line-clamp-2 text-xs text-zinc-500">{item.description}</p>
          )}
          {/* 类型 / 学段 / 标签 */}
          <div className="mt-2 flex flex-wrap gap-1">
            <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-medium text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-300">
              {item.resource_type}
            </span>
            <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300">
              {item.edu_stage}
            </span>
            {item.tags.slice(0, 2).map((t) => (
              <span
                key={t}
                className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] text-zinc-500 dark:bg-zinc-800"
              >
                #{t}
              </span>
            ))}
          </div>
        </div>
      </button>

      {/* 底栏：作者 / 点赞 / 浏览 / 操作 */}
      <div className="flex items-center gap-2 border-t border-zinc-100 px-3 py-2 dark:border-zinc-800">
        {item.is_official ? (
          <span className="flex items-center gap-1 text-xs font-medium text-sky-600 dark:text-sky-400">
            <BadgeCheck size={13} /> 官方
          </span>
        ) : (
          <span className="flex min-w-0 items-center gap-1.5">
            <Avatar name={item.author?.username ?? '匿名'} url={item.author?.avatarUrl} />
            <span className="truncate text-xs text-zinc-500">{item.author?.username ?? '匿名'}</span>
          </span>
        )}

        <div className="ml-auto flex items-center gap-1">
          <SquishyButton
            type="button"
            onClick={onToggleUpvote}
            title={voted ? '取消点赞' : '点赞'}
            aria-pressed={voted}
            className={`flex items-center gap-1 rounded-full px-1.5 py-1 text-xs transition-colors ${
              voted
                ? 'text-rose-500'
                : 'text-zinc-400 hover:bg-zinc-100 hover:text-rose-500 dark:hover:bg-zinc-800'
            }`}
          >
            <Heart size={13} className={voted ? 'fill-current' : ''} />
            <span className="tabular-nums">{item.upvote_count}</span>
          </SquishyButton>

          <span className="flex items-center gap-1 px-1 text-xs text-zinc-400">
            <Eye size={12} /> {item.view_count}
          </span>

          {isAdmin && !item.is_official && (
            <SquishyButton
              type="button"
              onClick={onPromote}
              title="加精为官方"
              className="rounded p-1 text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-500/10"
            >
              <Sparkles size={14} />
            </SquishyButton>
          )}
          {canReport && (
            <SquishyButton
              type="button"
              onClick={onReport}
              title="举报"
              className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-rose-500 dark:hover:bg-zinc-800"
            >
              <Flag size={14} />
            </SquishyButton>
          )}
        </div>
      </div>
    </div>
  );
}
