'use client';

/**
 * Bento Box 网格底层 UI —— 不掺业务逻辑。
 *
 * ┌ SpotlightProvider ── 父级光晕容器：统一下发鼠标坐标，让光晕在整片网格上无缝扫过。
 * └ BentoCard         ── 单个便当盒：承接光晕（背景柔光 + 边框描光），处理 hover 态。
 *
 * 设计要点
 * - 性能：禁止用 useState 监听 mousemove。仅用 useRef + requestAnimationFrame 节流，
 *   直接 el.style.setProperty('--spotlight-x', ...)，零重渲染。
 * - 无缝：父级把「全局指针」换算成「每张卡各自的局部坐标」写进各卡的 CSS 变量，
 *   相邻卡片在交界处同时点亮，杜绝卡片间断层。
 * - 降级：光晕绘制规则全部包在 @media (hover: hover) and (pointer: fine) 内，
 *   触摸设备不绘制任何光晕（消除指针残留/乱跳）；网格在 lg 以下退化为纵向流。
 * - 主题：光晕色用 CSS 变量按 .dark 翻转——亮色仅保留克制的边框微光，暗色背景+边框双现。
 * - 安全：光晕层 pointer-events:none，内容层 relative z-10，绝不遮挡内部 Button/Link。
 */

import { useCallback, useEffect, useRef } from 'react';

/** 类名合并：与项目惯例（components/ui/AnimatedTabs 的 cx）对齐，不引入 cn。 */
const cx = (...c: Array<string | false | null | undefined>) => c.filter(Boolean).join(' ');

export interface SpotlightProviderProps {
  children: React.ReactNode;
  className?: string;
}

export interface BentoCardProps {
  children: React.ReactNode;
  /** 透传网格属性，如 lg:col-span-2 lg:row-span-2 / bento-grid-texture。 */
  className?: string;
  title?: string;
  icon?: React.ReactNode;
}

/**
 * 光晕机理 + 主题色翻转 + 移动端降级 + 网格纹理。
 * 一次性下发；本页仅挂一个 SpotlightProvider，不会重复注入。
 */
const SPOTLIGHT_CSS = `
@media (hover: hover) and (pointer: fine) {
  [data-bento-card] {
    --bento-glow: rgba(0, 0, 0, 0.03);
    --bento-glow-edge: rgba(99, 102, 241, 0.28);
  }
  .dark [data-bento-card] {
    --bento-glow: rgba(255, 255, 255, 0.09);
    --bento-glow-edge: rgba(129, 140, 248, 0.45);
  }
  [data-bento-glow] {
    position: absolute;
    inset: 0;
    border-radius: inherit;
    pointer-events: none;
    opacity: var(--spotlight-on, 0);
    transition: opacity 0.4s ease;
  }
  [data-bento-glow="bg"] {
    background: radial-gradient(
      circle 320px at var(--spotlight-x, 50%) var(--spotlight-y, 50%),
      var(--bento-glow),
      transparent 70%
    );
  }
  [data-bento-glow="edge"] {
    padding: 1px;
    background: radial-gradient(
      circle 320px at var(--spotlight-x, 50%) var(--spotlight-y, 50%),
      var(--bento-glow-edge),
      transparent 60%
    );
    -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
            mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
    -webkit-mask-composite: xor;
            mask-composite: exclude;
  }
}

/* 极弱网格纹理（供 Hero 大卡），与光晕无关、移动端也保留。 */
.bento-grid-texture {
  background-image:
    linear-gradient(to right, rgba(120, 120, 135, 0.06) 1px, transparent 1px),
    linear-gradient(to bottom, rgba(120, 120, 135, 0.06) 1px, transparent 1px);
  background-size: 28px 28px;
}
`;

export function SpotlightProvider({ children, className }: SpotlightProviderProps) {
  const ref = useRef<HTMLDivElement>(null);
  const frame = useRef<number | null>(null);
  const pointer = useRef({ x: 0, y: 0 });

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    pointer.current.x = e.clientX;
    pointer.current.y = e.clientY;
    if (frame.current != null) return; // 每帧最多写一次，杜绝抖动 / 性能损耗
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      const root = ref.current;
      if (!root) return;
      const { x, y } = pointer.current;
      const cards = root.querySelectorAll<HTMLElement>('[data-bento-card]');
      cards.forEach((card) => {
        const r = card.getBoundingClientRect();
        // 全局指针 → 该卡局部坐标：相邻卡在交界处同时亮起，无缝过渡。
        card.style.setProperty('--spotlight-x', `${x - r.left}px`);
        card.style.setProperty('--spotlight-y', `${y - r.top}px`);
        card.style.setProperty('--spotlight-on', '1');
      });
    });
  }, []);

  const handleMouseLeave = useCallback(() => {
    const root = ref.current;
    if (!root) return;
    // 离开容器：透明度归零，借 CSS transition 平滑消散。
    root
      .querySelectorAll<HTMLElement>('[data-bento-card]')
      .forEach((card) => card.style.setProperty('--spotlight-on', '0'));
  }, []);

  useEffect(
    () => () => {
      if (frame.current != null) cancelAnimationFrame(frame.current);
    },
    [],
  );

  return (
    <div ref={ref} onMouseMove={handleMouseMove} onMouseLeave={handleMouseLeave} className={className}>
      {/* style 默认 display:none，不占网格单元 */}
      <style dangerouslySetInnerHTML={{ __html: SPOTLIGHT_CSS }} />
      {children}
    </div>
  );
}

export function BentoCard({ children, className, title, icon }: BentoCardProps) {
  const hasHeader = Boolean(title || icon);
  return (
    <div
      data-bento-card
      className={cx(
        'group relative overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800',
        'bg-white dark:bg-zinc-900/50 shadow-sm transition-colors duration-300',
        'hover:border-zinc-300 dark:hover:border-zinc-700',
        className,
      )}
    >
      {/* 光晕层：背景柔光 + 边框描光。pointer-events:none，绝不拦截内部交互。 */}
      <span data-bento-glow="bg" aria-hidden="true" />
      <span data-bento-glow="edge" aria-hidden="true" />

      {/* 内容层始终高于光晕 */}
      <div className="relative z-10 flex h-full flex-col p-5">
        {hasHeader && (
          <div className="mb-3 flex items-center gap-2">
            {icon && <span className="text-zinc-400 dark:text-zinc-500">{icon}</span>}
            {title && (
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{title}</h2>
            )}
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
