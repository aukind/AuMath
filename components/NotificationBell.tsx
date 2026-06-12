'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Bell } from 'lucide-react';
import Magnetic from '@/components/motion/Magnetic';
import SquishyButton from '@/components/motion/SquishyButton';
import { getUnreadNotificationCount } from '@/app/actions/notifications';

/**
 * 顶栏通知入口：铃铛 + 未读数角标。
 * <Magnetic>(磁性悬停) 套 <SquishyButton>(果冻点击) 组合套用。点击进 /notifications 清未读。
 *
 * 未读数活性：服务端算好的 count 只是初值快照；挂载后每 60s 轮询一次，
 * 且窗口重新可见 / 聚焦时立即刷新 —— 不刷新页面也能看到新通知（对标主流社区站）。
 * 后台标签页跳过轮询（document.hidden），不浪费请求。
 */
const POLL_INTERVAL_MS = 60_000;

export default function NotificationBell({ count: initialCount }: { count: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const [count, setCount] = useState(initialCount);
  const inflight = useRef(false);

  // 服务端重渲染（如导航后）带来更新的初值时同步——渲染期调整派生状态，不进 effect
  const [prevInitial, setPrevInitial] = useState(initialCount);
  if (prevInitial !== initialCount) {
    setPrevInitial(initialCount);
    setCount(initialCount);
  }

  // 进通知页即视为已读：本地立即清零角标，避免「点进去了角标还挂着」
  const [prevPath, setPrevPath] = useState(pathname);
  if (prevPath !== pathname) {
    setPrevPath(pathname);
    if (pathname === '/notifications') setCount(0);
  }

  useEffect(() => {
    let cancelled = false;

    async function refresh() {
      if (inflight.current || document.hidden) return;
      inflight.current = true;
      try {
        const n = await getUnreadNotificationCount();
        if (!cancelled) setCount(n);
      } catch {
        // 网络抖动忽略，下个周期再试
      } finally {
        inflight.current = false;
      }
    }

    const timer = setInterval(refresh, POLL_INTERVAL_MS);
    const onVisible = () => {
      if (!document.hidden) refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, []);

  return (
    <Magnetic intensity={0.4} range={24}>
      <SquishyButton
        type="button"
        aria-label={count > 0 ? `通知，${count} 条未读` : '通知'}
        onClick={() => router.push('/notifications')}
        className="relative flex h-9 w-9 items-center justify-center rounded-lg text-zinc-500 outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:text-zinc-400"
      >
        <Bell size={18} />
        {count > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold tabular-nums text-white">
            {count > 99 ? '99+' : count}
          </span>
        )}
      </SquishyButton>
    </Magnetic>
  );
}
