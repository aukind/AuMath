'use client';

// 磁性悬停包裹器（Magnetic Hover）——
//   · 指针进入元素四周的「引力场」(外扩 range 像素) 时，被包裹元素脱离原位、
//     朝指针方向做平滑位移 (useMotionValue + useSpring，全程走 GPU 合成层，零 React 重渲染)。
//   · 指针离场后弹簧牵引回原点。
//   · 非侵入：children 原样渲染，onClick / href / ref 全保留；监听只挂在外层引力场容器，
//     从不触碰子组件自身的事件回调，比 cloneElement 合并更彻底地杜绝「事件冒泡被吞噬」。
//   · 触控 / 无精确指针 / reduce-motion：剥离全部磁力逻辑，直接渲染原生 children。

import { useEffect, useRef, useState } from 'react';
import { motion, useMotionValue, useSpring, useReducedMotion } from 'framer-motion';

export interface MagneticProps {
  children: React.ReactElement;
  /** 磁力强度，默认 0.3 (0~1)。越大跟手位移越夸张。 */
  intensity?: number;
  /** 触发引力的外扩像素（引力场半径），默认 20px。 */
  range?: number;
}

// 质感回弹：低阻尼 + 轻质量，离手后「荡」回原点而非生硬归位。
const MAGNETIC_SPRING = { stiffness: 150, damping: 15, mass: 0.1 } as const;

export default function Magnetic({ children, intensity = 0.3, range = 20 }: MagneticProps) {
  const reduce = useReducedMotion();
  // 仅用于一次性「能力探测」，绝非存坐标 —— 坐标全部走下面的 motionValue。
  const [hoverable, setHoverable] = useState(false);

  const innerRef = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const sx = useSpring(x, MAGNETIC_SPRING);
  const sy = useSpring(y, MAGNETIC_SPRING);

  useEffect(() => {
    // 触控设备没有「悬停」物理概念，磁性会导致点击错位 —— 据此降级。
    // 初值 false 与 SSR 一致，挂载后再增强，避免 hydration 不匹配。
    const mq = window.matchMedia('(hover: hover) and (pointer: fine)');
    const sync = () => setHoverable(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  const onMove = (e: React.PointerEvent) => {
    const el = innerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    // 相对「视觉元素中心」的偏移 × 强度，直接 set 进 motionValue —— 不触发任何重渲染。
    x.set((e.clientX - (r.left + r.width / 2)) * intensity);
    y.set((e.clientY - (r.top + r.height / 2)) * intensity);
  };
  const reset = () => {
    x.set(0);
    y.set(0);
  };

  // 降级：无精确指针 / reduce-motion → 零包裹、零监听，原样输出 children。
  if (!hoverable || reduce) return children;

  return (
    <span
      onPointerMove={onMove}
      onPointerLeave={reset}
      // padding 把指针命中区向外扩 range 像素 = 引力场；负 margin 抵消、视觉布局不变。
      // padding 同时充当位移头部空间，元素朝指针移动时不被裁切。
      style={{ display: 'inline-flex', padding: range, margin: -range }}
    >
      <motion.div
        ref={innerRef}
        style={{ x: sx, y: sy, display: 'inline-flex' }}
        className="will-change-transform"
      >
        {children}
      </motion.div>
    </span>
  );
}
