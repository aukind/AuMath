'use client';

import { useRouter } from 'next/navigation';
import { Bell } from 'lucide-react';
import Magnetic from '@/components/motion/Magnetic';
import SquishyButton from '@/components/motion/SquishyButton';

/**
 * 顶栏通知入口：铃铛 + 未读数角标。
 * 重构示范 —— <Magnetic>(磁性悬停) 套 <SquishyButton>(果冻点击) 组合套用，
 * 彻底替代原先生硬的 CSS hover/active 伪类。点击进 /notifications 清未读。
 * 注：count 仍由服务端计算后作为可序列化 prop 传入，本组件只是新增客户端交互边界。
 */
export default function NotificationBell({ count }: { count: number }) {
  const router = useRouter();

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
