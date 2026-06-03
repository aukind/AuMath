'use client';

// 果冻态物理按钮（Squishy Spring Press）——
//   · 按下 (onPointerDown) 整体迅速缩到 scaleDown；松开走「欠阻尼」弹簧迅速反弹，
//     过冲震荡产生 Q 弹肉感（damping 远小于临界阻尼 → 回弹时越过终点再收敛）。
//   · 高阶非侵入：extends ButtonHTMLAttributes，透传一切原生属性；消费者自带的
//     onPointerDown / Up / Leave / Cancel 会被「合并」(先调用消费者再叠加果冻)，绝不吞事件。
//   · pointer 事件在触屏同样触发 —— 果冻按压无 hover 依赖，移动端保留。
//   · reduce-motion：退化为普通 <button>，仅保留功能、无缩放动画。

import { forwardRef } from 'react';
import { motion, useMotionValue, useSpring, useReducedMotion, type HTMLMotionProps } from 'framer-motion';

export interface SquishyButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
  /** 按下时的缩放比例，默认 0.9。 */
  scaleDown?: number;
  /** 弹簧刚度，默认 400。 */
  stiffness?: number;
  /** 弹簧阻尼，默认 15（欠阻尼 → 营造果冻震荡感）。 */
  damping?: number;
}

const SquishyButton = forwardRef<HTMLButtonElement, SquishyButtonProps>(function SquishyButton(
  {
    children,
    scaleDown = 0.9,
    stiffness = 400,
    damping = 15,
    style,
    disabled,
    onPointerDown,
    onPointerUp,
    onPointerLeave,
    onPointerCancel,
    ...rest
  },
  ref,
) {
  const reduce = useReducedMotion();
  const scale = useMotionValue(1);
  const springScale = useSpring(scale, { stiffness, damping });

  const squish = (to: number) => {
    if (!disabled && !reduce) scale.set(to);
  };

  return (
    <motion.button
      // 公开契约保持 ButtonHTMLAttributes；此处仅消解 framer 对 onAnimationStart/onDrag* 的
      // 同名重定义（CSS 事件 vs 动画生命周期）—— 本组件不使用 animate，二者不会真正冲突。
      {...(rest as HTMLMotionProps<'button'>)}
      ref={ref}
      disabled={disabled}
      // 先调用消费者回调，再叠加果冻形变 —— 合并而非覆盖，杜绝吞事件。
      onPointerDown={(e) => {
        onPointerDown?.(e);
        squish(scaleDown);
      }}
      onPointerUp={(e) => {
        onPointerUp?.(e);
        squish(1);
      }}
      onPointerLeave={(e) => {
        onPointerLeave?.(e);
        squish(1);
      }}
      onPointerCancel={(e) => {
        onPointerCancel?.(e);
        squish(1);
      }}
      style={reduce ? style : { ...style, scale: springScale }}
    >
      {children}
    </motion.button>
  );
});

export default SquishyButton;
