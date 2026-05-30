'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Infinity as InfinityIcon, LayoutDashboard, BookMarked, MessagesSquare, Settings } from 'lucide-react';

/** lucide 图标的最小 Props 约束，避免依赖具体版本导出的 LucideIcon 类型 */
type IconType = React.ComponentType<{ size?: number | string; className?: string; strokeWidth?: number }>;

interface NavItem {
  href: string;
  label: string;
  icon: IconType;
  /** 该路径的子路由也视为激活（如 /forum/xxx） */
  matchPrefix?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard', label: '控制台', icon: LayoutDashboard },
  { href: '/?bank=private', label: '我的题库', icon: BookMarked },
  { href: '/forum', label: '论坛', icon: MessagesSquare, matchPrefix: true },
  { href: '/dashboard/settings', label: '设置', icon: Settings, matchPrefix: true },
];

interface SidebarNavProps {
  /** 移动端抽屉内点击导航后关闭抽屉 */
  onNavigate?: () => void;
}

export default function SidebarNav({ onNavigate }: SidebarNavProps) {
  const pathname = usePathname();

  const isActive = (item: NavItem): boolean => {
    const path = item.href.split('?')[0];
    if (path === '/dashboard') return pathname === '/dashboard';
    if (item.matchPrefix) return pathname === path || pathname.startsWith(`${path}/`);
    return pathname === path;
  };

  return (
    <div className="flex flex-col h-full">
      {/* ── 品牌区 ── */}
      <Link
        href="/"
        onClick={onNavigate}
        className="flex items-center gap-2 px-3 h-14 shrink-0 border-b border-zinc-200 dark:border-zinc-800"
      >
        <InfinityIcon className="w-5 h-5 stroke-[1.5] text-indigo-600 dark:text-indigo-400" />
        <span className="font-extrabold tracking-tight text-sm text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-purple-600 dark:from-indigo-400 dark:to-purple-400">
          AuMath
        </span>
        <span className="ml-1 text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400">
          控制台
        </span>
      </Link>

      {/* ── 主导航 ── */}
      <nav aria-label="控制台导航" className="flex flex-col gap-0.5 p-3">
        {NAV_ITEMS.map((item) => {
          const active = isActive(item);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? 'page' : undefined}
              className={[
                'group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
                active
                  ? 'bg-zinc-100 dark:bg-zinc-800/70 font-semibold text-zinc-900 dark:text-zinc-50'
                  : 'font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100/70 dark:hover:bg-zinc-800/40 hover:text-zinc-900 dark:hover:text-zinc-200',
              ].join(' ')}
            >
              {/* 激活指示条（GitHub 风格的左侧 accent） */}
              <span
                aria-hidden
                className={[
                  'absolute left-0 top-1/2 -translate-y-1/2 h-5 w-0.5 rounded-full bg-indigo-500 transition-opacity',
                  active ? 'opacity-100' : 'opacity-0',
                ].join(' ')}
              />
              <Icon
                size={16}
                className={
                  active
                    ? 'text-indigo-600 dark:text-indigo-400'
                    : 'text-zinc-400 dark:text-zinc-500 group-hover:text-zinc-600 dark:group-hover:text-zinc-300'
                }
              />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
