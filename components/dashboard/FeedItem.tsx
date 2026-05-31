import { CheckCircle2, MessageSquarePlus, MessageSquareReply, BadgeCheck } from 'lucide-react';
import { formatRelativeTime } from '@/lib/utils/datetime';
import type { ActivityFeedItem, ActivityType } from '@/types/dashboard';

type IconType = React.ComponentType<{ size?: number | string; className?: string }>;

interface TypeMeta {
  icon: IconType;
  /** 图标节点配色：文字色 + 浅底（暗色下半透明） */
  node: string;
}

const TYPE_META: Record<ActivityType, TypeMeta> = {
  solved_problem: {
    icon: CheckCircle2,
    node: 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10',
  },
  created_post: {
    icon: MessageSquarePlus,
    node: 'text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-500/10',
  },
  replied: {
    icon: MessageSquareReply,
    node: 'text-sky-600 dark:text-sky-400 bg-sky-50 dark:bg-sky-500/10',
  },
  earned_badge: {
    icon: BadgeCheck,
    node: 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10',
  },
};

interface FeedItemProps {
  item: ActivityFeedItem;
  /** 最后一条不再向下绘制连接线 */
  isLast: boolean;
}

/**
 * 时间线单条动态。左侧图标节点压在贯穿细线之上（以页面背景色描边「切断」线条），
 * 右侧为标题 / 描述 / 关联节点 / 相对时间。
 */
export default function FeedItem({ item, isLast }: FeedItemProps) {
  const meta = TYPE_META[item.type];
  const Icon = meta.icon;
  const time = formatRelativeTime(item.timestamp);

  return (
    <li className="relative flex gap-4 pb-6 last:pb-0">
      {/* 贯穿连接线（最后一条隐藏） */}
      {!isLast && (
        <span
          aria-hidden
          className="absolute left-4 top-8 -bottom-0 w-px -translate-x-1/2 bg-zinc-200 dark:bg-zinc-800"
        />
      )}

      {/* 图标节点 */}
      <span
        className={[
          'relative z-10 flex items-center justify-center w-8 h-8 shrink-0 rounded-full',
          'ring-4 ring-white dark:ring-zinc-950',
          meta.node,
        ].join(' ')}
      >
        <Icon size={15} />
      </span>

      {/* 内容 */}
      <div className="min-w-0 flex-1 pt-0.5">
        <div className="flex items-start justify-between gap-3">
          <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 leading-snug">
            {item.title}
          </p>
          {time && (
            <time
              dateTime={item.timestamp}
              className="shrink-0 text-xs text-zinc-400 dark:text-zinc-600 tabular-nums pt-0.5"
            >
              {time}
            </time>
          )}
        </div>
        <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400 truncate">
          {item.description}
        </p>
        <span className="mt-2 inline-flex items-center max-w-full rounded-md border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 px-2 py-0.5 text-xs font-medium text-zinc-500 dark:text-zinc-400">
          <span className="truncate">{item.repoOrTopic}</span>
        </span>
      </div>
    </li>
  );
}
