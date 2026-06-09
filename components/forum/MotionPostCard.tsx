'use client';

// 论坛列表「缩略态」卡片 —— 共享元素转场的源端。
// 与拦截路由弹窗 PostDetailView 共用同一组 layoutId：点击后卡片整体放大 morph
// 为屏幕中央的模态详情，头像/标题/作者日期等元素各自带子 layoutId 做元素级位移。

import Link from 'next/link';
import { motion } from 'framer-motion';
import { Eye, MessageSquare, Pin, ThumbsUp } from 'lucide-react';
import type { ForumPost } from '@/types/forum';
import {
  cardLayoutId,
  avatarLayoutId,
  titleLayoutId,
  metaLayoutId,
  SHARED_SPRING,
} from '@/components/motion/SharedCardProps';
import { imgTransform } from '@/lib/supabase/imageTransform';

function initials(name: string): string {
  return name.slice(0, 1).toUpperCase();
}

export function PostAvatar({ name, url, role }: { name: string; url?: string; role?: string }) {
  const isSpecial = role === 'admin' || name === 'au' || name === 'aumath';
  return (
    <div className="relative inline-flex items-center justify-center shrink-0">
      <div className="relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 text-sm font-bold text-white overflow-hidden shadow-sm ring-1 ring-zinc-200 dark:ring-zinc-800">
        {url ? <img src={imgTransform(url, { width: 128 })} alt={name} className="h-full w-full object-cover" /> : initials(name)}
      </div>
      {isSpecial && (
        <div className="pointer-events-none absolute -inset-[9px] z-20">
          <svg viewBox="0 0 100 100" className="h-full w-full animate-[spin_10s_linear_infinite]" fill="none" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="au-admin-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#818cf8" />
                <stop offset="50%" stopColor="#c084fc" />
                <stop offset="100%" stopColor="#f472b6" />
              </linearGradient>
            </defs>
            <circle cx="50" cy="50" r="47" stroke="url(#au-admin-grad)" strokeWidth="1.5" strokeDasharray="40 10 15 10" strokeLinecap="round" className="opacity-80" />
            <circle cx="10" cy="50" r="2" fill="#818cf8" />
            <circle cx="90" cy="50" r="2" fill="#f472b6" />
          </svg>
        </div>
      )}
    </div>
  );
}

export default function MotionPostCard({ post }: { post: ForumPost }) {
  return (
    <motion.li
      // 容器 layoutId：与 PostDetailView 的模态面板共享 → 卡片整体 morph（位置+尺寸）。
      layoutId={cardLayoutId('forum', post.id)}
      transition={SHARED_SPRING}
      className="group relative flex gap-3.5 rounded-xl border border-zinc-200/80 bg-white px-4 py-3.5 transition-colors hover:border-zinc-300 hover:shadow-sm dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700"
    >
      {/* 卡片整体点击区：scroll={false} 防软导航重置滚动、保证 morph 从正确原点起 */}
      <Link href={`/forum/${post.id}`} scroll={false} className="absolute inset-0 z-0 rounded-xl" aria-label={post.title} />

      <div className="relative z-10 pt-0.5">
        <Link href={`/u/${post.author.id}`} className="block transition-opacity hover:opacity-80">
          <motion.div layoutId={avatarLayoutId('forum', post.id)}>
            <PostAvatar name={post.author.username} url={post.author.avatarUrl} role={post.author.role} />
          </motion.div>
        </Link>
      </div>

      <div className="flex-1 min-w-0 flex flex-col">
        <motion.div layoutId={metaLayoutId('forum', post.id)} className="flex items-center gap-1.5 text-xs text-zinc-500">
          <Link
            href={`/u/${post.author.id}`}
            className="relative z-10 font-bold text-zinc-900 hover:text-indigo-600 hover:underline dark:text-zinc-100 dark:hover:text-indigo-400"
          >
            {post.author.username}
          </Link>
          <span className="text-zinc-300 dark:text-zinc-600">·</span>
          <span className="tabular-nums">
            {new Date(post.createdAt).toLocaleString('zh-CN', {
              year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: true,
            })}
          </span>
        </motion.div>

        <motion.h2
          layoutId={titleLayoutId('forum', post.id)}
          className="mt-1 text-[0.9375rem] font-semibold text-zinc-900 dark:text-zinc-100 leading-snug"
        >
          {post.tags.includes('公告') && <Pin size={13} className="mr-1.5 inline-block shrink-0 text-amber-500" />}
          {post.title}
        </motion.h2>

        <div className="mt-2.5 flex flex-wrap items-center gap-4 text-xs text-zinc-400">
          <span className="inline-flex items-center gap-1.5 transition-colors group-hover:text-zinc-500">
            <MessageSquare className="h-3.5 w-3.5" />
            <span className="tabular-nums">{post.commentCount ?? 0}</span>
          </span>
          <span className="inline-flex items-center gap-1.5 transition-colors group-hover:text-zinc-500">
            <Eye className="h-3.5 w-3.5" />
            <span className="tabular-nums">{post.viewCount}</span>
          </span>
          <span className="inline-flex items-center gap-1.5 transition-colors group-hover:text-zinc-500">
            <ThumbsUp className="h-3.5 w-3.5" />
            <span className="tabular-nums">{post.upvotes ?? 0}</span>
          </span>

          <div className="ml-auto flex gap-1.5">
            {post.tags.filter((t) => t !== '公告').map((tag) => (
              <span
                key={tag}
                className={`rounded-full px-2 py-0.5 text-[10px] ${
                  tag === '产品建议'
                    ? 'bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400'
                    : 'bg-indigo-50/80 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-300'
                }`}
              >
                #{tag}
              </span>
            ))}
          </div>
        </div>
      </div>
    </motion.li>
  );
}
