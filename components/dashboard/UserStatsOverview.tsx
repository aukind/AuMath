import { Target, Trophy, Flame } from 'lucide-react';
import type { UserStats } from '@/types/dashboard';

type IconType = React.ComponentType<{ size?: number | string; className?: string }>;

export interface StatTileConfig {
  key: keyof UserStats;
  label: string;
  hint: string;
  icon: IconType;
  suffix?: string;
  /** 数值 > 0 时图标的强调色 */
  accent: string;
}

export const STAT_TILES: StatTileConfig[] = [
  { key: 'totalSolved', label: '攻克难题', hint: '累计练习的题目', icon: Target, accent: 'text-indigo-500 dark:text-indigo-400' },
  { key: 'forumReputation', label: '论坛声望', hint: '社区贡献值', icon: Trophy, accent: 'text-violet-500 dark:text-violet-400' },
  { key: 'streakDays', label: '连续学习', hint: '坚持的天数', icon: Flame, suffix: '天', accent: 'text-amber-500 dark:text-amber-400' },
];

/**
 * 单个统计的纯展示内容（无卡片外壳——外壳由 BentoCard 提供）。
 * 数字使用 tabular-nums 保证等宽对齐；图标按 value 是否 > 0 切换强调色。
 */
export function StatTile({ config, value }: { config: StatTileConfig; value: number }) {
  const { label, hint, icon: Icon, suffix, accent } = config;
  const active = value > 0;
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-zinc-500 dark:text-zinc-400">{label}</span>
        <Icon size={16} className={active ? accent : 'text-zinc-300 dark:text-zinc-600'} />
      </div>
      <div className="mt-3 flex items-baseline gap-1">
        <span className="text-3xl font-bold tabular-nums tracking-tight text-zinc-900 dark:text-zinc-50">
          {value.toLocaleString('zh-CN')}
        </span>
        {suffix && <span className="text-sm font-medium text-zinc-400 dark:text-zinc-500">{suffix}</span>}
      </div>
      <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-600">{hint}</p>
    </div>
  );
}

/**
 * 兼容旧用法：自带 3 列网格 + 卡片外壳。
 * 新版 Dashboard 改用 STAT_TILES + StatTile 拼进 BentoCard，本组件保留以防其它引用。
 */
export default function UserStatsOverview({ stats }: { stats: UserStats }) {
  return (
    <section aria-label="学习数据概览" className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      {STAT_TILES.map((config) => (
        <div
          key={config.key}
          className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/40 p-5 transition-colors hover:border-zinc-300 dark:hover:border-zinc-700"
        >
          <StatTile config={config} value={stats[config.key]} />
        </div>
      ))}
    </section>
  );
}
