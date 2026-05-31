'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { UserPlus, UserCheck, Loader2 } from 'lucide-react';
import { toggleFollow } from '@/app/actions/follows';

interface FollowButtonProps {
  targetId: string;
  initialFollowing: boolean;
  /** 未登录则点击跳登录 */
  isLoggedIn: boolean;
}

/**
 * 关注 / 已关注 切换按钮。乐观更新：点击立即翻转状态，失败回滚并提示。
 * 未登录点击 → 跳登录并带 redirectTo 回到当前主页。
 */
export default function FollowButton({ targetId, initialFollowing, isLoggedIn }: FollowButtonProps) {
  const router = useRouter();
  const [following, setFollowing] = useState(initialFollowing);
  const [pending, start] = useTransition();

  const onClick = () => {
    if (!isLoggedIn) {
      router.push(`/login?redirectTo=/u/${targetId}`);
      return;
    }
    const next = !following;
    setFollowing(next); // 乐观
    start(async () => {
      try {
        const r = await toggleFollow(targetId);
        if (r.ok) {
          setFollowing(!!r.following);
        } else {
          setFollowing(!next); // 回滚
          toast.error(r.error ?? '操作失败');
        }
      } catch {
        setFollowing(!next); // 回滚
        toast.error('操作失败，请稍后再试');
      }
    });
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      aria-pressed={following}
      className={[
        'inline-flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-sm font-medium transition-colors disabled:opacity-60',
        following
          ? 'border border-zinc-200 text-zinc-600 hover:border-red-300 hover:text-red-600 dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-red-800 dark:hover:text-red-400'
          : 'bg-indigo-600 text-white hover:bg-indigo-700',
      ].join(' ')}
    >
      {pending ? (
        <Loader2 size={15} className="animate-spin" />
      ) : following ? (
        <UserCheck size={15} />
      ) : (
        <UserPlus size={15} />
      )}
      {following ? '已关注' : '关注'}
    </button>
  );
}
