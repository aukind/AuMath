'use client';

// 一键 AI 回填知识点（管理员）。循环调用 backfillKnowledgePoints 批处理「无任何知识点关联」的
// 已发布题，直到 processed=0（全部回填）或出错，期间显示累计进度。完成后 refresh 让动态知识点树重建。
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Sparkles, Loader2, Check } from 'lucide-react';
import { backfillKnowledgePoints } from '@/app/actions/knowledge-points';

const MAX_BATCHES = 200; // 安全阀：200×40 = 8000 题

export default function BackfillKnowledgeButton() {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [processed, setProcessed] = useState(0);
  const [tagged, setTagged] = useState(0);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const run = async () => {
    if (running) return;
    setRunning(true); setDone(false); setError(null); setProcessed(0); setTagged(0);
    let p = 0, t = 0;
    try {
      for (let i = 0; i < MAX_BATCHES; i++) {
        const res = await backfillKnowledgePoints(40);
        if (!res.success) { setError(res.error ?? '回填失败'); break; }
        if (res.processed === 0) { setDone(true); break; } // 全部已回填
        p += res.processed; t += res.tagged;
        setProcessed(p); setTagged(t);
      }
    } catch (e) {
      setError((e as Error).message || '回填中断');
    } finally {
      setRunning(false);
      startTransition(() => router.refresh()); // 重建知识点树
    }
  };

  return (
    <div className="mb-2 rounded-lg border border-indigo-200 bg-indigo-50/50 p-2 dark:border-indigo-500/30 dark:bg-indigo-500/10">
      <button
        onClick={run}
        disabled={running}
        className="flex w-full items-center justify-center gap-1.5 rounded-md bg-gradient-to-r from-indigo-500 to-purple-500 px-2.5 py-1.5 text-xs font-medium text-white transition-all hover:shadow-sm disabled:opacity-70"
      >
        {running
          ? <><Loader2 size={13} className="animate-spin" /> 回填中… 已处理 {processed} 题</>
          : <><Sparkles size={13} /> 一键 AI 回填知识点</>}
      </button>
      {!running && done && (
        <p className="mt-1.5 flex items-center justify-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400">
          <Check size={12} /> {processed > 0 ? `完成：处理 ${processed} 题，打标 ${tagged} 题` : '所有题目已打标，无需回填'}
        </p>
      )}
      {!running && error && <p className="mt-1.5 text-center text-[11px] text-red-500 dark:text-red-400">{error}</p>}
      {!running && !done && !error && (
        <p className="mt-1.5 text-center text-[11px] text-zinc-400 dark:text-zinc-500">给尚无知识点的存量题批量打标，填充下方知识点树</p>
      )}
    </div>
  );
}
