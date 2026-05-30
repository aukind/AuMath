'use client';

import { useState, useTransition } from 'react';
import { BookMarked, MessagesSquare } from 'lucide-react';
import AnimatedTabs, { type TabItem } from '@/components/ui/AnimatedTabs';
import HeavyContentContainer from '@/components/dashboard/HeavyContentContainer';

interface DashboardWorkspaceProps {
  /** RSC 预渲染的「论坛」子树，以 slot 注入后常驻挂载。 */
  forum: React.ReactNode;
  /** RSC 预渲染的「我的题库」子树。 */
  bank: React.ReactNode;
  /** 可覆盖默认 Tab 配置；默认 论坛 / 我的题库。 */
  tabs?: TabItem[];
  /** 初始激活 Tab，默认取首项。 */
  defaultTab?: string;
  /** 切换副作用（如软同步 URL）。同步触发，不进入 transition，不阻塞滑块。 */
  onTabChange?: (tabId: string) => void;
}

const DEFAULT_TABS: TabItem[] = [
  { id: 'forum', label: '论坛', icon: <MessagesSquare /> },
  { id: 'bank', label: '我的题库', icon: <BookMarked /> },
];

/**
 * 右侧内容区的工作台壳子：标签切换状态机 + 并发渲染降级。
 *
 * 双状态拆分是「丝滑」的关键：
 * - `activeTab`（urgent）：点击即同步更新，驱动 AnimatedTabs 滑块——弹簧动画零延迟启动。
 * - `contentTab`（transition）：包在 startTransition 里降级提交，驱动重度容器的显隐切换。
 *
 * 为何即便已 Keep-Alive 仍需 useTransition：把一棵 display:none 的庞大子树
 * （海量 KaTeX/Lexical 节点）切回 visible，会触发一次成本不低的 style/layout 重算。
 * 用 transition 把这次提交标记为可中断的低优先级工作，主线程先把滑块动画与点击反馈跑顺，
 * 再从容地揭示内容；isPending 期间给一点轻微视觉提示，彻底消除「点了没反应」的卡顿感。
 */
export default function DashboardWorkspace({
  forum,
  bank,
  tabs = DEFAULT_TABS,
  defaultTab,
  onTabChange,
}: DashboardWorkspaceProps) {
  const initial = defaultTab ?? tabs[0]?.id ?? '';
  const [activeTab, setActiveTab] = useState(initial);
  const [contentTab, setContentTab] = useState(initial);
  const [isPending, startTransition] = useTransition();

  const handleChange = (tabId: string) => {
    if (tabId === activeTab) return;
    // 1) 立即：滑块瞬间响应（高优先级）+ 同步副作用（URL 软更新）
    setActiveTab(tabId);
    onTabChange?.(tabId);
    // 2) 降级：重度容器显隐切换（可中断的低优先级）
    startTransition(() => {
      setContentTab(tabId);
    });
  };

  return (
    <div>
      <AnimatedTabs tabs={tabs} activeTab={activeTab} onChange={handleChange} />

      {/* isPending 时容器轻微降透明，给到「正在切」的反馈而不阻塞点击 */}
      <div
        className={
          isPending
            ? 'opacity-70 transition-opacity duration-200'
            : 'opacity-100 transition-opacity duration-200'
        }
      >
        <HeavyContentContainer activeTab={contentTab} forum={forum} bank={bank} />
      </div>
    </div>
  );
}
