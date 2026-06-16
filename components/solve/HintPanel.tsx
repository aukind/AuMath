'use client';

// 渐进提示面板：逐级揭示 AI 的 Socratic 提示（L1 定向 → L2 方法 → L3 关键步）。
// 「我卡在哪」自由文本让提示更贴合（对标 Brilliant Koji 的「看得到你在想什么」），
// 现在就不依赖 OCR；二期把演算 OCR 文本接到同一入口即可。

import { useState } from 'react';
import { toast } from 'sonner';
import { Lightbulb, Loader2, Sparkles, CheckCircle2 } from 'lucide-react';
import { getProgressiveHint } from '@/app/actions/solve';
import type { HintLevel } from '@/lib/solve/hint';
import ClientMath from './ClientMath';

const LEVEL_META: Record<HintLevel, { label: string; desc: string; tone: string }> = {
  1: { label: 'L1 · 定向', desc: '只点方向，不给方法', tone: 'from-sky-500 to-indigo-500' },
  2: { label: 'L2 · 方法', desc: '点关键方法，不代入计算', tone: 'from-indigo-500 to-violet-500' },
  3: { label: 'L3 · 关键步', desc: '讲透卡点，止于最终答案前', tone: 'from-violet-500 to-fuchsia-500' },
};

interface HintPanelProps {
  questionId: string;
  /** 每揭示一级回调父级（用于累计 hints_used / max_hint_level 落库）。 */
  onHintUsed: (level: number) => void;
}

export default function HintPanel({ questionId, onHintUsed }: HintPanelProps) {
  const [revealed, setRevealed] = useState<{ level: HintLevel; hint: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [context, setContext] = useState('');

  const nextLevel = (revealed.length + 1) as HintLevel;
  const exhausted = revealed.length >= 3;

  async function reveal() {
    if (exhausted || loading) return;
    setLoading(true);
    try {
      const res = await getProgressiveHint(questionId, nextLevel, context.trim() || undefined);
      if (res.ok) {
        setRevealed(prev => [...prev, { level: nextLevel, hint: res.hint }]);
        onHintUsed(nextLevel);
      } else {
        toast.error(res.error);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Lightbulb size={15} className="text-amber-500" />
        <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">渐进提示</span>
        <span className="ml-auto text-[0.7rem] tabular-nums text-zinc-400">
          {revealed.length}/3
        </span>
      </div>

      {/* 「我卡在哪」——让提示更贴合 */}
      <textarea
        value={context}
        onChange={e => setContext(e.target.value)}
        rows={2}
        placeholder="（可选）描述你卡在哪一步，提示会更对症…"
        className="w-full resize-none rounded-xl border border-zinc-200 bg-white/70 px-3 py-2 text-xs leading-relaxed text-zinc-700 outline-none transition-colors placeholder:text-zinc-400 focus:border-indigo-400 dark:border-zinc-700 dark:bg-zinc-900/60 dark:text-zinc-200"
      />

      {/* 已揭示的提示卡 */}
      {revealed.map(({ level, hint }) => (
        <div
          key={level}
          className="overflow-hidden rounded-xl border border-zinc-200 bg-white/80 dark:border-zinc-700/70 dark:bg-zinc-900/60"
        >
          <div className={`flex items-center gap-1.5 bg-gradient-to-r ${LEVEL_META[level].tone} px-3 py-1.5`}>
            <Sparkles size={12} className="text-white/90" />
            <span className="text-[0.7rem] font-semibold text-white">{LEVEL_META[level].label}</span>
            <span className="ml-auto text-[0.62rem] text-white/75">{LEVEL_META[level].desc}</span>
          </div>
          <div className="px-3 py-2">
            <ClientMath content={hint} />
          </div>
        </div>
      ))}

      {/* 揭示按钮 / 用尽提示 */}
      {exhausted ? (
        <div className="flex items-center gap-1.5 rounded-xl bg-zinc-100 px-3 py-2.5 text-xs text-zinc-500 dark:bg-zinc-800/60 dark:text-zinc-400">
          <CheckCircle2 size={14} className="text-emerald-500" />
          已给到「关键步」提示——剩下的最后一步，自己迈出去 💪
        </div>
      ) : (
        <button
          onClick={reveal}
          disabled={loading}
          className="group flex items-center justify-center gap-2 rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900"
        >
          {loading ? (
            <><Loader2 size={15} className="animate-spin" /> 思考中…</>
          ) : (
            <><Lightbulb size={15} /> {revealed.length === 0 ? '我卡住了，给点提示' : `再深入一层（${LEVEL_META[nextLevel].label}）`}</>
          )}
        </button>
      )}
      <p className="text-[0.65rem] leading-relaxed text-zinc-400">
        提示分三级递进，<span className="font-medium text-zinc-500 dark:text-zinc-400">永远不会直接给出最终答案</span>——目标是帮你自己想出来。
      </p>
    </div>
  );
}
