'use client';

// AI 复盘叙述：按需调 Gemini 生成一段针对你错题分布的复盘点评（带 [[知识点]] 维基链接）。
import { useState, useTransition } from 'react';
import { Wand2, Loader2, RefreshCw } from 'lucide-react';
import ClientMath from '@/components/solve/ClientMath';
import { linkifyWikiRefs } from '@/lib/utils/wikiLinks';
import { getReviewNarrative } from '@/app/actions/review-analytics';

export default function ReviewNarrative() {
  const [markdown, setMarkdown] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const run = () => {
    setError(null);
    start(async () => {
      const res = await getReviewNarrative();
      if (res.ok) setMarkdown(res.markdown);
      else setError(res.error);
    });
  };

  return (
    <div>
      {!markdown ? (
        <div className="flex flex-col items-center gap-2 py-2 text-center">
          <button
            onClick={run}
            disabled={pending}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-500 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-all hover:shadow-md hover:shadow-indigo-500/25 disabled:opacity-70"
          >
            {pending ? <><Loader2 size={15} className="animate-spin" /> AI 正在分析你的错题…</> : <><Wand2 size={15} /> 生成 AI 复盘点评</>}
          </button>
          {error && <p className="text-xs text-red-500 dark:text-red-400">{error}</p>}
        </div>
      ) : (
        <div>
          <ClientMath content={linkifyWikiRefs(markdown)} />
          <button onClick={run} disabled={pending} className="mt-2 inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300">
            <RefreshCw size={11} className={pending ? 'animate-spin' : ''} /> 重新生成
          </button>
        </div>
      )}
    </div>
  );
}
