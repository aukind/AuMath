import Link from 'next/link';
import FollowButton from '@/components/profile/FollowButton';
import type { FollowedUser } from '@/app/actions/follows';

function Avatar({ name, url }: { name: string; url?: string }) {
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt={name} className="h-10 w-10 rounded-full object-cover" />;
  }
  return (
    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 text-base font-bold text-white">
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

interface UserListProps {
  users: FollowedUser[];
  /** 当前登录者已关注的 id 集合，用于每行按钮初始态 */
  followingIds: string[];
  /** 当前登录者 id；用于隐藏对自己的关注按钮 */
  currentUserId?: string;
  isLoggedIn: boolean;
  emptyText: string;
}

/** 用户列表（粉丝/关注共用）：头像+名字进主页，右侧关注按钮（对自己不显示）。 */
export default function UserList({ users, followingIds, currentUserId, isLoggedIn, emptyText }: UserListProps) {
  if (users.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-zinc-300 px-6 py-16 text-center text-sm text-zinc-400 dark:border-zinc-700">
        {emptyText}
      </div>
    );
  }
  const followSet = new Set(followingIds);
  return (
    <ul className="space-y-2">
      {users.map((u) => (
        <li
          key={u.id}
          className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900"
        >
          <Link href={`/u/${u.id}`} className="flex min-w-0 flex-1 items-center gap-3 transition-opacity hover:opacity-80">
            <Avatar name={u.username} url={u.avatarUrl} />
            <span className="flex items-center gap-1.5 truncate">
              <span className="truncate font-medium text-zinc-900 dark:text-zinc-100">{u.username}</span>
              {u.role === 'admin' && (
                <span className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-900 dark:text-amber-200">
                  管理员
                </span>
              )}
            </span>
          </Link>
          {u.id !== currentUserId && (
            <FollowButton targetId={u.id} initialFollowing={followSet.has(u.id)} isLoggedIn={isLoggedIn} />
          )}
        </li>
      ))}
    </ul>
  );
}
