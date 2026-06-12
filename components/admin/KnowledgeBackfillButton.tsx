'use client';

// 管理员工具：为存量题批量回填知识点（受控词表 Gemini 分类 → question_topic_relations）。
// 每点一次处理一批（默认 40 条），循环点到「已全部回填」为止。打标后知识星图的
// 共现边/反链立即生效。交互与 EmbeddingBackfillButton 保持一致。

import { useState, useTransition } from 'react';
import { Network } from 'lucide-react';
import { backfillKnowledgePoints } from '@/app/actions/knowledge-points';

export default function KnowledgeBackfillButton() {
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [totalTagged, setTotalTagged] = useState(0);

  function run() {
    startTransition(async () => {
      const r = await backfillKnowledgePoints(40);
      if (!r.success) {
        setMsg('❌ ' + (r.error ?? '失败'));
        return;
      }
      if (r.processed === 0) {
        setMsg('✓ 已全部回填，无待标注题目。');
        return;
      }
      const t = totalTagged + r.tagged;
      setTotalTagged(t);
      setMsg(`本批处理 ${r.processed} 题、成功打标 ${r.tagged}（累计 ${t}）。如还有更多请再次点击。`);
    });
  }

  return (
    <div className="flex flex-col gap-1.5">
      <button
        onClick={run}
        disabled={pending}
        className="inline-flex w-fit items-center gap-1.5 rounded-lg border border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950/30 px-3 py-1.5 text-sm font-medium text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 disabled:opacity-60 transition-colors"
      >
        <Network className="h-4 w-4" />
        {pending ? '标注中…' : '回填知识点标注（一批 40）'}
      </button>
      {msg && <p className="text-xs text-muted-foreground">{msg}</p>}
    </div>
  );
}
