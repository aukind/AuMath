'use client';

// 帖子级互动：点赞(公开计数) + 收藏(私有书签)。
// 弹窗 PostDetailView 与全页 ForumThread 共用，本地乐观状态由服务端预取的初值播种。

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Bookmark, ThumbsUp } from 'lucide-react';
import { toggleForumPostUpvote, toggleForumPostFavorite } from '@/app/actions/forum';
import SquishyButton from '@/components/motion/SquishyButton';

interface PostActionsProps {
  postId: string;
  initialUpvotes: number;
  initialUpvotedByMe: boolean;
  initialFavoritedByMe: boolean;
  /** 已登录才可互动；未登录点击提示登录 */
  canInteract: boolean;
}

export default function PostActions({
  postId,
  initialUpvotes,
  initialUpvotedByMe,
  initialFavoritedByMe,
  canInteract,
}: PostActionsProps) {
  const [upvotes, setUpvotes] = useState(initialUpvotes);
  const [upvoted, setUpvoted] = useState(initialUpvotedByMe);
  const [favorited, setFavorited] = useState(initialFavoritedByMe);
  const [pending, startTransition] = useTransition();

  const handleUpvote = () => {
    if (!canInteract) {
      toast.error('请先登录后再点赞');
      return;
    }
    const prevUpvoted = upvoted;
    const prevCount = upvotes;
    // 乐观：按当前状态切换 ±1
    setUpvoted(!prevUpvoted);
    setUpvotes(prevCount + (prevUpvoted ? -1 : 1));
    startTransition(async () => {
      try {
        const res = await toggleForumPostUpvote(postId);
        setUpvoted(res.upvoted);
        setUpvotes(res.upvotes);
      } catch {
        setUpvoted(prevUpvoted);
        setUpvotes(prevCount);
        toast.error('点赞失败，已回滚');
      }
    });
  };

  const handleFavorite = () => {
    if (!canInteract) {
      toast.error('请先登录后再收藏');
      return;
    }
    const prev = favorited;
    setFavorited(!prev);
    startTransition(async () => {
      try {
        const res = await toggleForumPostFavorite(postId);
        setFavorited(res.favorited);
        toast.success(res.favorited ? '已收藏' : '已取消收藏');
      } catch {
        setFavorited(prev);
        toast.error('收藏失败，已回滚');
      }
    });
  };

  return (
    <>
      <SquishyButton
        type="button"
        onClick={handleUpvote}
        disabled={pending}
        aria-pressed={upvoted}
        title={upvoted ? '取消点赞' : '点赞'}
        className={[
          'inline-flex items-center gap-1.5 transition-colors disabled:opacity-50',
          upvoted ? 'font-medium text-blue-600 dark:text-blue-400' : 'hover:text-blue-600',
        ].join(' ')}
      >
        <ThumbsUp className="h-4 w-4" fill={upvoted ? 'currentColor' : 'none'} />
        <span className="tabular-nums">{upvotes}</span>
      </SquishyButton>

      <SquishyButton
        type="button"
        onClick={handleFavorite}
        disabled={pending}
        aria-pressed={favorited}
        title={favorited ? '取消收藏' : '收藏此帖'}
        className={[
          'inline-flex items-center gap-1.5 transition-colors disabled:opacity-50',
          favorited ? 'font-medium text-amber-500' : 'hover:text-amber-500',
        ].join(' ')}
      >
        <Bookmark className="h-4 w-4" fill={favorited ? 'currentColor' : 'none'} />
        <span>{favorited ? '已收藏' : '收藏'}</span>
      </SquishyButton>
    </>
  );
}
