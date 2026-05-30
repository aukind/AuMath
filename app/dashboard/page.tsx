import { redirect } from 'next/navigation';
import { getUserProfile } from '@/app/actions/user-profile';
import { formatJoinDate } from '@/lib/utils/datetime';
import DashboardLayout from '@/components/dashboard/DashboardLayout';
import UserStatsOverview from '@/components/dashboard/UserStatsOverview';
import ActivityFeed from '@/components/dashboard/ActivityFeed';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: '控制台 · AuMath',
  description: '你的数学学习总控中心',
};

export default async function DashboardPage() {
  const profile = await getUserProfile();
  if (!profile) redirect('/login');

  const joinedAt = formatJoinDate(profile.joinDate);

  return (
    <DashboardLayout>
      {/* ── 页头问候 ── */}
      <header className="mb-8">
        <h1 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
          你好，{profile.username}
        </h1>
        {joinedAt && (
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            加入于 {joinedAt} · 欢迎回到学习总控中心
          </p>
        )}
      </header>

      {/* ── 统计概览 ── */}
      <UserStatsOverview stats={profile.stats} />

      {/* ── 动态时间线 ── */}
      <div className="mt-10">
        <ActivityFeed items={profile.recentActivities} />
      </div>
    </DashboardLayout>
  );
}
