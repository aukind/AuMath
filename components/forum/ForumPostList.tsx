'use client';

import { useState } from 'react';
import { MessageSquarePlus, Lightbulb } from 'lucide-react';
import type { ForumPost } from '@/types/forum';
import MotionPostCard from './MotionPostCard';

interface ForumPostListProps {
  posts: ForumPost[];
  canPost?: boolean;
}

export default function ForumPostList({ posts, canPost = true }: ForumPostListProps) {
  const [filter, setFilter] = useState<'all' | 'feedback'>('all');

  // 根据分类过滤帖子
  const filteredPosts = posts.filter(post => {
    if (filter === 'feedback') return post.tags.includes('产品建议');
    return true; // all
  });

  return (
    <div>
      {/* 顶部操作栏：左侧 Filter，右侧按钮 */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        {/* 极简分类器 */}
        <div className="flex gap-1 rounded-lg border border-zinc-200 bg-zinc-50 p-1 dark:border-zinc-800 dark:bg-zinc-900/60">
          <button
            onClick={() => setFilter('all')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${filter === 'all' ? 'bg-white shadow-sm text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100' : 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-300'}`}
          >
            全部讨论
          </button>
          <button
            onClick={() => setFilter('feedback')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${filter === 'feedback' ? 'bg-white shadow-sm text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100' : 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-300'}`}
          >
            💡 产品建议
          </button>
        </div>

        {/* 发帖按钮区 */}
        {canPost && (
          <div className="flex gap-2.5">
            {/* 用原生 <a> 做硬导航，绕过 @modal 的 (.)forum/[id] 拦截路由
                （否则软导航 /forum/new 会被当成帖子 id 拦截，致 404 / 无响应）。 */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- 有意硬导航，见上 */}
            <a
              href="/forum/new?tag=产品建议"
              className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 transition-colors"
            >
              <Lightbulb size={14} className="text-amber-500" /> 提建议
            </a>
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- 有意硬导航，见上 */}
            <a
              href="/forum/new"
              className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 shadow-sm transition-colors"
            >
              <MessageSquarePlus size={14} /> 发帖
            </a>
          </div>
        )}
      </div>

      {filteredPosts.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
          <div className="text-4xl">{filter === 'feedback' ? '💡' : '💬'}</div>
          <h2 className="font-semibold text-zinc-700 dark:text-zinc-300">
            {filter === 'feedback' ? '还没有产品建议' : '还没有帖子'}
          </h2>
          <p className="text-sm text-zinc-400">
            {filter === 'feedback' ? '有什么痛点或想法？点击右上角提建议。' : '来发第一个讨论主题吧。'}
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {filteredPosts.map((post) => (
            <MotionPostCard key={post.id} post={post} />
          ))}
        </ul>
      )}
    </div>
  );
}