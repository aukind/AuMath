'use client';

// 沉浸阅读模式开关 —— 右下角悬浮按钮。
// 玻璃质感沿用 ImmersiveReader（backdrop-blur + 半透明卡片）；
// 动效用 framer-motion，prefers-reduced-motion 时退化为无动画。

import { motion, useReducedMotion } from 'framer-motion';
import { BookOpenText, Minimize2 } from 'lucide-react';
import { useZenMode } from './ZenModeProvider';

export default function ZenModeToggle() {
  const { isZenMode, toggleZenMode } = useZenMode();
  const reduce = useReducedMotion();

  return (
    <motion.button
      type="button"
      onClick={toggleZenMode}
      aria-pressed={isZenMode}
      title={isZenMode ? '退出专注阅读（Esc）' : '专注阅读'}
      aria-label={isZenMode ? '退出专注阅读' : '进入专注阅读'}
      initial={reduce ? false : { opacity: 0, y: 12 }}
      animate={reduce ? {} : { opacity: 1, y: 0 }}
      whileHover={reduce ? {} : { scale: 1.06 }}
      whileTap={reduce ? {} : { scale: 0.94 }}
      transition={{ type: 'spring', stiffness: 320, damping: 24 }}
      className={[
        'fixed bottom-6 right-6 z-[200] flex h-12 w-12 items-center justify-center',
        'rounded-full border shadow-lg backdrop-blur-2xl transition-colors',
        isZenMode
          ? 'border-indigo-300/60 bg-indigo-500/90 text-white dark:border-indigo-400/40'
          : 'border-white/20 bg-white/85 text-zinc-600 hover:text-indigo-600 dark:border-white/10 dark:bg-zinc-950/85 dark:text-zinc-300 dark:hover:text-indigo-300',
      ].join(' ')}
    >
      {isZenMode ? <Minimize2 size={18} /> : <BookOpenText size={18} />}
    </motion.button>
  );
}
