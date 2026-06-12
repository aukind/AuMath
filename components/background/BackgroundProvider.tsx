'use client';

/**
 * BackgroundProvider —— 全站「呼吸态流体光晕」的客户端外壳。
 *
 *  - 主题源：接入 next-themes 的 resolvedTheme（用户手动切深浅色时光晕同步过渡）。
 *  - Prefers Reduced Motion（需求阶段四·3）：检测到「减弱动态」→ 根本不挂载 WebGL Canvas，
 *    降级为纯 CSS radial-gradient 静态背景，避免引发晕动症。
 *  - 懒加载：非 reduce 时用 next/dynamic({ ssr:false }) 按需挂载 AmbientFluid，
 *    three/@react-three/fiber 不进首屏关键包、不阻塞首屏与 SEO。
 *
 * 容器统一 `fixed inset-0 -z-10 pointer-events-none`：画在 body 不透明底色之上、
 * 内容（data-app-shell）之下，绝不阻挡任何 DOM 交互。`data-ambient-aura` 供 Zen Mode
 * 的 globals.css 钩子淡出。
 */

import dynamic from 'next/dynamic';
import { useSyncExternalStore } from 'react';
import { useTheme } from 'next-themes';

// three 较大，按需懒加载；SSR 关闭（WebGL 仅在浏览器可用）
const AmbientFluid = dynamic(() => import('./AmbientFluid'), { ssr: false });

const WRAPPER_CLASS = 'fixed inset-0 -z-10 pointer-events-none';

// 与 shader 调色板一致的极淡 CSS 渐变，用于 reduced-motion 静态降级
const STATIC_GRADIENT: Record<'light' | 'dark', string> = {
  light: [
    'radial-gradient(120% 120% at 15% 10%, #eef2ff 0%, rgba(238,242,255,0) 45%)',
    'radial-gradient(120% 120% at 85% 25%, #faf5ff 0%, rgba(250,245,255,0) 50%)',
    'radial-gradient(140% 140% at 50% 100%, #ecfeff 0%, rgba(236,254,255,0) 55%)',
    '#ffffff',
  ].join(','),
  dark: [
    'radial-gradient(120% 120% at 15% 10%, #0c0c16 0%, rgba(12,12,22,0) 45%)',
    'radial-gradient(120% 120% at 85% 25%, #100b1c 0%, rgba(16,11,28,0) 50%)',
    'radial-gradient(140% 140% at 50% 100%, #0a1016 0%, rgba(10,16,22,0) 55%)',
    '#0a0a0a',
  ].join(','),
};

// ── 外部系统订阅（useSyncExternalStore，替代 effect 里同步 setState）──────────
// 水合检测：服务端快照恒 false，客户端快照恒 true，挂载后 React 自动补一次渲染。
const emptySubscribe = () => () => {};

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';
function subscribeReducedMotion(onChange: () => void) {
  const mq = window.matchMedia(REDUCED_MOTION_QUERY);
  mq.addEventListener('change', onChange);
  return () => mq.removeEventListener('change', onChange);
}

export default function BackgroundProvider() {
  const { resolvedTheme } = useTheme();
  const theme: 'light' | 'dark' = resolvedTheme === 'dark' ? 'dark' : 'light';

  const mounted = useSyncExternalStore(emptySubscribe, () => true, () => false);
  const reduced = useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia(REDUCED_MOTION_QUERY).matches,
    () => false,
  );

  // 水合前不渲染：body 的 var(--background) 已铺满正确主题底色，无空白/CLS，
  // 也避免 resolvedTheme 未定时的亮/暗错配闪烁。
  if (!mounted) return null;

  // 减弱动态：纯 CSS 静态渐变，绝不挂载 Canvas
  if (reduced) {
    return (
      <div
        aria-hidden
        data-ambient-aura
        className={WRAPPER_CLASS}
        style={{ background: STATIC_GRADIENT[theme] }}
      />
    );
  }

  return (
    <div aria-hidden data-ambient-aura className={WRAPPER_CLASS}>
      <AmbientFluid theme={theme} />
    </div>
  );
}
