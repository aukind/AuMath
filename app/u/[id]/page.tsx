// 公开用户主页（RSC）。任何人可见，仅展示论坛维度数据（发帖/回复/获赞 + 近期动态）。
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft, Infinity as InfinityIcon, Settings } from 'lucide-react';
import ThemeToggle from '@/components/ThemeToggle';
import ProfileStatCards from '@/components/profile/ProfileStatCards';
import ActivityFeed from '@/components/dashboard/ActivityFeed';
import { getPublicProfile } from '@/app/actions/user-profile';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await getPublicProfile(id);
  return {
    title: profile ? `${profile.username} 的主页 · AuMath` : '用户主页 · AuMath',
  };
}

function Avatar({ name, url }: { name: string; url?: string }) {
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt={name} className="h-16 w-16 rounded-full object-cover ring-2 ring-white dark:ring-zinc-800" />;
  }
  return (
    <span className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 text-2xl font-bold text-white">
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

export default async function PublicProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await getPublicProfile(id);
  if (!profile) notFound();

  // 判断是否本人，决定是否显示「编辑资料」入口
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const isSelf = user?.id === profile.userId;

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
          <Avatar name={profile.username} url={profile.avatarUrl} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-xl font-bold text-zinc-900 dark:text-zinc-50">{profile.username}</h1>
              {profile.role === 'admin' && (
                <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-900 dark:text-amber-200">
                  管理员
                </span>
              )}
            </div>
            <p className="mt-0.5 text-sm text-zinc-400">社区成员</p>
          </div>
          {isSelf && (
            <Link
              href="/account"
              className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              <Settings size={13} /> 编辑资料
            </Link>
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
    </div>
  );
}
