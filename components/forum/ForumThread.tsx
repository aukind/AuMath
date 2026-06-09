'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { toast } from 'sonner';
import { Eye, MessageSquare, Pin, Star } from 'lucide-react';
import type { ForumComment, ForumPost, SessionUser } from '@/types/forum';
import {
  deleteForumPost,
  getForumPost,
  incrementForumView,
  setForumPostFlags,
} from '@/app/actions/forum';
import MathContent from './MathContent';
import CommentSection from './CommentSection';
import PostActions from './PostActions';
import { ReplyProvider } from './ReplyContext';

// ── 带有极客专属头像框的 Avatar 组件 ──
function Avatar({ name, url, role }: { name: string; url?: string; role?: string }) {
  const isAdmin = role === 'admin';
  return (
    <div className="relative inline-flex items-center justify-center shrink-0">
      <div className="relative z-10 flex h-11 w-11 shrink-0 overflow-hidden rounded-full ring-1 ring-zinc-200 dark:ring-zinc-800 bg-zinc-100 dark:bg-zinc-800">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={name} className="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full w-full items-center justify-center bg-gradient-to-br from-indigo-500 to-violet-500 text-lg font-bold text-white">
            {name.slice(0, 1).toUpperCase()}
          </span>
        )}
      </div>
      {isAdmin && (
        <div className="pointer-events-none absolute -inset-[10px] z-20">
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

interface ForumThreadProps {
  postId: string;
  currentUser: SessionUser;
  initialPost?: ForumPost | null;
  initialComments?: ForumComment[];
}

export default function ForumThread({
  postId,
  currentUser,
  initialPost,
  initialComments,
}: ForumThreadProps) {
  const router = useRouter();
  const { data: post, error, isLoading } = useSWR(
    ['forum-post', postId],
    () => getForumPost(postId),
    { fallbackData: initialPost ?? undefined },
  );

  useEffect(() => {
    incrementForumView(postId).catch(() => {});
  }, [postId]);

  if (isLoading && !post) return <div className="p-8 text-center text-sm text-zinc-400">加载帖子中…</div>;
  if (error || !post) return <div className="p-8 text-center text-sm text-red-500">帖子加载失败或不存在。</div>;

  const isAdmin = currentUser?.role === 'admin';
  const canDeletePost = !!currentUser && (isAdmin || currentUser.id === post.author.id);

  const handleFlag = (flags: { isPinned?: boolean; isFeatured?: boolean }, label: string) => {
    setForumPostFlags(postId, flags)
      .then(() => toast.success(label))
      .catch((e) => toast.error(e instanceof Error ? e.message : '操作失败'));
  };

  const handleDeletePost = () => {
    deleteForumPost(postId)
      .then(() => { toast.success('帖子已删除'); router.push('/forum'); })
      .catch((e) => toast.error(e instanceof Error ? e.message : '删除失败'));
  };

  return (
    <ReplyProvider>
      <div className="mx-auto max-w-2xl rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        
        {/* 主贴：对标推特排版 */}
        <article className="border-b border-zinc-100 px-4 py-4 dark:border-zinc-800">
          
          {/* 类似推特的头部：头像 + 用户名 + 时间 */}
          <header className="flex items-center gap-3">
            <Link href={`/u/${post.author.id}`} className="shrink-0 transition-opacity hover:opacity-80">
              <Avatar name={post.author.username} url={post.author.avatarUrl} role={post.author.role} />
            </Link>
            <div className="flex flex-col">
              <div className="flex items-center gap-1.5">
                <Link href={`/u/${post.author.id}`} className="font-bold text-zinc-900 hover:text-indigo-600 hover:underline dark:text-zinc-100 dark:hover:text-indigo-400">
                  {post.author.username}
                </Link>
                {post.author.role === 'admin' && (
                  <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-900 dark:text-amber-200">
                    管理员
                  </span>
                )}
              </div>
              <span className="text-xs text-zinc-500 tabular-nums mt-0.5">
                {new Date(post.createdAt).toLocaleString('zh-CN', {
                  year: 'numeric', month: '2-digit', day: '2-digit',
                  hour: '2-digit', minute: '2-digit', hour12: false
                })}
              </span>
            </div>
          </header>

          {/* 标题与正文（全宽铺开） */}
          <div className="mt-3.5">
            <h1 className="text-lg font-bold text-zinc-900 dark:text-zinc-50 leading-snug">
              {post.title}
            </h1>
            {post.tags.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {post.tags.map((tag) => (
                  <span key={tag} className="rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-600 dark:bg-blue-950 dark:text-blue-300">
                    #{tag}
                  </span>
                ))}
              </div>
            )}
            <div className="mt-3 text-[15px]">
              <MathContent content={post.content} />
            </div>
          </div>

          {/* 底部数据统计与操作 */}
          <div className="mt-4 flex items-center justify-between border-t border-zinc-100 pt-3 text-xs text-zinc-500 dark:border-zinc-800">
            <div className="flex flex-wrap items-center gap-4">
              <span className="inline-flex items-center gap-1.5"><Eye className="h-4 w-4" />{post.viewCount}</span>
              <span className="inline-flex items-center gap-1.5"><MessageSquare className="h-4 w-4" />{post.commentCount}</span>
              <PostActions
                postId={postId}
                initialUpvotes={post.upvotes}
                initialUpvotedByMe={!!post.upvotedByMe}
                initialFavoritedByMe={!!post.favoritedByMe}
                canInteract={!!currentUser}
              />
            </div>
            {(isAdmin || canDeletePost) && (
              <div className="flex gap-3">
                {isAdmin && (
                  <>
                    <button onClick={() => handleFlag({ isPinned: true }, '已置顶')} className="inline-flex items-center gap-1 hover:text-amber-600"><Pin className="h-3.5 w-3.5" />置顶</button>
                    <button onClick={() => handleFlag({ isFeatured: true }, '已加精')} className="inline-flex items-center gap-1 hover:text-emerald-600"><Star className="h-3.5 w-3.5" />加精</button>
                  </>
                )}
                {canDeletePost && (
                  <button onClick={handleDeletePost} className="hover:text-red-600">删帖</button>
                )}
              </div>
            )}
          </div>
        </article>

        {/* 评论区 */}
        <CommentSection postId={postId} currentUser={currentUser} initialComments={initialComments} />
      </div>
    </ReplyProvider>
  );
}