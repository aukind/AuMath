'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Eye, MessageSquarePlus, Pin, MessageSquare, Lightbulb } from 'lucide-react';
import type { ForumPost } from '@/types/forum';

function initials(name: string): string {
  return name.slice(0, 1).toUpperCase();
}

function Avatar({ name, url, role }: { name: string; url?: string; role?: string }) {
  const isSpecial = role === 'admin' || name === 'au' || name === 'aumath';
  return (
    <div className="relative inline-flex items-center justify-center shrink-0">
      <div className="relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 text-sm font-bold text-white overflow-hidden shadow-sm ring-1 ring-zinc-200 dark:ring-zinc-800">
        {url ? <img src={url} alt={name} className="h-full w-full object-cover" /> : initials(name)}
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
            <Link
              href="/forum/new?tag=产品建议"
              className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 transition-colors"
            >
              <Lightbulb size={14} className="text-amber-500" /> 提建议
            </Link>
            <Link
              href="/forum/new"
              className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 shadow-sm transition-colors"
            >
              <MessageSquarePlus size={14} /> 发帖
            </Link>
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
            <li
              key={post.id}
              className="group relative flex gap-3.5 rounded-xl border border-zinc-200/80 bg-white px-4 py-3.5 transition-all hover:border-zinc-300 hover:shadow-sm dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700"
            >
              <Link href={`/forum/${post.id}`} className="absolute inset-0 z-0 rounded-xl" aria-label={post.title} />
              
              <div className="relative z-10 pt-0.5">
                <Link href={`/u/${post.author.id}`} className="block transition-opacity hover:opacity-80">
                  <Avatar name={post.author.username} url={post.author.avatarUrl} role={post.author.role} />
                </Link>
              </div>

              <div className="flex-1 min-w-0 flex flex-col">
                <div className="flex items-center gap-1.5 text-xs text-zinc-500">
                  <Link
                    href={`/u/${post.author.id}`}
                    className="relative z-10 font-bold text-zinc-900 hover:text-indigo-600 hover:underline dark:text-zinc-100 dark:hover:text-indigo-400"
                  >
                    {post.author.username}
                  </Link>
                  <span className="text-zinc-300 dark:text-zinc-600">·</span>
                  <span className="tabular-nums">
                    {new Date(post.createdAt).toLocaleString('zh-CN', {
                      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: true
                    })}
                  </span>
                </div>

                <h2 className="mt-1 text-[0.9375rem] font-semibold text-zinc-900 dark:text-zinc-100 leading-snug">
                  {post.tags.includes('公告') && <Pin size={13} className="mr-1.5 inline-block shrink-0 text-amber-500" />}
                  {post.title}
                </h2>

                <div className="mt-2.5 flex flex-wrap items-center gap-4 text-xs text-zinc-400">
                  <span className="inline-flex items-center gap-1.5 transition-colors group-hover:text-zinc-500">
                    <MessageSquare className="h-3.5 w-3.5" />
                    <span className="tabular-nums">{post.commentCount ?? 0}</span>
                  </span>
                  <span className="inline-flex items-center gap-1.5 transition-colors group-hover:text-zinc-500">
                    <Eye className="h-3.5 w-3.5" />
                    <span className="tabular-nums">{post.viewCount}</span>
                  </span>
                  
                  <div className="ml-auto flex gap-1.5">
                    {post.tags.filter(t => t !== '公告').map((tag) => (
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
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}