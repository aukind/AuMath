'use client';

// 官方严选 3D 视差橱窗（Apple/Linear 风）。
//   · 横向「书架」：每本书随鼠标做 rotateX/rotateY 视差倾斜（useMotionValue + useSpring）。
//   · 背景：多层模糊径向渐变缓动「液态流光」（只动 transform/opacity，GPU 友好）。
//   · 书脸外层包 motion.div layoutId={lib-cover-${id}} —— 与 ImmersiveReader 共享放大转场。
//   · prefers-reduced-motion / 触屏：关闭视差与流光，退化为静态。

import { useRef } from 'react';
import {
  motion,
  useMotionValue,
  useSpring,
  useTransform,
  useMotionTemplate,
  useReducedMotion,
  type MotionValue,
} from 'framer-motion';
import { BadgeCheck, Sparkles } from 'lucide-react';
import CoverArt from '@/components/library/CoverArt';
import { coverLayoutId } from '@/components/library/shared';
import type { LibraryItem } from '@/types/library';

const TILT_SPRING = { stiffness: 280, damping: 26, mass: 0.5 } as const;
const MAX_TILT = 10; // 视差最大倾角(度)

export default function OfficialBookshelf({
  items,
  onOpen,
}: {
  items: LibraryItem[];
  onOpen: (item: LibraryItem) => void;
}) {
  const reduce = useReducedMotion();

  if (items.length === 0) return null;

  return (
    <section className="relative mb-10">
      {/* 流光背景 */}
      <FluidBackdrop disabled={!!reduce} />

      <h2 className="relative mb-4 flex items-center gap-1.5 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
        <Sparkles size={15} className="text-indigo-500" /> 官方严选
        <span className="text-xs font-normal text-zinc-400">· 权威 · 沉浸</span>
      </h2>

      <div
        className="relative -mx-4 flex snap-x snap-mandatory gap-6 overflow-x-auto px-4 pb-4 pt-2 [perspective:1400px] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {items.map((item) => (
          <BookCard key={item.id} item={item} onOpen={() => onOpen(item)} reduce={!!reduce} />
        ))}
      </div>
    </section>
  );
}

// ── 单本 3D 书 ─────────────────────────────────────────────
function BookCard({
  item,
  onOpen,
  reduce,
}: {
  item: LibraryItem;
  onOpen: () => void;
  reduce: boolean;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const px = useMotionValue(0); // -0.5 ~ 0.5
  const py = useMotionValue(0);
  const rotateY = useSpring(useTransform(px, [-0.5, 0.5], [-MAX_TILT, MAX_TILT]), TILT_SPRING);
  const rotateX = useSpring(useTransform(py, [-0.5, 0.5], [MAX_TILT, -MAX_TILT]), TILT_SPRING);

  const onMove = (e: React.MouseEvent) => {
    if (reduce) return;
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    px.set((e.clientX - r.left) / r.width - 0.5);
    py.set((e.clientY - r.top) / r.height - 0.5);
  };
  const reset = () => {
    px.set(0);
    py.set(0);
  };

  return (
    <button
      ref={ref}
      type="button"
      onClick={onOpen}
      onMouseMove={onMove}
      onMouseLeave={reset}
      className="group relative w-44 shrink-0 snap-start text-left outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
      aria-label={`打开《${item.title}》`}
    >
      <motion.div
        style={reduce ? undefined : { rotateX, rotateY, transformStyle: 'preserve-3d' }}
        className="will-change-transform"
      >
        {/* 书脸（共享转场源）。3D 倾斜在外层，layoutId 在内层，避免布局动画与 tilt 冲突。 */}
        <motion.div
          layoutId={coverLayoutId(item.id)}
          className="relative overflow-hidden rounded-lg rounded-l-sm shadow-[0_18px_40px_-12px_rgba(79,70,229,0.45)] ring-1 ring-black/5 transition-shadow duration-300 group-hover:shadow-[0_28px_60px_-12px_rgba(79,70,229,0.6)] dark:ring-white/10"
        >
          <CoverArt item={item} className="aspect-[3/4]" />
          {/* 书脊高光 */}
          <span className="pointer-events-none absolute inset-y-0 left-0 w-[3px] bg-gradient-to-r from-white/50 to-transparent" />
          {/* 鼠标光泽（随倾斜浮动） */}
          {!reduce && <Glare px={px} py={py} />}
          {/* 蓝V */}
          <span className="absolute right-2 top-2 flex items-center gap-0.5 rounded-full bg-black/35 px-1.5 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm">
            <BadgeCheck size={11} className="text-sky-300" /> 官方
          </span>
        </motion.div>
      </motion.div>

      <div className="mt-2.5 px-0.5">
        <p className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          {item.title}
        </p>
        <p className="line-clamp-1 text-xs text-zinc-500">
          {item.description ?? `${item.resource_type} · ${item.edu_stage}`}
        </p>
      </div>
    </button>
  );
}

// 跟随指针的高光层（增强 3D 立体感）
function Glare({ px, py }: { px: MotionValue<number>; py: MotionValue<number> }) {
  const x = useTransform(px, [-0.5, 0.5], ['0%', '100%']);
  const y = useTransform(py, [-0.5, 0.5], ['0%', '100%']);
  const bg = useMotionTemplate`radial-gradient(180px circle at ${x} ${y}, rgba(255,255,255,0.35), transparent 60%)`;
  return (
    <motion.div
      aria-hidden
      className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
      style={{ background: bg }}
    />
  );
}

// ── 流光背景 ───────────────────────────────────────────────
function FluidBackdrop({ disabled }: { disabled: boolean }) {
  const blobs = [
    { c: 'rgba(99,102,241,0.35)', s: 'left-[-10%] top-[-30%] h-72 w-72', d: { x: [0, 40, -20, 0], y: [0, -30, 20, 0] }, t: 18 },
    { c: 'rgba(168,85,247,0.30)', s: 'right-[-5%] top-[-20%] h-64 w-64', d: { x: [0, -30, 20, 0], y: [0, 25, -15, 0] }, t: 22 },
    { c: 'rgba(56,189,248,0.25)', s: 'left-[30%] bottom-[-40%] h-72 w-72', d: { x: [0, 25, -25, 0], y: [0, -20, 15, 0] }, t: 26 },
  ];
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-0 overflow-hidden">
      {blobs.map((b, i) => (
        <motion.div
          key={i}
          className={`absolute rounded-full blur-3xl ${b.s}`}
          style={{ backgroundColor: b.c }}
          animate={disabled ? undefined : b.d}
          transition={disabled ? undefined : { duration: b.t, repeat: Infinity, ease: 'easeInOut' }}
        />
      ))}
    </div>
  );
}
