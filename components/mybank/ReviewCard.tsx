'use client';

// 单题复习卡片：题干 → 「揭晓」翻折展开解析 → 四档评分。
// 演算走右下角全屏草稿本（CanvasScratchpad，与本卡布局解耦），故本卡不内嵌画布。
import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Eye, PencilLine, Sparkles } from 'lucide-react';
import MathRenderer from '@/components/MathRenderer';
import type { QuestionWithTopics } from '@/types/database';
import type { ReviewRating } from '@/types/fsrs';

interface ReviewCardProps {
  question: QuestionWithTopics;
  isSubmitting: boolean;
  onRated: (rating: ReviewRating, durationMs: number) => void;
}

// 四档评分（红→橙→绿→蓝），key 与 ts-fsrs Rating 一致
const RATINGS: {
  rating: ReviewRating;
  label: string;
  hint: string;
  cls: string;
}[] = [
  { rating: 1, label: '完全忘记', hint: 'Again', cls: 'bg-red-500 hover:bg-red-600 focus-visible:ring-red-400' },
  { rating: 2, label: '磕磕绊绊', hint: 'Hard', cls: 'bg-amber-500 hover:bg-amber-600 focus-visible:ring-amber-400' },
  { rating: 3, label: '顺利解出', hint: 'Good', cls: 'bg-emerald-500 hover:bg-emerald-600 focus-visible:ring-emerald-400' },
  { rating: 4, label: '肌肉记忆', hint: 'Easy', cls: 'bg-blue-500 hover:bg-blue-600 focus-visible:ring-blue-400' },
];

export default function ReviewCard({ question, isSubmitting, onRated }: ReviewCardProps) {
  const [revealed, setRevealed] = useState(false);
  // 进场时刻 → 演算/停留时长。卡片按 question.id keyed，换题即重新挂载，
  // 挂载后副作用里写入 startRef（render 期不调 Date.now，satisfy react-hooks/purity）。
  const startRef = useRef<number | null>(null);
  useEffect(() => {
    startRef.current = Date.now();
  }, []);

  const topics = (question.question_topic_relations ?? [])
    .map((r) => r.topics?.name)
    .filter(Boolean) as string[];

  const handleRate = useCallback(
    (rating: ReviewRating) => {
      if (isSubmitting) return; // 连击/竞态由父级提交锁兜底，这里再保险一层
      onRated(rating, Date.now() - (startRef.current ?? Date.now()));
    },
    [isSubmitting, onRated],
  );

  // 键盘：空格/回车揭晓；揭晓后 1/2/3/4 评分
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!revealed) {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          setRevealed(true);
        }
        return;
      }
      if (isSubmitting) return;
      if (e.key >= '1' && e.key <= '4') {
        e.preventDefault();
        handleRate(Number(e.key) as ReviewRating);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [revealed, isSubmitting, handleRate]);

  return (
    <div
      className="relative mx-auto w-full max-w-2xl rounded-3xl border border-zinc-200 bg-white shadow-xl shadow-black/5 dark:border-zinc-800 dark:bg-zinc-900"
      style={{ perspective: 1200 }}
    >
      {/* ── 题干 ── */}
      <div className="px-6 pt-6 sm:px-8 sm:pt-8">
        {(topics.length > 0 || question.difficulty) && (
          <div className="mb-4 flex flex-wrap items-center gap-1.5">
            {topics.slice(0, 3).map((t) => (
              <span
                key={t}
                className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-[0.7rem] font-medium text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-300"
              >
                {t}
              </span>
            ))}
            <span className="ml-auto inline-flex items-center gap-0.5 text-[0.7rem] font-medium text-amber-500">
              {'★'.repeat(question.difficulty)}
              <span className="text-zinc-300 dark:text-zinc-600">{'★'.repeat(5 - question.difficulty)}</span>
            </span>
          </div>
        )}

        <div className="text-[0.95rem] leading-relaxed text-zinc-800 dark:text-zinc-100">
          <MathRenderer content={question.content} />
        </div>
      </div>

      {/* ── 揭晓前：提示 + 按钮 ── */}
      <AnimatePresence initial={false} mode="wait">
        {!revealed ? (
          <motion.div
            key="prompt"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="flex flex-col items-center gap-3 px-6 py-7 sm:px-8"
          >
            <p className="flex items-center gap-1.5 text-xs text-zinc-400">
              <PencilLine size={13} /> 点右下角「草稿本」演算，想清楚再揭晓
            </p>
            <button
              type="button"
              onClick={() => setRevealed(true)}
              className="inline-flex items-center gap-2 rounded-2xl bg-zinc-900 px-7 py-3 text-sm font-semibold text-white shadow-lg shadow-black/10 transition-transform hover:scale-[1.03] active:scale-95 dark:bg-zinc-100 dark:text-zinc-900"
            >
              <Eye size={16} /> 揭晓
            </button>
          </motion.div>
        ) : (
          // ── 揭晓后：翻折展开解析 + 评分 ──
          <motion.div
            key="answer"
            initial={{ opacity: 0, rotateX: -22, transformOrigin: 'top' }}
            animate={{ opacity: 1, rotateX: 0 }}
            transition={{ type: 'spring', stiffness: 260, damping: 26 }}
            className="border-t border-zinc-100 dark:border-zinc-800"
          >
            <div className="space-y-4 px-6 py-6 sm:px-8">
              <div>
                <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
                  答案
                </h3>
                <div className="text-[0.95rem] leading-relaxed text-zinc-800 dark:text-zinc-100">
                  <MathRenderer content={question.answer} />
                </div>
              </div>
              {question.solution?.trim() && (
                <div>
                  <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-400">
                    解析
                  </h3>
                  <div className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">
                    <MathRenderer content={question.solution} />
                  </div>
                </div>
              )}
            </div>

            {/* ── 四档评分 ── */}
            <div className="px-4 pb-5 pt-1 sm:px-6">
              <p className="mb-2.5 flex items-center gap-1.5 px-1 text-xs text-zinc-400">
                <Sparkles size={13} className="text-indigo-400" /> 凭刚才的手感，如实评价这次回忆
              </p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {RATINGS.map(({ rating, label, hint, cls }) => (
                  <button
                    key={rating}
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => handleRate(rating)}
                    className={[
                      'flex flex-col items-center gap-0.5 rounded-2xl px-2 py-3 text-white shadow-sm transition-all',
                      'focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-zinc-900',
                      'disabled:cursor-not-allowed disabled:opacity-40',
                      'active:scale-95',
                      cls,
                    ].join(' ')}
                  >
                    <span className="text-sm font-semibold">{label}</span>
                    <span className="text-[0.65rem] font-medium opacity-80">{rating} · {hint}</span>
                  </button>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
