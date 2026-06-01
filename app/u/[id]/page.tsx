// 公开用户主页（RSC）。任何人可见，仅展示论坛维度数据（发帖/回复/获赞 + 近期动态）。
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Toaster } from 'sonner';
import { ChevronLeft, Infinity as InfinityIcon, Settings } from 'lucide-react';
import ThemeToggle from '@/components/ThemeToggle';
import ProfileStatCards from '@/components/profile/ProfileStatCards';
import ActivityFeed from '@/components/dashboard/ActivityFeed';
import FollowButton from '@/components/profile/FollowButton';
import { getPublicProfile } from '@/app/actions/user-profile';
import { getFollowCounts, isFollowing } from '@/app/actions/follows';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await getPublicProfile(id);
  return {
    title: profile ? `${profile.username} 的主页 · AuMath` : '用户主页 · AuMath',
  };
}

function Avatar({ name, url, role }: { name: string; url?: string; role?: string }) {
  const isAdmin = role === 'admin';

  return (
    <div className="relative inline-flex items-center justify-center">
      {/* --- 头像本体 --- */}
      <div className="relative z-10 flex h-16 w-16 shrink-0 overflow-hidden rounded-full ring-2 ring-white dark:ring-zinc-800">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={name} className="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full w-full items-center justify-center bg-gradient-to-br from-indigo-500 to-violet-500 text-2xl font-bold text-white">
            {name.slice(0, 1).toUpperCase()}
          </span>
        )}
      </div>

      {/* --- 专属头像框 (Z-Index 盖在上面，且忽略鼠标事件) --- */}
      {isAdmin && (
        <div className="pointer-events-none absolute -inset-[14px] z-20">
          {/* 这里我用一段代码生成了一个极客风的动态 SVG 头像框 */}
          <svg
            viewBox="0 0 100 100"
            className="h-full w-full animate-[spin_10s_linear_infinite]"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <defs>
              <linearGradient id="au-admin-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#818cf8" />   {/* indigo-400 */}
                <stop offset="50%" stopColor="#c084fc" />  {/* purple-400 */}
                <stop offset="100%" stopColor="#f472b6" /> {/* pink-400 */}
              </linearGradient>
            </defs>
            {/* 外层断点光环 */}
            <circle
              cx="50"
              cy="50"
              r="47"
              stroke="url(#au-admin-grad)"
              strokeWidth="1.5"
              strokeDasharray="40 10 15 10"
              strokeLinecap="round"
              className="opacity-80"
            />
            {/* 内层装饰点 */}
            <circle cx="10" cy="50" r="2" fill="#818cf8" />
            <circle cx="90" cy="50" r="2" fill="#f472b6" />
          </svg>
        </div>
      )}
    </div>
  );
}

export default async function PublicProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await getPublicProfile(id);
  if (!profile) notFound();

  // 判断是否本人；并行取关注态与关注/粉丝数
  const supabase = await createClient();
  const [{ data: { user } }, counts, viewerFollows] = await Promise.all([
    supabase.auth.getUser(),
    getFollowCounts(profile.userId),
    isFollowing(profile.userId),
  ]);
  const isSelf = user?.id === profile.userId;
  const isLoggedIn = !!user;

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

      <main className="mx-auto max-w-2xl space-y-8 px-4 py-8">
        {/* 资料头部 */}
        <div className="flex items-center gap-4">
         <Avatar name={profile.username} url={profile.avatarUrl} role={profile.role} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-xl font-bold text-zinc-900 dark:text-zinc-50">{profile.username}</h1>
              {profile.role === 'admin' && (
                <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-900 dark:text-amber-200">
                  管理员
                </span>
              )}
            </div>
            {profile.userNo !== null && (
              <p className="mt-0.5 select-text text-xs text-zinc-500 dark:text-zinc-400">
                UID: <span className="font-medium tabular-nums text-zinc-700 dark:text-zinc-300">{profile.userNo}</span>
              </p>
            )}
            <p className="mt-1 flex items-center gap-3 text-sm text-zinc-500 dark:text-zinc-400">
              <Link href={`/u/${profile.userId}/following`} className="hover:text-zinc-800 dark:hover:text-zinc-200">
                <span className="font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">{counts.following}</span> 关注
              </Link>
              <Link href={`/u/${profile.userId}/followers`} className="hover:text-zinc-800 dark:hover:text-zinc-200">
                <span className="font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">{counts.followers}</span> 粉丝
              </Link>
            </p>
          </div>
          {isSelf ? (
            <Link
              href="/account"
              className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              <Settings size={13} /> 编辑资料
            </Link>
          ) : (
            <FollowButton targetId={profile.userId} initialFollowing={viewerFollows} isLoggedIn={isLoggedIn} />
          )}
        </div>

        {/* 论坛统计 */}
        <ProfileStatCards stats={profile.stats} />

        {/* 近期动态 */}
        {profile.recentActivities.length > 0 ? (
          <ActivityFeed items={profile.recentActivities} />
        ) : (
          <section aria-label="近期动态" className="space-y-4">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">近期动态</h2>
            </div>
            <div className="rounded-xl border border-dashed border-zinc-300 px-6 py-12 text-center text-sm text-zinc-400 dark:border-zinc-700">
              {profile.username} 还没有公开的论坛动态。
            </div>
          </section>
        )}
      </main>
      <Toaster richColors position="top-center" />
    </div>
  );
}
