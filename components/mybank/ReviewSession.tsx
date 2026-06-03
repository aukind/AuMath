'use client';

// 复习流编排器：进度、卡片飞出/滑入、提交锁、清空撒花。
// Server/Client 边界所需——page.tsx(RSC) 预取队列后交由本组件维护答题状态。
import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { ArrowLeft, PartyPopper } from 'lucide-react';
import ReviewCard from '@/components/mybank/ReviewCard';
import { submitReviewAction } from '@/app/actions/fsrs';
import type { QuestionWithTopics } from '@/types/database';
import type { ReviewRating } from '@/types/fsrs';

interface ReviewSessionProps {
  initialQuestions: QuestionWithTopics[];
}

export default function ReviewSession({ initialQuestions }: ReviewSessionProps) {
  const total = initialQuestions.length;
  const [index, setIndex] = useState(0);
  // 提交锁：首点即 true，贯穿出场动画到下题就位才解（封死连击/竞态——边缘案例#3）
  const [isSubmitting, setIsSubmitting] = useState(false);

  const current = index < total ? initialQuestions[index] : null;
  const done = index >= total;

  const handleRated = useCallback(
    async (rating: ReviewRating, durationMs: number) => {
      if (isSubmitting || !current) return;
      setIsSubmitting(true);

      const res = await submitReviewAction({
        questionId: current.id,
        rating,
        durationMs,
      });

      if (!res.success) {
        toast.error('提交失败，请重试');
        setIsSubmitting(false); // 解锁但不前进，停在原题
        return;
      }
      // 成功：推进到下一题，触发当前卡退出动画；
      // isSubmitting 维持到 AnimatePresence onExitComplete 才解，锁住整段过渡。
      setIndex((i) => i + 1);
    },
    [isSubmitting, current],
  );

  return (
    <div className="flex w-full flex-col items-center">
      {/* ── 进度 ── */}
      {!done && (
        <div className="mb-6 w-full max-w-2xl px-1">
          <div className="mb-2 flex items-baseline justify-between text-xs font-medium text-zinc-400">
            <span>今日复习</span>
            <span className="tabular-nums">
              <span className="text-base font-bold text-zinc-700 dark:text-zinc-200">
                {Math.min(index + 1, total)}
              </span>
              {' / '}
              {total}
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500"
              initial={false}
              animate={{ width: `${(index / total) * 100}%` }}
              transition={{ type: 'spring', stiffness: 200, damping: 30 }}
            />
          </div>
        </div>
      )}

      {/* ── 卡片流 ── */}
      <div className="w-full">
        <AnimatePresence mode="wait" onExitComplete={() => setIsSubmitting(false)}>
          {current ? (
            <motion.div
              key={current.id}
              initial={{ opacity: 0, x: 64, scale: 0.97 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: -64, scale: 0.97 }}
              transition={{ type: 'tween', duration: 0.28, ease: 'easeInOut' }}
            >
              <ReviewCard
                question={current}
                isSubmitting={isSubmitting}
                onRated={handleRated}
              />
            </motion.div>
          ) : (
            <Celebration key="done" total={total} />
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ── 清空撒花（零依赖 Framer Motion 粒子迸发）──────────────────────────────
function Celebration({ total }: { total: number }) {
  // 确定性迸发（不在 render 期调 Math.random，satisfy react-hooks/purity）。
  // 角度均匀铺开 + 由下标派生的距离/延时抖动，视觉上仍是随机感的礼花。
  const particles = useMemo(() => {
    const colors = ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#3b82f6'];
    const N = 16;
    return Array.from({ length: N }, (_, i) => {
      const angle = (Math.PI * 2 * i) / N + (i % 2 ? 0.22 : -0.18);
      const dist = 95 + (i % 4) * 22;
      return {
        id: i,
        x: Math.cos(angle) * dist,
        y: Math.sin(angle) * dist,
        color: colors[i % colors.length],
        delay: (i % 5) * 0.035,
      };
    });
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: 'spring', stiffness: 220, damping: 22 }}
      className="relative mx-auto flex max-w-2xl flex-col items-center gap-4 rounded-3xl border border-zinc-200 bg-white px-8 py-16 text-center shadow-xl shadow-black/5 dark:border-zinc-800 dark:bg-zinc-900"
    >
      {/* 粒子 */}
      <div className="pointer-events-none absolute left-1/2 top-20">
        {particles.map((p) => (
          <motion.span
            key={p.id}
            className="absolute h-2.5 w-2.5 rounded-sm"
            style={{ backgroundColor: p.color }}
            initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
            animate={{ x: p.x, y: p.y, opacity: 0, scale: 0.4, rotate: 180 }}
            transition={{ duration: 1.1, delay: p.delay, ease: 'easeOut' }}
          />
        ))}
      </div>

      <motion.div
        initial={{ rotate: -12, scale: 0.6 }}
        animate={{ rotate: 0, scale: 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 14, delay: 0.1 }}
        className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-500 text-white shadow-lg"
      >
        <PartyPopper size={30} />
      </motion.div>

      <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">收件箱已清空 🎉</h2>
      <p className="max-w-sm text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">
        今天的 {total} 道错题已全部复习完成。坚持每天清空，记忆会越来越牢——明天见。
      </p>

      <Link
        href="/?view=mybank&workspace=errors"
        className="mt-2 inline-flex items-center gap-1.5 rounded-2xl bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white transition-transform hover:scale-[1.03] active:scale-95 dark:bg-zinc-100 dark:text-zinc-900"
      >
        <ArrowLeft size={15} /> 返回错题本
      </Link>
    </motion.div>
  );
}
