import { redirect } from 'next/navigation';
import { getUserProfile } from '@/app/actions/user-profile';
import { getDailyQuestion } from '@/app/actions/daily';
import { getWorkspaceCounts } from '@/app/actions/user-workspace';
import { formatJoinDate } from '@/lib/utils/datetime';
import DashboardLayout from '@/components/dashboard/DashboardLayout';
import ActivityFeed from '@/components/dashboard/ActivityFeed';
import DailyChallengeCard from '@/components/dashboard/DailyChallengeCard';
import { STAT_TILES, StatTile } from '@/components/dashboard/UserStatsOverview';
import { SpotlightProvider, BentoCard } from '@/components/ui/BentoGrid';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: '控制台 · AuMath',
  description: '你的数学学习总控中心',
};

/** 数据簇三张小卡的网格跨度：前两张 1 格，第三张占满右侧 2 格。 */
const STAT_SPAN = ['lg:col-span-1', 'lg:col-span-1', 'lg:col-span-2'] as const;

export default async function DashboardPage() {
  // 并行取数，避免顺序瀑布。
  const [profile, daily, counts] = await Promise.all([
    getUserProfile(),
    getDailyQuestion(),
    getWorkspaceCounts().catch(() => ({ favorites: 0, errors: 0, history: 0 })),
  ]);

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

      {/*
        Bento 非对称网格 + 统一光晕引擎。
        移动端：flex-col 纵向流（col-span 失效，卡片全宽堆叠，光晕自动关闭）。
        lg 起：4 列网格——
          ┌ Hero 2×2 ┬ stat1 ┬ stat2 ┐
          │          ├ stat3（宽 2）  ┤
          ├ ActivityFeed（宽 4）      ┤
        自动布局（DOM 顺序 Hero→stat1→stat2→stat3→Feed）即得上图排布。
      */}
      <SpotlightProvider className="flex flex-col gap-4 lg:grid lg:auto-rows-[minmax(9.5rem,auto)] lg:grid-cols-4">
        {/* 大视野（2×2）：今日挑战 + 错题角标 + 极弱网格纹理 */}
        <BentoCard className="bento-grid-texture lg:col-span-2 lg:row-span-2">
          <DailyChallengeCard question={daily.question} errorsCount={counts.errors} />
        </BentoCard>

        {/* 数据簇：三张独立小卡 */}
        {STAT_TILES.map((config, i) => (
          <BentoCard key={config.key} className={STAT_SPAN[i]}>
            <StatTile config={config} value={profile.stats[config.key]} />
          </BentoCard>
        ))}

        {/* 动态流：底部铺开 */}
        <BentoCard className="lg:col-span-4">
          <ActivityFeed items={profile.recentActivities} />
        </BentoCard>
      </SpotlightProvider>
    </DashboardLayout>
  );
}
