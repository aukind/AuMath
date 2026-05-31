import { FileText, MessageSquareReply, ThumbsUp } from 'lucide-react';
import type { PublicProfileStats } from '@/types/dashboard';

type IconType = React.ComponentType<{ size?: number | string; className?: string }>;

interface Card {
  key: keyof PublicProfileStats;
  label: string;
  hint: string;
  icon: IconType;
  accent: string;
}

const CARDS: Card[] = [
  { key: 'posts', label: '发帖', hint: '发起的主题讨论', icon: FileText, accent: 'text-indigo-500 dark:text-indigo-400' },
  { key: 'replies', label: '回复', hint: '参与讨论的回复', icon: MessageSquareReply, accent: 'text-sky-500 dark:text-sky-400' },
  { key: 'likes', label: '获赞', hint: '收到的社区点赞', icon: ThumbsUp, accent: 'text-violet-500 dark:text-violet-400' },
];

/**
 * 公开主页的论坛统计卡片（发帖 / 回复 / 获赞）。
 * 复用控制台卡片的视觉语言：1px 柔边 + 等宽数字。
 */
export default function ProfileStatCards({ stats }: { stats: PublicProfileStats }) {
  return (
    <section aria-label="论坛数据" className="grid grid-cols-3 gap-3 sm:gap-4">
      {CARDS.map(({ key, label, hint, icon: Icon, accent }) => {
        const value = stats[key];
        const active = value > 0;
        return (
          <div
            key={key}
            className="rounded-xl border border-zinc-200 bg-white p-4 transition-colors hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900/40 dark:hover:border-zinc-700 sm:p-5"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400 sm:text-sm">{label}</span>
              <Icon size={16} className={active ? accent : 'text-zinc-300 dark:text-zinc-600'} />
            </div>
            <div className="mt-2 text-2xl font-bold tabular-nums tracking-tight text-zinc-900 dark:text-zinc-50 sm:mt-3 sm:text-3xl">
              {value.toLocaleString('zh-CN')}
            </div>
            <p className="mt-1 text-[11px] text-zinc-400 dark:text-zinc-600 sm:text-xs">{hint}</p>
          </div>
        );
      })}
    </section>
  );
}
