'use client';

// 论坛帖子列表 —— 首页主区与 /forum 共用。纯展示，点标题进详情页。
import Link from 'next/link';
import { Eye, MessageSquarePlus, Pin } from 'lucide-react';
import type { ForumPost } from '@/types/forum';

interface ForumPostListProps {
  posts: ForumPost[];
  /** 是否显示「发帖」按钮（登录用户）。 */
  canPost?: boolean;
}

export default function ForumPostList({ posts, canPost = true }: ForumPostListProps) {
  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">社区讨论区</h1>
          <p className="mt-0.5 text-xs text-zinc-400">交流解题思路 · 分享变式 · 支持 LaTeX 公式</p>
        </div>
        {canPost && (
          <Link
            href="/forum/new"
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700"
          >
            <MessageSquarePlus size={14} /> 发帖
          </Link>
        )}
      </div>

      {posts.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
          <div className="text-4xl">💬</div>
          <h2 className="font-semibold text-zinc-700 dark:text-zinc-300">还没有帖子</h2>
          <p className="text-sm text-zinc-400">来发第一个讨论主题吧。</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {posts.map((post) => (
            <li key={post.id}>
              <Link
                href={`/forum/${post.id}`}
                className="block rounded-xl border border-zinc-200 bg-white px-4 py-3 transition-colors hover:border-indigo-300 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-indigo-700"
              >
                <h2 className="flex items-center gap-1.5 font-medium text-zinc-900 dark:text-zinc-100">
                  {post.tags.includes('公告') && (
                    <Pin size={13} className="shrink-0 text-amber-500" />
                  )}
                  {post.title}
                </h2>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                  <span>{post.author.username}</span>
                  <span>· {new Date(post.createdAt).toLocaleDateString('zh-CN')}</span>
                  <span className="inline-flex items-center gap-1">
                    <Eye className="h-3.5 w-3.5" />
                    {post.viewCount}
                  </span>
                  {post.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full bg-indigo-50 px-1.5 py-0.5 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-300"
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
