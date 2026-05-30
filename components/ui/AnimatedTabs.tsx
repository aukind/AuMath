'use client';

import { useId } from 'react';
import { motion, LayoutGroup } from 'framer-motion';

/** 单个标签项。icon 可选，传入任意 ReactNode（建议 lucide 图标）。 */
export interface TabItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
}

export interface AnimatedTabsProps {
  tabs: TabItem[];
  activeTab: string;
  onChange: (tabId: string) => void;
  className?: string;
}

/** 物理弹簧：高级回弹手感，瞬时启动、快速收敛、无拖尾。 */
const SPRING = { type: 'spring', stiffness: 500, damping: 30 } as const;

const cx = (...c: Array<string | false | undefined>) => c.filter(Boolean).join(' ');

/**
 * Vercel/Linear 风格的「Magic Tab」。
 *
 * 关键交互：
 * - 选中态背景滑块通过共享的 `layoutId` 在按钮之间做布局动画（弹簧），点击瞬间开始位移。
 * - 滑块为 `absolute inset-0`，完全脱离文档流 —— 不挤压任何兄弟节点，从根上杜绝布局跳动。
 * - 外层 `LayoutGroup` 用 useId 生成的命名空间隔离 layoutId，支持页面内多实例并存。
 * - 容器 `motion.div` 标记 `layoutRoot`：把它设为子级布局投影的测量原点，
 *   即便外层处于可滚动/transform 容器中，滑块也不会因祖先变换而漂移或抖动。
 *
 * 纯受控组件：自身不持有 activeTab，重渲染优先级（useTransition）交由父级掌控。
 */
export default function AnimatedTabs({
  tabs,
  activeTab,
  onChange,
  className,
}: AnimatedTabsProps) {
  const groupId = useId();
  const indicatorId = `tab-indicator-${groupId}`;

  return (
    <LayoutGroup id={groupId}>
      <motion.div
        layoutRoot
        role="tablist"
        aria-orientation="horizontal"
        className={cx(
          'relative inline-flex items-center gap-1 rounded-xl p-1',
          'border border-zinc-200 bg-zinc-100/80 backdrop-blur-sm',
          'dark:border-zinc-800 dark:bg-zinc-900/60',
          className,
        )}
      >
        {tabs.map((tab) => {
          const isActive = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`tab-${groupId}-${tab.id}`}
              aria-selected={isActive}
              aria-controls={`panel-${tab.id}`}
              tabIndex={isActive ? 0 : -1}
              onClick={() => onChange(tab.id)}
              className={cx(
                'relative z-10 inline-flex select-none items-center gap-1.5 rounded-lg px-3.5 py-1.5',
                'text-sm font-medium outline-none transition-colors duration-150',
                'focus-visible:ring-2 focus-visible:ring-indigo-500/60',
                isActive
                  ? 'text-zinc-900 dark:text-zinc-50'
                  : 'text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200',
              )}
            >
              {/* 滑块只渲染在激活按钮内；切换时 framer-motion 依据 layoutId 做位移动画 */}
              {isActive && (
                <motion.span
                  aria-hidden
                  layoutId={indicatorId}
                  transition={SPRING}
                  className={cx(
                    'absolute inset-0 -z-10 rounded-lg',
                    'bg-white shadow-sm ring-1 ring-zinc-200',
                    'dark:bg-zinc-800 dark:shadow-none dark:ring-zinc-700',
                  )}
                />
              )}
              {tab.icon && (
                <span className="grid h-4 w-4 place-items-center [&>svg]:h-4 [&>svg]:w-4">
                  {tab.icon}
                </span>
              )}
              {tab.label}
            </button>
          );
        })}
      </motion.div>
    </LayoutGroup>
  );
}
