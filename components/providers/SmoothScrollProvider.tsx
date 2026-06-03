'use client';

// 全局平滑滚动 —— Lenis 物理阻尼接管全站滚轮。
// 现代 `lenis` 包（非已废弃的 @studio-freight/react-lenis）：root 模式直接附着
// documentElement，不 transform <body>，所以 position:fixed 的模态弹窗依旧安全。
// 模态展开时由 PostDetailView/QuestionDetailView 通过 useLenis().stop()/start() 锁定。

import { ReactLenis } from 'lenis/react';
import { useReducedMotion } from 'framer-motion';

export interface SmoothScrollProviderProps {
  children: React.ReactNode;
}

export default function SmoothScrollProvider({ children }: SmoothScrollProviderProps) {
  // 尊重「减弱动态效果」：退化为原生即时滚动，避免眩晕。
  const reduce = useReducedMotion();

  return (
    <ReactLenis
      root
      options={{
        smoothWheel: !reduce,
        duration: reduce ? 0 : 1.0,
        // 触摸交给原生（保留 iOS 惯性）；桌面端由 smoothWheel 接管。
        syncTouch: false,
        // 关键：默认 false 时 Lenis(root) 会吞掉所有内层 overflow-y-auto 的滚轮，
        // 导致社区资源/侧栏/评论区/抽屉等内层容器滚不动，须逐个加 data-lenis-prevent。
        // 开启后 Lenis 自动放行可滚动的嵌套容器走原生滚动，触底再交回文档 —— 一劳永逸。
        allowNestedScroll: true,
      }}
    >
      {children}
    </ReactLenis>
  );
}
