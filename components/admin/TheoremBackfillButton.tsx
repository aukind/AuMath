'use client';

// 管理员工具：定理库联动星图的数据铺设。
//   ① 初始化定理库 —— 把受控词表整批建成 theorems 行（即便还没题引用，定理库先有内容）。
//   ② 回填定理引用 —— AI 识别存量题用到的定理 → 写引用/归属边，点一次一批（默认 30）。
// 落库后 /explore 的定理节点、定理→知识点/→题边、TheoremInspector 自动点亮。
// 交互与 KnowledgeBackfillButton 一致。

import { useState, useTransition } from 'react';
import { Sigma, Library } from 'lucide-react';
import { seedTheorems, backfillTheoremCitations } from '@/app/actions/theorems';

export default function TheoremBackfillButton() {
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [totalLinked, setTotalLinked] = useState(0);

  function seed() {
    startTransition(async () => {
      const r = await seedTheorems();
      setMsg(r.success ? `✓ 定理库已就绪，共 ${r.total} 条定理。` : '❌ ' + (r.error ?? '失败'));
    });
  }

  function backfill() {
    startTransition(async () => {
      const r = await backfillTheoremCitations(30);
      if (!r.success) { setMsg('❌ ' + (r.error ?? '失败')); return; }
      if (r.processed === 0) { setMsg('✓ 已全部回填，无待识别题目。'); return; }
      const t = totalLinked + r.linked;
      setTotalLinked(t);
      setMsg(`本批处理 ${r.processed} 题、绑定 ${r.linked} 条定理引用（累计 ${t}）。如还有更多请再次点击。`);
    });
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={seed}
          disabled={pending}
          className="inline-flex w-fit items-center gap-1.5 rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 px-3 py-1.5 text-sm font-medium text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/40 disabled:opacity-60 transition-colors"
        >
          <Library className="h-4 w-4" />
          初始化定理库
        </button>
        <button
          onClick={backfill}
          disabled={pending}
          className="inline-flex w-fit items-center gap-1.5 rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 px-3 py-1.5 text-sm font-medium text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/40 disabled:opacity-60 transition-colors"
        >
          <Sigma className="h-4 w-4" />
          {pending ? '处理中…' : '回填定理引用（一批 30）'}
        </button>
      </div>
      {msg && <p className="text-xs text-muted-foreground">{msg}</p>}
    </div>
  );
}
