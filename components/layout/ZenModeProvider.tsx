'use client';

// 沉浸阅读模式（Zen Mode）的状态中枢
//
// 设计要点：顶栏渲染在 app/page.tsx、侧栏渲染在 PageLayout，二者并不在同一棵
// React 子树里。为了让它们「都能」响应 Zen 开关，这里采用 next-themes 的同款做法——
// 把 isZenMode 反射成 <html> 上的 .zen-active class，chrome 的淡出/滑走交给
// globals.css 的纯 CSS 规则（[data-zen-chrome]）。React 侧只负责状态与可消费的 hook。

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export interface ZenModeContextType {
  isZenMode: boolean;
  toggleZenMode: () => void;
}

const ZenCtx = createContext<ZenModeContextType | null>(null);

export function ZenModeProvider({ children }: { children: ReactNode }) {
  const [isZenMode, setIsZenMode] = useState(false);

  const toggleZenMode = useCallback(() => setIsZenMode(v => !v), []);

  // 反射到 <html>.zen-active，驱动 globals.css 的 chrome 淡出。
  useEffect(() => {
    const el = document.documentElement;
    el.classList.toggle('zen-active', isZenMode);
    return () => el.classList.remove('zen-active');
  }, [isZenMode]);

  // Esc 退出沉浸模式（仅开启时挂监听）。
  useEffect(() => {
    if (!isZenMode) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsZenMode(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isZenMode]);

  const value = useMemo(
    () => ({ isZenMode, toggleZenMode }),
    [isZenMode, toggleZenMode],
  );

  return <ZenCtx.Provider value={value}>{children}</ZenCtx.Provider>;
}

export function useZenMode(): ZenModeContextType {
  const ctx = useContext(ZenCtx);
  if (!ctx) throw new Error('useZenMode 必须在 <ZenModeProvider> 内使用');
  return ctx;
}
