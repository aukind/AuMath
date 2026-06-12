'use client';

/**
 * FluidCursor —— 首页「指针流体拖尾」特效层（FluidCursorSim 的 React 包装）。
 *
 * 视觉协议：canvas 固定满屏 pointer-events-none，叠在内容之上（z-35：页面 chrome 之上、
 * 演算板 z-40 / 抽屉弹窗之下），靠 CSS mix-blend-mode 与页面融合——
 *   dark  → screen   ：黑底不可见，染料成霓虹辉光；
 *   light → multiply ：白底不可见，染料成彩墨入水。
 * 文字始终可读（混合只染色不遮挡），特效是瞬态的，几秒内流散消隐。
 *
 * 渐进增强：prefers-reduced-motion / 无 WebGL2 / 无浮点渲染目标 → 不初始化，
 * canvas 保持透明，页面零损失。
 */

import { useEffect, useRef } from 'react';
import { useTheme } from 'next-themes';
import { FluidCursorSim } from './FluidCursorSim';
import { useMounted } from './useClientMotionPrefs';

export default function FluidCursor() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const simRef = useRef<FluidCursorSim | null>(null);
  const { resolvedTheme } = useTheme();
  const light = resolvedTheme !== 'dark';

  // resolvedTheme 在 SSR 恒为 undefined，但客户端注水前脚本已知真实主题——
  // 直接据此渲染内联 style 会令服务端/客户端首帧不一致而触发 hydration 报错，
  // 且失配的 mix-blend-mode 会被 React 焊死在 DOM 上（won't be patched up），
  // 令暗色页面被 multiply×黑底持久压暗，只能靠手动切主题强制重渲染才恢复。
  // 用 mounted 门控：注水前输出确定性中性态（透明、无混合），注水后再随主题切换。
  // 复用 useSyncExternalStore 版 useMounted（勿用 set-state-in-effect，会触 Next16 新规则）。
  const mounted = useMounted();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) return;

    const sim = FluidCursorSim.create(canvas);
    if (!sim) return;
    simRef.current = sim;

    // 进场彩蛋：一波随机泼墨昭示「这页面是活的」，几秒后自行流散
    const burstTimer = window.setTimeout(() => sim.burst(7), 350);

    // 指针拖尾：帧间位移决定注入的力与染料量；色相每 ~600ms 漂移一次
    let lastX = -1;
    let lastY = -1;
    const onPointerMove = (e: PointerEvent) => {
      const x = e.clientX / window.innerWidth;
      const y = 1 - e.clientY / window.innerHeight;
      if (lastX >= 0) {
        const dx = x - lastX;
        const dy = y - lastY;
        if (Math.abs(dx) + Math.abs(dy) > 0.0004) sim.pointerSplat(x, y, dx, dy);
      }
      lastX = x;
      lastY = y;
    };
    // 点击烟花：原地多向迸发
    const onPointerDown = (e: PointerEvent) => {
      const x = e.clientX / window.innerWidth;
      const y = 1 - e.clientY / window.innerHeight;
      for (let i = 0; i < 3; i++) {
        const angle = Math.random() * Math.PI * 2;
        sim.pointerSplat(x, y, Math.cos(angle) * 0.02, Math.sin(angle) * 0.02);
      }
    };

    const onVisibility = () => (document.hidden ? sim.freeze() : sim.wake());
    const onBlur = () => sim.freeze();
    const onFocus = () => sim.wake();
    const onResize = () => sim.resize();

    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerdown', onPointerDown, { passive: true });
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', onFocus);
    window.addEventListener('resize', onResize);

    return () => {
      window.clearTimeout(burstTimer);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('resize', onResize);
      sim.dispose();
      simRef.current = null;
    };
  }, []);

  // 主题切换：染料残留即时换输出模式 + 混合模式
  useEffect(() => {
    simRef.current?.setInvert(light);
  }, [light]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      data-fluid-cursor
      className="pointer-events-none fixed inset-0 z-[35] h-full w-full"
      style={{
        mixBlendMode: mounted ? (light ? 'multiply' : 'screen') : undefined,
        opacity: mounted ? (light ? 0.55 : 0.8) : 0,
      }}
    />
  );
}
