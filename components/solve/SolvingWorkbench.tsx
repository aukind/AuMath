'use client';

// 解题工作台客户端外壳：两栏布局（题面 + 解题助手轨），计时、提示用量累计、
// 自评结果落库。题面/答案是服务端 MathRenderer 渲染后经 slot 注入（首屏无公式闪烁）。
// 手写演算复用全屏 CanvasScratchpad（由页面挂载，其自带右下角 FAB，本组件不直接控制）。

import { useState, useEffect, useCallback, type ReactNode } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  Clock, PenLine, Eye, EyeOff, Trophy, Lightbulb, Flag, BookOpen, CheckCircle2,
} from 'lucide-react';
import HintPanel from './HintPanel';
import { saveSolvingSession } from '@/app/actions/solve';

type Outcome = 'solved' | 'hinted' | 'stuck' | 'gave_up';

const OUTCOME_META: Record<Outcome, { label: string; icon: ReactNode; cls: string }> = {
  solved:  { label: '独立做出', icon: <Trophy size={14} />,       cls: 'border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-700 dark:text-emerald-300 dark:hover:bg-emerald-950/30' },
  hinted:  { label: '靠提示做出', icon: <Lightbulb size={14} />,  cls: 'border-indigo-300 text-indigo-700 hover:bg-indigo-50 dark:border-indigo-700 dark:text-indigo-300 dark:hover:bg-indigo-950/30' },
  stuck:   { label: '还是卡住', icon: <Flag size={14} />,         cls: 'border-amber-300 text-amber-700 hover:bg-amber-50 dark:border-amber-700 dark:text-amber-300 dark:hover:bg-amber-950/30' },
  gave_up: { label: '直接看答案', icon: <BookOpen size={14} />,   cls: 'border-zinc-300 text-zinc-600 hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-400 dark:hover:bg-zinc-800/60' },
};

function fmt(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

interface SolvingWorkbenchProps {
  questionId: string;
  meta: { source: string | null; year: number | null; difficulty: number | null };
  problemSlot: ReactNode;
  answerSlot: ReactNode;
}

export default function SolvingWorkbench({ questionId, meta, problemSlot, answerSlot }: SolvingWorkbenchProps) {
  const [seconds, setSeconds] = useState(0);
  const [hintsUsed, setHintsUsed] = useState(0);
  const [maxHintLevel, setMaxHintLevel] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [recorded, setRecorded] = useState<Outcome | null>(null);
  const [saving, setSaving] = useState(false);

  // 计时：进入即起算，记录结果后停表。
  const stopped = recorded !== null;
  useEffect(() => {
    if (stopped) return;
    const t = setInterval(() => setSeconds(s => s + 1), 1000);
    return () => clearInterval(t);
  }, [stopped]);

  const handleHintUsed = useCallback((level: number) => {
    setHintsUsed(n => n + 1);
    setMaxHintLevel(m => Math.max(m, level));
  }, []);

  async function finish(outcome: Outcome) {
    if (saving || recorded) return;
    setSaving(true);
    const res = await saveSolvingSession({
      questionId, maxHintLevel, hintsUsed, durationSec: seconds, outcome,
    });
    setSaving(false);
    setRecorded(outcome);
    if (res.ok) toast.success('已记录本次解题 ✦');
    else toast.message('本次解题已结束（记录未保存）');
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      {/* ── 左：题面 + 答案折叠 ── */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {meta.source && (
            <span className="rounded-full bg-zinc-100 px-2.5 py-1 font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
              {meta.source}
            </span>
          )}
          {meta.year && (
            <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
              {meta.year}
            </span>
          )}
          {typeof meta.difficulty === 'number' && (
            <span className="rounded-full bg-rose-50 px-2.5 py-1 font-medium text-rose-600 dark:bg-rose-950/40 dark:text-rose-300">
              难度 {meta.difficulty.toFixed(1)}
            </span>
          )}
        </div>

        <article className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 sm:p-8">
          {problemSlot}
        </article>

        {/* 对答案：默认折叠，避免还没解就看到答案 */}
        <div>
          <button
            onClick={() => setShowAnswer(v => !v)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3.5 py-2 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            {showAnswer ? <EyeOff size={15} /> : <Eye size={15} />}
            {showAnswer ? '收起答案与解析' : '对答案 · 查看解析'}
          </button>
          {showAnswer && (
            <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50/40 p-6 dark:border-amber-900/50 dark:bg-amber-950/10 sm:p-8">
              {answerSlot}
            </div>
          )}
        </div>
      </div>

      {/* ── 右：解题助手轨 ── */}
      <aside className="flex flex-col gap-4 lg:sticky lg:top-20 lg:self-start">
        {/* 会话状态 */}
        <div className="flex items-center gap-3 rounded-2xl border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
          <Clock size={16} className={stopped ? 'text-zinc-400' : 'text-indigo-500'} />
          <span className="font-mono text-lg font-semibold tabular-nums text-zinc-800 dark:text-zinc-100">
            {fmt(seconds)}
          </span>
          {hintsUsed > 0 && (
            <span className="ml-auto inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
              <Lightbulb size={12} /> 提示 ×{hintsUsed}
            </span>
          )}
        </div>

        {/* 手写演算入口提示（CanvasScratchpad 自带右下角 FAB） */}
        <div className="flex items-start gap-2 rounded-2xl border border-dashed border-zinc-300 bg-zinc-50/60 px-4 py-3 text-xs leading-relaxed text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900/40 dark:text-zinc-400">
          <PenLine size={15} className="mt-0.5 shrink-0 text-zinc-400" />
          <span>点右下角 <span className="font-medium text-zinc-700 dark:text-zinc-200">「草稿本」</span>全屏手写演算 · Apple Pencil 压感 · 手指滑动翻题</span>
        </div>

        {/* 渐进提示 */}
        <div className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <HintPanel questionId={questionId} onHintUsed={handleHintUsed} />
        </div>

        {/* 自评结果 */}
        {recorded ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4 dark:border-emerald-900/50 dark:bg-emerald-950/20">
            <div className="flex items-center gap-2 text-sm font-semibold text-emerald-700 dark:text-emerald-300">
              <CheckCircle2 size={16} /> 已记录 · {OUTCOME_META[recorded].label}
            </div>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              用时 {fmt(seconds)}{hintsUsed > 0 ? ` · 用了 ${hintsUsed} 次提示` : ' · 全程独立'}
            </p>
            <Link
              href="/"
              className="mt-3 inline-flex items-center justify-center rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white transition-transform hover:scale-[1.02] active:scale-95 dark:bg-zinc-100 dark:text-zinc-900"
            >
              返回题库继续
            </Link>
          </div>
        ) : (
          <div className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
            <p className="mb-3 text-xs font-medium text-zinc-500 dark:text-zinc-400">这道题，结果如何？</p>
            <div className="grid grid-cols-2 gap-2">
              {(Object.keys(OUTCOME_META) as Outcome[]).map(o => (
                <button
                  key={o}
                  onClick={() => finish(o)}
                  disabled={saving}
                  className={[
                    'flex items-center justify-center gap-1.5 rounded-xl border bg-white/60 px-2 py-2.5 text-xs font-medium transition-colors disabled:opacity-50 dark:bg-transparent',
                    OUTCOME_META[o].cls,
                  ].join(' ')}
                >
                  {OUTCOME_META[o].icon}
                  {OUTCOME_META[o].label}
                </button>
              ))}
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}
