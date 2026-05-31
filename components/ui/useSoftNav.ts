'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useState, useTransition } from 'react';

/**
 * 软导航 —— 把整页 `<a href>` 硬跳转（重载 HTML/JS/CSS、重建一切，慢且无反馈）
 * 替换为 App Router 的客户端导航。
 *
 * - `router.push` 包在 `startTransition` 中 → 非阻塞、可中断，旧 UI 在数据加载期间保持可交互。
 * - `pendingHref` 暴露「正在前往的目标」→ 调用方在点击瞬间即可乐观高亮该项，
 *   彻底消除「点了没反应」的卡顿感（视觉零延迟）。
 * - 建议配合 `<Link prefetch>` 使用：prefetch 预热目标的 RSC 负载，命中时切换近乎瞬时。
 */
export function useSoftNav() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  const navigate = useCallback(
    (href: string) => {
      setPendingHref(href);
      startTransition(() => {
        router.push(href);
      });
    },
    [router],
  );

  return { navigate, isPending, pendingHref };
}

/**
 * 仅在「普通左键点击」时拦截走软导航；带修饰键 / 中键的点击放行给浏览器，
 * 保留「在新标签打开」「另存为」等原生行为与无障碍语义。
 */
export function isPlainLeftClick(e: React.MouseEvent): boolean {
  return (
    e.button === 0 &&
    !e.defaultPrevented &&
    !e.metaKey &&
    !e.ctrlKey &&
    !e.shiftKey &&
    !e.altKey
  );
}
