'use client';

/** 工作区内容契约：仅承载当前激活的 tabId。 */
export interface ContentWorkspaceProps {
  activeTab: string;
}

interface HeavyContentContainerProps extends ContentWorkspaceProps {
  /** 「论坛」重度子树（KaTeX 渲染、Lexical 富文本实例等）。建议由 RSC 预渲染后以 slot 注入。 */
  forum: React.ReactNode;
  /** 「我的题库」重度子树（大量公式卡片、虚拟列表等）。 */
  bank: React.ReactNode;
}

/**
 * 伪 Keep-Alive 容器 —— 0ms 秒切的核心。
 *
 * 策略：论坛与题库两棵重度子树「同时常驻挂载」，切换时绝不 Unmount/Mount，
 * 仅用 Tailwind 的 `hidden`（display:none）切换显隐。这样：
 *   1. KaTeX / Lexical 实例只初始化一次，切回时无需重建 → 切换耗时趋近于零。
 *   2. 编辑器草稿、滚动位置、展开状态等局部状态在切换间天然保留。
 *
 * 无障碍与性能细节：
 * - 隐藏面板加 `inert`：移出 Tab 焦点序列、屏蔽指针/读屏，避免 display:none 子树残留可聚焦节点。
 * - 隐藏面板 `aria-hidden`，可见面板 `tabIndex={0}` 并关联对应 `tab-*` 控件。
 * - display:none 子树不参与布局/绘制，常驻挂载的内存代价远小于反复重建的卡顿代价。
 */
export default function HeavyContentContainer({
  activeTab,
  forum,
  bank,
}: HeavyContentContainerProps) {
  const panels: Array<{ id: string; node: React.ReactNode }> = [
    { id: 'forum', node: forum },
    { id: 'bank', node: bank },
  ];

  return (
    <div className="relative mt-4">
      {panels.map(({ id, node }) => {
        const visible = activeTab === id;
        return (
          <section
            key={id}
            id={`panel-${id}`}
            role="tabpanel"
            aria-labelledby={`tab-${id}`}
            aria-hidden={!visible}
            // @ts-expect-error inert 在 React 19 中受支持，类型声明仍偏保守
            inert={visible ? undefined : ''}
            tabIndex={visible ? 0 : -1}
            className={visible ? 'outline-none' : 'hidden'}
          >
            {node}
          </section>
        );
      })}
    </div>
  );
}
