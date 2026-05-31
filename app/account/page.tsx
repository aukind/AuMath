// 账号中心（RSC）。未登录跳登录页。
// 集学习概览（攻克难题 / 论坛声望 / 连续学习）+ 近期动态 + 账号设置于一页，对所有登录用户开放。
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Toaster } from 'sonner';
import { ChevronLeft, Infinity as InfinityIcon, UserSquare } from 'lucide-react';
import ThemeToggle from '@/components/ThemeToggle';
import AccountSettings from '@/components/account/AccountSettings';
import UserStatsOverview from '@/components/dashboard/UserStatsOverview';
import ActivityFeed from '@/components/dashboard/ActivityFeed';
import { getMyAccount } from '@/app/actions/account';
import { getUserProfile } from '@/app/actions/user-profile';

export const dynamic = 'force-dynamic';

export default async function AccountPage() {
  const [account, profile] = await Promise.all([getMyAccount(), getUserProfile()]);
  if (!account) redirect('/login?redirectTo=/account');

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <header className="sticky top-0 z-30 border-b border-zinc-200 bg-white/80 backdrop-blur-sm dark:border-zinc-800 dark:bg-zinc-900/80">
        <div className="mx-auto flex h-14 max-w-2xl items-center gap-3 px-4">
          <Link href="/" className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">
            <ChevronLeft size={16} /> 返回
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

      <main className="mx-auto max-w-2xl space-y-10 px-4 py-8">
        {/* ── 学习概览 ── */}
        {profile && (
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">你好，{profile.username}</h1>
              <Link
                href={`/u/${account.id}`}
                className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                <UserSquare size={13} /> 我的公开主页
              </Link>
            </div>
            <UserStatsOverview stats={profile.stats} />
          </section>
        )}

        {/* ── 近期动态 ── */}
        {profile && <ActivityFeed items={profile.recentActivities} />}

        {/* ── 账号设置 ── */}
        <section className="space-y-4">
          <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-50">账号设置</h2>
          <AccountSettings account={account} />
        </section>
      </main>
      <Toaster richColors position="top-center" />
    </div>
  );
}
