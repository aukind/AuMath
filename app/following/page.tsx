// 「我的关注」列表（RSC）。未登录跳登录。
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Toaster } from 'sonner';
import { ChevronLeft, Infinity as InfinityIcon, Users, Compass, Activity, MessageSquarePlus } from 'lucide-react';
import ThemeToggle from '@/components/ThemeToggle';
import FollowButton from '@/components/profile/FollowButton';
import { formatRelativeTime } from '@/lib/utils/datetime';
import { getMyFollowing, getFollowingFeed } from '@/app/actions/follows';
import { createClient } from '@/lib/supabase/server';
import { imgTransform } from '@/lib/supabase/imageTransform';

export const dynamic = 'force-dynamic';
export const metadata = { title: '我的关注 · AuMath' };

function Avatar({ name, url }: { name: string; url?: string }) {
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={imgTransform(url, { width: 128 })} alt={name} className="h-10 w-10 rounded-full object-cover" />;
  }
  return (
    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 text-base font-bold text-white">
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

export default async function FollowingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?redirectTo=/following');

  const [following, feed] = await Promise.all([getMyFollowing(), getFollowingFeed()]);

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
          <Users size={20} className="text-indigo-500" /> 我的关注
          {following.length > 0 && (
            <span className="text-sm font-medium text-zinc-400 tabular-nums">{following.length}</span>
          )}
        </h1>

        {following.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-zinc-300 px-6 py-16 text-center dark:border-zinc-700">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100 dark:bg-zinc-800">
              <Users size={22} className="text-zinc-400" />
            </div>
            <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">还没有关注任何人</h2>
            <p className="max-w-xs text-sm text-zinc-400">在论坛点开感兴趣的用户头像或名字，进入主页即可关注。</p>
            <Link
              href="/"
              className="mt-1 inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700"
            >
              <Compass size={15} /> 去社区逛逛
            </Link>
          </div>
        ) : (
          <div className="space-y-8">
            {/* 关注动态：关注的人最近发的帖子 */}
            {feed.length > 0 && (
              <section className="space-y-3">
                <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  <Activity size={15} className="text-indigo-500" /> 关注动态
                </h2>
                <ul className="space-y-2">
                  {feed.map((p) => (
                    <li key={p.id}>
                      <Link
                        href={`/forum/${p.id}`}
                        className="block rounded-xl border border-zinc-200 bg-white px-4 py-3 transition-colors hover:border-indigo-300 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-indigo-700"
                      >
                        <div className="flex items-center gap-1.5 text-xs text-zinc-400">
                          <MessageSquarePlus size={12} className="text-indigo-400" />
                          <span className="font-medium text-zinc-600 dark:text-zinc-300">{p.author.username}</span>
                          <span>发帖 · {formatRelativeTime(p.createdAt)}</span>
                        </div>
                        <p className="mt-1 truncate font-medium text-zinc-900 dark:text-zinc-100">{p.title}</p>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* 我关注的人（可取关） */}
            <section className="space-y-3">
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">我关注的人</h2>
              <ul className="space-y-2">
                {following.map((u) => (
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
                <FollowButton targetId={u.id} initialFollowing isLoggedIn />
              </li>
                ))}
              </ul>
            </section>
          </div>
        )}
      </main>
      <Toaster richColors position="top-center" />
    </div>
  );
}
