'use client';

// 题目「详情态」—— 拦截路由 @modal 内挂载的共享元素弹窗。
// 与列表卡片 MotionQuestionCard 共用 layoutId('question', id)：卡片放大 morph 成居中模态。
// 面板自身即卡片表面（剥掉内层 QuestionCard 的 article 边框/阴影以免双层套框）。
// iOS 式下拉阻尼退场 + KaTeX 门控（morph 稳定后再挂含多段 LaTeX 的 QuestionCard）。

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Toaster } from 'sonner';
import {
  AnimatePresence,
  motion,
  useDragControls,
  useMotionValue,
  useReducedMotion,
  type PanInfo,
} from 'framer-motion';
import { useLenis } from 'lenis/react';
import { X } from 'lucide-react';
import QuestionCard from '@/components/QuestionCard';
import type { QuestionWithTopics } from '@/types/database';
import { cardLayoutId, SHARED_SPRING } from '@/components/motion/SharedCardProps';

const DISMISS_OFFSET = 120;
const DISMISS_VELOCITY = 800;

interface QuestionDetailViewProps {
  question: QuestionWithTopics;
  isLoggedIn: boolean;
  favorited: boolean;
  errored: boolean;
  myRating: number | null;
}

export default function QuestionDetailView({
  question,
  isLoggedIn,
  favorited,
  errored,
  myRating,
}: QuestionDetailViewProps) {
  const router = useRouter();
  const reduce = useReducedMotion();
  const lenis = useLenis();

  const [open, setOpen] = useState(true);
  const [ready, setReady] = useState<boolean>(!!reduce);
  const dismiss = useCallback(() => setOpen(false), []);

  const y = useMotionValue(0);
  const dragControls = useDragControls();
  const startDrag = (e: React.PointerEvent) => dragControls.start(e);
  const onDragEnd = (_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    if (info.offset.y > DISMISS_OFFSET || info.velocity.y > DISMISS_VELOCITY) dismiss();
  };

  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    lenis?.stop();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dismiss();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      lenis?.start();
      window.removeEventListener('keydown', onKey);
    };
  }, [lenis, dismiss]);

  const readyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (reduce) return;
    readyTimer.current = setTimeout(() => setReady(true), 420);
    return () => {
      if (readyTimer.current) clearTimeout(readyTimer.current);
    };
  }, [reduce]);

  return (
    <AnimatePresence onExitComplete={() => router.back()}>
      {open && (
        <motion.div key="question-modal" data-app-modal className="fixed inset-0 z-[100]">
          <motion.div
            className="absolute inset-0 bg-zinc-950/50 backdrop-blur-md"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            onClick={dismiss}
          />

          <div className="pointer-events-none absolute inset-0 flex items-start justify-center overflow-hidden p-3 sm:p-6 sm:pt-[6vh]">
            <motion.div
              layoutId={cardLayoutId('question', question.id)}
              transition={reduce ? { duration: 0.2 } : SHARED_SPRING}
              onLayoutAnimationComplete={() => setReady(true)}
              drag="y"
              dragListener={false}
              dragControls={dragControls}
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={{ top: 0, bottom: 0.7 }}
              dragSnapToOrigin
              style={{ y }}
              onDragEnd={onDragEnd}
              className="pointer-events-auto relative flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-zinc-100 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-900"
            >
              {/* 下拉抓取区（非滚动）：iOS 抓取条 + 关闭按钮 */}
              <div
                onPointerDown={startDrag}
                className="relative shrink-0 cursor-grab touch-none select-none pb-1 pt-3 active:cursor-grabbing"
              >
                <div className="mx-auto h-1.5 w-10 rounded-full bg-zinc-300 dark:bg-zinc-700" />
                <button
                  onClick={dismiss}
                  aria-label="关闭"
                  className="absolute right-3 top-2.5 rounded-lg p-1.5 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
                >
                  <X size={18} />
                </button>
              </div>

              {/* 正文（独立滚动）。门控后挂 QuestionCard，并剥掉其 article 自带边框/阴影避免双层套框 */}
              <div data-lenis-prevent className="flex-1 overflow-y-auto overscroll-contain">
                {ready ? (
                  <motion.div
                    layout="position"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.25 }}
                    className="[&_article]:rounded-none [&_article]:border-0 [&_article]:shadow-none"
                  >
                    <QuestionCard
                      question={question}
                      isLoggedIn={isLoggedIn}
                      initialFavorited={favorited}
                      initialErrored={errored}
                      initialMyRating={myRating}
                    />
                  </motion.div>
                ) : (
                  <div className="min-h-[45vh] space-y-3 p-6">
                    <div className="h-4 w-1/3 animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" />
                    <div className="h-3 w-full animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" />
                    <div className="h-3 w-5/6 animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" />
                    <div className="h-3 w-2/3 animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" />
                  </div>
                )}
              </div>
            </motion.div>
          </div>

          {/* QuestionCard 的收藏/评分/标错等动作走 sonner toast，弹窗内需自带 Toaster */}
          <Toaster richColors position="top-center" />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
