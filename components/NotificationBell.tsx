import Link from 'next/link';
import { Bell } from 'lucide-react';

/** 顶栏通知入口：铃铛 + 未读数角标。服务端渲染未读数；点击进 /notifications 清未读。 */
export default function NotificationBell({ count }: { count: number }) {
  return (
    <Link
      href="/notifications"
      aria-label={count > 0 ? `通知，${count} 条未读` : '通知'}
      className="relative flex h-9 w-9 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
    >
      <Bell size={18} />
      {count > 0 && (
        <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold tabular-nums text-white">
          {count > 99 ? '99+' : count}
        </span>
      )}
    </Link>
  );
}
