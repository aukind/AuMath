'use client';

import { Drawer } from 'vaul';
import { Menu, PenLine } from 'lucide-react';
import SidebarTabs from '@/components/SidebarTabs';
import type { TopicWithChildren, PaperRow } from '@/types/database';

interface MobileMenuDrawerProps {
  topics: TopicWithChildren[];
  papers: PaperRow[];
  selectedTopicId?: string;
  selectedPaperId?: string;
  isAdmin: boolean;
  hasFilter: boolean;
}

export default function MobileMenuDrawer({
  topics,
  papers,
  selectedTopicId,
  selectedPaperId,
  isAdmin,
  hasFilter,
}: MobileMenuDrawerProps) {
  return (
    <Drawer.Root direction="left">
      {/* 汉堡触发按钮（仅移动端可见） */}
      <Drawer.Trigger asChild>
        <button
          className="lg:hidden flex items-center justify-center w-11 h-11 rounded-lg text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          aria-label="打开导航菜单"
        >
          <Menu size={20} />
        </button>
      </Drawer.Trigger>

      <Drawer.Portal>
        {/* 半透明遮罩（点击关闭） */}
        <Drawer.Overlay className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]" />

        {/* 抽屉主面板：从左侧滑入，宽度 85vw，高全屏 */}
        <Drawer.Content
          className={[
            'fixed left-0 top-0 z-50 h-full w-[85vw] max-w-sm flex flex-row',
            'bg-white dark:bg-zinc-900 shadow-2xl outline-none',
          ].join(' ')}
        >
          {/* 主内容列 */}
          <div className="flex flex-col flex-1 min-w-0">
            {/* 顶栏标题 */}
            <div className="flex items-center px-4 h-14 border-b border-zinc-200 dark:border-zinc-800 shrink-0">
              <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">导航目录</span>
            </div>

            {/* 可滚动内容区：data-vaul-no-drag 允许内部正常滚动，不触发关闭手势 */}
            <div
              className="flex flex-col flex-1 gap-3 px-3 py-4 overflow-y-auto"
              data-vaul-no-drag
              style={{ WebkitOverflowScrolling: 'touch' }}
            >
              <SidebarTabs
                topics={topics}
                papers={papers}
                selectedTopicId={selectedTopicId}
                selectedPaperId={selectedPaperId}
                isAdmin={isAdmin}
              />

              <a
                href="/"
                className="flex items-center gap-1.5 text-xs font-medium text-zinc-600 hover:text-indigo-600 dark:text-zinc-300 transition-colors"
              >
                💬 社区论坛
              </a>
              <a
                href="/?view=mybank"
                className="flex items-center gap-1.5 text-xs font-medium text-zinc-600 hover:text-indigo-600 dark:text-zinc-300 transition-colors"
              >
                📚 我的题库
              </a>

              <div className="mt-auto pt-4 border-t border-zinc-100 dark:border-zinc-800 space-y-2">
                {hasFilter && (
                  <a
                    href="/"
                    className="block text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors"
                  >
                    ← 返回全部题目
                  </a>
                )}
                {isAdmin && (
                  <a
                    href="/admin/add"
                    className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                  >
                    <PenLine size={11} /> 录入新题目
                  </a>
                )}
              </div>
            </div>
          </div>

          {/* 右侧竖向拖拽把手：视觉提示"可左划关闭" */}
          <div className="flex items-center justify-center w-5 shrink-0">
            <div className="w-1 h-10 rounded-full bg-zinc-300 dark:bg-zinc-600" />
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
