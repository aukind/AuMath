'use client';

// 论坛详情页顶层容器。
//   - SWR 拉取主贴（ForumPost），以 RSC 预取数据作首屏，渲染标题/标签/作者/正文。
//   - ReplyProvider 包裹整棵树，使主贴与所有评论共享同一个单例回复编辑器。
//   - 管理员可置顶/加精/删帖；作者可删自己的帖（权限由 RLS 兜底）。

import { useEffect } from 'react';
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
import { ReplyProvider } from './ReplyContext';

interface ForumThreadProps {
  postId: string;
  /** 当前登录态；访客为 null（只读，无发帖/回复/点赞按钮）。 */
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

  // 进入详情页计一次浏览数（fire-and-forget，失败无所谓）。
  useEffect(() => {
    incrementForumView(postId).catch(() => {});
  }, [postId]);

  if (isLoading && !post) {
    return <div className="p-8 text-center text-sm text-zinc-400">加载帖子中…</div>;
  }
  if (error || !post) {
    return <div className="p-8 text-center text-sm text-red-500">帖子加载失败或不存在。</div>;
  }

  const isAdmin = currentUser?.role === 'admin';
  const canDeletePost = !!currentUser && (isAdmin || currentUser.id === post.author.id);

  const handleFlag = (flags: { isPinned?: boolean; isFeatured?: boolean }, label: string) => {
    setForumPostFlags(postId, flags)
      .then(() => toast.success(label))
      .catch((e) => toast.error(e instanceof Error ? e.message : '操作失败'));
  };

  const handleDeletePost = () => {
    deleteForumPost(postId)
      .then(() => {
        toast.success('帖子已删除');
        router.push('/forum');
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : '删除失败'));
  };

  return (
    <ReplyProvider>
      <div className="mx-auto max-w-2xl rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        {/* 主贴 */}
        <article className="border-b border-zinc-100 px-4 py-4 dark:border-zinc-800">
          <h1 className="text-lg font-bold text-zinc-900 dark:text-zinc-50">{post.title}</h1>

          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
            <span className="font-medium text-zinc-700 dark:text-zinc-300">{post.author.username}</span>
            <span>· {new Date(post.createdAt).toLocaleString('zh-CN')}</span>
            <span className="inline-flex items-center gap-1"><Eye className="h-3.5 w-3.5" />{post.viewCount}</span>
            <span className="inline-flex items-center gap-1"><MessageSquare className="h-3.5 w-3.5" />{post.commentCount}</span>
          </div>

          {post.tags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {post.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-600 dark:bg-blue-950 dark:text-blue-300"
                >
                  #{tag}
                </span>
              ))}
            </div>
          )}

          <div className="mt-3">
            <MathContent content={post.content} />
          </div>

          {/* 管理员 / 作者操作 */}
          {(isAdmin || canDeletePost) && (
            <div className="mt-3 flex gap-3 border-t border-zinc-100 pt-2 text-xs text-zinc-500 dark:border-zinc-800">
              {isAdmin && (
                <>
                  <button onClick={() => handleFlag({ isPinned: true }, '已置顶')} className="inline-flex items-center gap-1 hover:text-amber-600">
                    <Pin className="h-3.5 w-3.5" />置顶
                  </button>
                  <button onClick={() => handleFlag({ isFeatured: true }, '已加精')} className="inline-flex items-center gap-1 hover:text-emerald-600">
                    <Star className="h-3.5 w-3.5" />加精
                  </button>
                </>
              )}
              {canDeletePost && (
                <button onClick={handleDeletePost} className="hover:text-red-600">删帖</button>
              )}
            </div>
          )}
        </article>

        {/* 评论区（含单例回复编辑器） */}
        <CommentSection postId={postId} currentUser={currentUser} initialComments={initialComments} />
      </div>
    </ReplyProvider>
  );
}
