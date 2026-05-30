'use client';

import { useState } from 'react';
import { Drawer } from 'vaul';
import { Menu, Infinity as InfinityIcon } from 'lucide-react';
import ThemeToggle from '@/components/ThemeToggle';
import SidebarNav from '@/components/dashboard/SidebarNav';

interface DashboardLayoutProps {
  children: React.ReactNode;
}

/**
 * 控制台整体布局壳子。
 * - 桌面端（lg+）：固定在左侧的 SidebarNav，内容区让出 64 (16rem) 的内边距。
 * - 移动端（<lg）：顶部 AppBar + 汉堡键唤出的左侧抽屉（vaul 自动锁定 body 滚动、
 *   陷阱焦点、支持 ESC 与左划关闭），避免滚动穿透。
 *
 * children 作为 RSC 透传：统计卡片与动态流保持服务端渲染。
 */
export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="min-h-screen bg-white text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      {/* ── 桌面端固定侧边栏 ── */}
      <aside className="hidden lg:flex lg:flex-col lg:fixed lg:inset-y-0 lg:left-0 lg:w-64 border-r border-zinc-200 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-900/40 backdrop-blur-sm">
        <SidebarNav />
        <div className="mt-auto flex items-center justify-between gap-2 px-4 py-3 border-t border-zinc-200 dark:border-zinc-800">
          <span className="text-[11px] text-zinc-400 dark:text-zinc-600">外观</span>
          <ThemeToggle />
        </div>
      </aside>

      {/* ── 内容列（桌面端让出侧栏宽度） ── */}
      <div className="lg:pl-64">
        {/* 移动端顶部栏 */}
        <header className="lg:hidden sticky top-0 z-30 flex items-center gap-3 px-4 h-14 border-b border-zinc-200 dark:border-zinc-800 bg-white/80 dark:bg-zinc-950/80 backdrop-blur-sm">
          <Drawer.Root direction="left" open={open} onOpenChange={setOpen}>
            <Drawer.Trigger asChild>
              <button
                className="flex items-center justify-center w-10 h-10 -ml-1.5 rounded-lg text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                aria-label="打开导航菜单"
              >
                <Menu size={20} />
              </button>
            </Drawer.Trigger>

            <Drawer.Portal>
              <Drawer.Overlay className="fixed inset-0 z-40 bg-black/50 backdrop-blur-[2px]" />
              <Drawer.Content
                className="fixed left-0 top-0 z-50 h-full w-[82vw] max-w-xs flex flex-row bg-white dark:bg-zinc-900 shadow-2xl outline-none"
              >
                <Drawer.Title className="sr-only">控制台导航</Drawer.Title>
                <div className="flex flex-col flex-1 min-w-0">
                  <SidebarNav onNavigate={() => setOpen(false)} />
                  <div className="mt-auto flex items-center justify-between gap-2 px-4 py-3 border-t border-zinc-200 dark:border-zinc-800">
                    <span className="text-[11px] text-zinc-400 dark:text-zinc-600">外观</span>
                    <ThemeToggle />
                  </div>
                </div>
                {/* 右侧把手：提示可左划关闭 */}
                <div className="flex items-center justify-center w-5 shrink-0">
                  <div className="w-1 h-10 rounded-full bg-zinc-300 dark:bg-zinc-600" />
                </div>
              </Drawer.Content>
            </Drawer.Portal>
          </Drawer.Root>

          <div className="flex items-center gap-2">
            <InfinityIcon className="w-5 h-5 stroke-[1.5] text-indigo-600 dark:text-indigo-400" />
            <span className="font-extrabold tracking-tight text-sm text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-purple-600 dark:from-indigo-400 dark:to-purple-400">
              AuMath
            </span>
          </div>

          <div className="ml-auto">
            <ThemeToggle />
          </div>
        </header>

        <main className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-10 py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
