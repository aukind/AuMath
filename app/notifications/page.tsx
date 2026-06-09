// 通知中心（RSC）。进入即把未读全部标记为已读。未登录跳登录。
import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  ChevronLeft,
  Infinity as InfinityIcon,
  Bell,
  MessageSquarePlus,
  MessageSquareReply,
  ThumbsUp,
  UserPlus,
} from 'lucide-react';
import ThemeToggle from '@/components/ThemeToggle';
import { formatRelativeTime } from '@/lib/utils/datetime';
import { getNotifications, markAllNotificationsRead, type NotificationItem } from '@/app/actions/notifications';
import { createClient } from '@/lib/supabase/server';
import { imgTransform } from '@/lib/supabase/imageTransform';

export const dynamic = 'force-dynamic';
export const metadata = { title: '通知 · AuMath' };

type IconType = React.ComponentType<{ size?: number | string; className?: string }>;

const TYPE_META: Record<NotificationItem['type'], { icon: IconType; color: string; verb: string }> = {
  reply_post: { icon: MessageSquarePlus, color: 'text-indigo-500', verb: '回复了你的帖子' },
  reply_comment: { icon: MessageSquareReply, color: 'text-sky-500', verb: '回复了你' },
  like: { icon: ThumbsUp, color: 'text-violet-500', verb: '赞了你的回复' },
  follow: { icon: UserPlus, color: 'text-emerald-500', verb: '关注了你' },
};

function Avatar({ name, url }: { name: string; url?: string }) {
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={imgTransform(url, { width: 128 })} alt={name} className="h-9 w-9 rounded-full object-cover" />;
  }
  return (
    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 text-sm font-bold text-white">
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

export default async function NotificationsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?redirectTo=/notifications');

  const items = await getNotifications();
  // 进入即清未读
  await markAllNotificationsRead();

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <header className="sticky top-0 z-30 border-b border-zinc-200 bg-white/80 backdrop-blur-sm dark:border-zinc-800 dark:bg-zinc-900/80">
        <div className="mx-auto flex h-14 max-w-2xl items-center gap-3 px-4">
          <Link href="/" className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">
            <ChevronLeft size={16} /> 返回社区
          </Link>
          <Link href="/" className="ml-auto flex items-center gap-1.5">
            <InfinityIcon className="h-5 w-5 stroke-[1.5] text-indigo-600 dark:text-indigo-400" />
            <span className="bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-sm font-extrabold tracking-tight text-transparent dark:from-indigo-400 dark:to-purple-400">
              AuMath
            </span>
          </Link>
          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-8">
        <h1 className="mb-5 flex items-center gap-2 text-xl font-bold text-zinc-900 dark:text-zinc-50">
          <Bell size={20} className="text-indigo-500" /> 通知
        </h1>

        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-zinc-300 px-6 py-16 text-center dark:border-zinc-700">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100 dark:bg-zinc-800">
              <Bell size={22} className="text-zinc-400" />
            </div>
            <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">还没有通知</h2>
            <p className="max-w-xs text-sm text-zinc-400">当有人回复、点赞或关注你时，会出现在这里。</p>
          </div>
        ) : (
          <ul className="space-y-2">
            {items.map((n) => {
              const meta = TYPE_META[n.type];
              const Icon = meta.icon;
              const href = n.type === 'follow' ? `/u/${n.actor.id}` : n.postId ? `/forum/${n.postId}` : `/u/${n.actor.id}`;
              return (
                <li key={n.id}>
                  <Link
                    href={href}
                    className={[
                      'flex items-start gap-3 rounded-xl border px-4 py-3 transition-colors',
                      n.read
                        ? 'border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900'
                        : 'border-indigo-200 bg-indigo-50/50 dark:border-indigo-900/60 dark:bg-indigo-950/20',
                    ].join(' ')}
                  >
                    <div className="relative shrink-0">
                      <Avatar name={n.actor.username} url={n.actor.avatarUrl} />
                      <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-white ring-2 ring-white dark:bg-zinc-900 dark:ring-zinc-900">
                        <Icon size={12} className={meta.color} />
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-zinc-800 dark:text-zinc-200">
                        <span className="font-semibold">{n.actor.username}</span> {meta.verb}
                      </p>
                      {n.postTitle && (
                        <p className="mt-0.5 truncate text-xs text-zinc-400">《{n.postTitle}》</p>
                      )}
                      <p className="mt-0.5 text-xs text-zinc-400 tabular-nums">{formatRelativeTime(n.createdAt)}</p>
                    </div>
                    {!n.read && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-indigo-500" />}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </div>
  );
}
