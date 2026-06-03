'use client';

// 评论区：虚拟滚动 + SWR 缓存 + 乐观更新闭环。
//
// 长列表渲染：热门帖动辄上百条回复，用 @tanstack/react-virtual 只渲染视口内的行，
// 配合 measureElement 做动态高度测量（楼中楼展开后行高变化也能正确重排）。
//
// 乐观更新（边缘异常 #3）：发表/点赞先本地上屏，后端报错（如违禁词/无权限）时
// SWR rollbackOnError 自动回滚，并弹 Toast 提示；编辑器内容保留以便用户修改重试。

import { useCallback, useRef } from 'react';
import useSWR from 'swr';
import { useVirtualizer } from '@tanstack/react-virtual';
import { toast } from 'sonner';
import type { ForumComment, ReplyTarget, SessionUser } from '@/types/forum';
import {
  deleteForumComment,
  getForumComments,
  submitForumReply,
  toggleForumUpvote,
} from '@/app/actions/forum';
import CommentItem from './CommentItem';
import FloatingReplyEditor from './FloatingReplyEditor';
import { useReply } from './ReplyContext';

interface CommentSectionProps {
  postId: string;
  currentUser: SessionUser;
  /** RSC 预取的评论，作为 SWR 首屏数据，避免客户端二次加载闪烁。 */
  initialComments?: ForumComment[];
}

export default function CommentSection({
  postId,
  currentUser,
  initialComments,
}: CommentSectionProps) {
  const { openReply, closeReply } = useReply();
  const parentRef = useRef<HTMLDivElement | null>(null);

  const swrKey = ['forum-comments', postId] as const;
  const { data: comments = [], mutate, isLoading } = useSWR(
    swrKey,
    () => getForumComments(postId),
    { fallbackData: initialComments },
  );

  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Virtual 句柄无法被 memo，官方推荐忽略此告警
  const virtualizer = useVirtualizer({
    count: comments.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 160, // 初始估值；真实高度由 measureElement 回填
    overscan: 6,
  });

  // -------- 乐观提交（新回复 / 楼中楼）--------
  const handleSubmit = useCallback(
    async (target: ReplyTarget, serializedJson: string) => {
      if (!currentUser) return;

      const tempId = `temp_${Date.now()}`;
      const applyOptimistic = (cur: ForumComment[] = []): ForumComment[] => {
        if (target.kind === 'post') {
          const optimistic: ForumComment = {
            id: tempId,
            postId,
            content: serializedJson,
            author: currentUser,
            createdAt: new Date().toISOString(),
            upvotes: 0,
            subComments: [],
          };
          return [...cur, optimistic];
        }
        // 楼中楼：挂到对应一级回复下
        return cur.map((c) =>
          c.id === target.parentId
            ? {
                ...c,
                subComments: [
                  ...c.subComments,
                  {
                    id: tempId,
                    parentId: target.parentId,
                    replyToUserId: target.kind === 'sub' ? target.replyToUserId : undefined,
                    content: serializedJson,
                    author: currentUser,
                    createdAt: new Date().toISOString(),
                  },
                ],
              }
            : c,
        );
      };

      try {
        await mutate(
          async (cur: ForumComment[] = []) => {
            const res = await submitForumReply(target, serializedJson);
            if (res.kind === 'comment') return [...cur, res.data];
            return cur.map((c) =>
              c.id === res.data.parentId
                ? { ...c, subComments: [...c.subComments, res.data] }
                : c,
            );
          },
          {
            optimisticData: applyOptimistic,
            rollbackOnError: true,
            populateCache: true,
            revalidate: false,
          },
        );
        closeReply();
        toast.success('发布成功');
        if (target.kind === 'post') {
          requestAnimationFrame(() =>
            virtualizer.scrollToIndex(comments.length, { align: 'end' }),
          );
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : '发布失败，请重试');
        throw err; // 让编辑器保留内容
      }
    },
    [currentUser, postId, mutate, closeReply, virtualizer, comments.length],
  );

  // -------- 乐观点赞（按当前 upvotedByMe 决定 +1/-1 并翻转高亮）--------
  const handleUpvote = useCallback(
    (commentId: string) => {
      mutate(
        async (cur: ForumComment[] = []) => {
          const { upvotes, upvoted } = await toggleForumUpvote(commentId);
          return cur.map((c) => (c.id === commentId ? { ...c, upvotes, upvotedByMe: upvoted } : c));
        },
        {
          optimisticData: (cur: ForumComment[] = []) =>
            cur.map((c) =>
              c.id === commentId
                ? { ...c, upvotes: c.upvotes + (c.upvotedByMe ? -1 : 1), upvotedByMe: !c.upvotedByMe }
                : c,
            ),
          rollbackOnError: true,
          populateCache: true,
          revalidate: false,
        },
      ).catch(() => toast.error('点赞失败，已回滚'));
    },
    [mutate],
  );

  // -------- 管理员/作者删除评论 --------
  const handleAdminAction = useCallback(
    (action: 'delete', commentId: string) => {
      if (action !== 'delete') return;
      mutate(
        async (cur: ForumComment[] = []) => {
          await deleteForumComment(commentId);
          return cur.filter((c) => c.id !== commentId);
        },
        {
          optimisticData: (cur: ForumComment[] = []) => cur.filter((c) => c.id !== commentId),
          rollbackOnError: true,
          populateCache: true,
          revalidate: false,
        },
      )
        .then(() => toast.success('已删除'))
        .catch(() => toast.error('删除失败，可能无权限'));
    },
    [mutate],
  );

  const items = virtualizer.getVirtualItems();

  return (
    <section className="flex flex-col">
      <div className="flex items-center justify-between px-4 py-2">
        <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">
          全部回复 {comments.length > 0 && `· ${comments.length}`}
        </h2>
        {currentUser ? (
          <button
            type="button"
            onClick={() => openReply({ kind: 'post', postId })}
            className="rounded-md bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700"
          >
            写回复
          </button>
        ) : (
          <a href="/login" className="text-xs text-blue-600 hover:underline">
            登录后参与讨论
          </a>
        )}
      </div>

      {isLoading ? (
        <p className="px-4 py-8 text-center text-sm text-zinc-400">加载回复中…</p>
      ) : comments.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-zinc-400">还没有人回复，来抢沙发～</p>
      ) : (
        <div ref={parentRef} className="max-h-[70vh] overflow-y-auto">
          <div style={{ height: virtualizer.getTotalSize(), position: 'relative', width: '100%' }}>
            {items.map((vItem) => {
              const comment = comments[vItem.index];
              return (
                <div
                  key={comment.id}
                  data-index={vItem.index}
                  ref={virtualizer.measureElement}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${vItem.start}px)`,
                  }}
                >
                  <CommentItem
                    comment={comment}
                    currentUser={currentUser}
                    onUpvote={handleUpvote}
                    onAdminAction={handleAdminAction}
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 全页唯一的回复编辑器实例 */}
      <FloatingReplyEditor onSubmit={handleSubmit} />
    </section>
  );
}
