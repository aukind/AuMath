'use client';

// 管理员工具：为存量公开题批量回填语义向量（pgvector）。
// 每点一次处理一批（默认 50 条），循环点到「已全部回填」为止。
// 迁移 028 未跑 / 无 GEMINI_API_KEY 时返回明确错误，不会误伤其他功能。

import { useState, useTransition } from 'react';
import { Sparkles } from 'lucide-react';
import { backfillEmbeddings } from '@/app/actions/embeddings';

export default function EmbeddingBackfillButton() {
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [totalEmbedded, setTotalEmbedded] = useState(0);

  function run() {
    startTransition(async () => {
      const r = await backfillEmbeddings(50);
      if (!r.success) {
        setMsg('❌ ' + (r.error ?? '失败'));
        return;
      }
      if (r.processed === 0) {
        setMsg('✓ 已全部回填，无待处理题目。');
        return;
      }
      const t = totalEmbedded + r.embedded;
      setTotalEmbedded(t);
      setMsg(`本批处理 ${r.processed} 题、成功 ${r.embedded}（累计 ${t}）。如还有更多请再次点击。`);
    });
  }

  return (
    <div className="flex flex-col gap-1.5">
      <button
        onClick={run}
        disabled={pending}
        className="inline-flex w-fit items-center gap-1.5 rounded-lg border border-violet-300 dark:border-violet-700 bg-violet-50 dark:bg-violet-950/30 px-3 py-1.5 text-sm font-medium text-violet-700 dark:text-violet-300 hover:bg-violet-100 dark:hover:bg-violet-900/40 disabled:opacity-60 transition-colors"
      >
        <Sparkles className="h-4 w-4" />
        {pending ? '回填中…' : '回填语义向量（一批 50）'}
      </button>
      {msg && <p className="text-xs text-muted-foreground">{msg}</p>}
    </div>
  );
}
