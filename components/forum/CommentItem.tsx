'use client';

// 单条一级回复（楼）+ 其楼中楼（二级回复）。
//
// 关键交互：
//   - 「回复」按钮只调用 openReply()，把单例编辑器移动过来，绝不在此挂载 Lexical。
//   - 楼中楼默认折叠，仅展示前 N 条，其余以「展开其余 X 条回复」按钮按需显示。
//   - 点赞为乐观更新：本地立即 +1，失败由上层回滚（见 CommentSection）。

import { memo, useState } from 'react';
import Link from 'next/link';
import { ChevronDown, MessageSquare, ThumbsUp } from 'lucide-react';
import type { ForumComment, SessionUser, SubComment } from '@/types/forum';
import MathContent from './MathContent';
import { useReply } from './ReplyContext';

/** 二级回复默认展示条数，超出折叠。 */
const SUBCOMMENT_PREVIEW = 2;

function initials(name: string): string {
  return name.slice(0, 1).toUpperCase();
}

function formatTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return '刚刚';
  if (mins < 60) return `${mins} 分钟前`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} 小时前`;
  return new Date(iso).toLocaleDateString('zh-CN');
}

function Avatar({ name, url }: { name: string; url?: string }) {
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt={name} className="h-8 w-8 rounded-full object-cover" />;
  }
  return (
    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 text-sm font-medium text-blue-700 dark:bg-blue-900 dark:text-blue-200">
      {initials(name)}
    </span>
  );
}

function RoleBadge({ role }: { role: 'admin' | 'user' }) {
  if (role !== 'admin') return null;
  return (
    <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-900 dark:text-amber-200">
      管理员
    </span>
  );
}

function SubCommentRow({
  sub,
  postId,
  parentId,
  replyToUsername,
  currentUser,
}: {
  sub: SubComment;
  postId: string;
  parentId: string;
  replyToUsername?: string;
  currentUser: SessionUser;
}) {
  const { openReply } = useReply();
  return (
    <div className="flex gap-2 py-1.5">
      <Link
        href={`/u/${sub.author.id}`}
        className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-xs font-medium text-zinc-600 transition-opacity hover:opacity-80 dark:bg-zinc-800 dark:text-zinc-300"
      >
        {initials(sub.author.username)}
      </Link>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-xs">
          <Link href={`/u/${sub.author.id}`} className="font-medium text-zinc-800 hover:underline dark:text-zinc-200">
            {sub.author.username}
          </Link>
          <RoleBadge role={sub.author.role} />
          {replyToUsername && (
            <>
              <span className="text-zinc-400">回复</span>
              <span className="text-blue-600 dark:text-blue-400">@{replyToUsername}</span>
            </>
          )}
          <span className="text-zinc-400">· {formatTime(sub.createdAt)}</span>
        </div>
        <MathContent content={sub.content} className="text-sm" />
        {currentUser && (
          <button
            type="button"
            onClick={() =>
              openReply({
                kind: 'sub',
                postId,
                parentId,
                replyToUserId: sub.author.id,
                replyToUsername: sub.author.username,
              })
            }
            className="mt-0.5 text-xs text-zinc-400 hover:text-blue-600"
          >
            回复
          </button>
        )}
      </div>
    </div>
  );
}

interface CommentItemProps {
  comment: ForumComment;
  currentUser: SessionUser;
  /** 乐观点赞：本地立即 +1，由上层负责落库与回滚。 */
  onUpvote: (commentId: string) => void;
  /** 删除评论（作者本人或管理员；权限最终由 RLS 把关）。 */
  onAdminAction?: (action: 'delete', commentId: string) => void;
}

function CommentItem({ comment, currentUser, onUpvote, onAdminAction }: CommentItemProps) {
  const { openReply } = useReply();
  const [expanded, setExpanded] = useState(false);

  const subs = comment.subComments;
  const visibleSubs = expanded ? subs : subs.slice(0, SUBCOMMENT_PREVIEW);
  const hiddenCount = subs.length - visibleSubs.length;

  // 解析「回复 @某人」：在同层子评论 + 楼主里按 id 找用户名。
  const nameById = new Map<string, string>([[comment.author.id, comment.author.username]]);
  subs.forEach((s) => nameById.set(s.author.id, s.author.username));

  const isAdmin = currentUser?.role === 'admin';
  const canDelete = !!currentUser && (isAdmin || currentUser.id === comment.author.id);

  return (
    <article className="border-b border-zinc-100 px-4 py-3 dark:border-zinc-800">
      <header className="flex items-center gap-2">
        <Link href={`/u/${comment.author.id}`} className="shrink-0 transition-opacity hover:opacity-80">
          <Avatar name={comment.author.username} url={comment.author.avatarUrl} />
        </Link>
        <div className="flex flex-col">
          <div className="flex items-center gap-1.5">
            <Link href={`/u/${comment.author.id}`} className="text-sm font-medium text-zinc-900 hover:underline dark:text-zinc-100">
              {comment.author.username}
            </Link>
            <RoleBadge role={comment.author.role} />
          </div>
          <span className="text-xs text-zinc-400">{formatTime(comment.createdAt)}</span>
        </div>
        {canDelete && onAdminAction && (
          <div className="ml-auto flex gap-1 text-xs">
            <button
              onClick={() => onAdminAction('delete', comment.id)}
              className="text-zinc-400 hover:text-red-600"
            >
              删除
            </button>
          </div>
        )}
      </header>

      <div className="mt-2 pl-10">
        <MathContent content={comment.content} />

        <div className="mt-2 flex items-center gap-4 text-sm text-zinc-500">
          <button
            type="button"
            onClick={() => onUpvote(comment.id)}
            disabled={!currentUser}
            className="inline-flex items-center gap-1 hover:text-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <ThumbsUp className="h-4 w-4" />
            <span>{comment.upvotes}</span>
          </button>
          <button
            type="button"
            onClick={() =>
              openReply({
                kind: 'comment',
                postId: comment.postId,
                parentId: comment.id,
                replyToUsername: comment.author.username,
              })
            }
            disabled={!currentUser}
            className="inline-flex items-center gap-1 hover:text-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <MessageSquare className="h-4 w-4" />
            <span>回复{subs.length > 0 ? ` · ${subs.length}` : ''}</span>
          </button>
        </div>

        {/* 楼中楼 */}
        {subs.length > 0 && (
          <div className="mt-2 rounded-md bg-zinc-50 px-3 py-1 dark:bg-zinc-800/50">
            {visibleSubs.map((sub) => (
              <SubCommentRow
                key={sub.id}
                sub={sub}
                postId={comment.postId}
                parentId={comment.id}
                replyToUsername={sub.replyToUserId ? nameById.get(sub.replyToUserId) : undefined}
                currentUser={currentUser}
              />
            ))}
            {hiddenCount > 0 && (
              <button
                type="button"
                onClick={() => setExpanded(true)}
                className="inline-flex items-center gap-1 py-1.5 text-xs font-medium text-blue-600 hover:text-blue-700"
              >
                <ChevronDown className="h-3.5 w-3.5" />
                展开其余 {hiddenCount} 条回复
              </button>
            )}
          </div>
        )}
      </div>
    </article>
  );
}

// 列表项必 memo：虚拟滚动频繁触发父级重渲染，避免无谓的子树 diff。
export default memo(CommentItem);
