'use client';

// 自己录题：用户把一道自建题直接收进「我的收藏」或「我的错题」。
// 题目正文沿用题库的 Markdown + $LaTeX$ 约定（与公共题一致）。

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Star, XCircle } from 'lucide-react';
import { createPersonalQuestion } from '@/app/actions/user-workspace';
import type { Difficulty } from '@/types/database';

export default function PersonalQuestionForm({
  defaultTarget = 'favorites',
}: {
  defaultTarget?: 'favorites' | 'errors';
}) {
  const router = useRouter();
  const [isPending, start] = useTransition();
  const [target, setTarget] = useState<'favorites' | 'errors'>(defaultTarget);
  const [content, setContent] = useState('');
  const [answer, setAnswer] = useState('');
  const [analysis, setAnalysis] = useState('');
  const [difficulty, setDifficulty] = useState<Difficulty>(3);

  const canSubmit = content.trim() && answer.trim() && !isPending;

  function submit() {
    start(async () => {
      const res = await createPersonalQuestion(target, { content, answer, analysis, difficulty });
      if (res.success) {
        toast.success('已加入' + (target === 'favorites' ? '我的收藏' : '我的错题'));
        router.push(`/?view=mybank&workspace=${target}`);
      } else {
        toast.error(res.error ?? '保存失败');
      }
    });
  }

  const field = 'w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 dark:border-zinc-700 dark:bg-zinc-900';

  return (
    <div className="space-y-4">
      {/* 归入哪里 */}
      <div className="flex gap-2">
        {([
          { key: 'favorites', label: '收藏', icon: Star },
          { key: 'errors', label: '错题', icon: XCircle },
        ] as const).map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => setTarget(key)}
            className={[
              'flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors',
              target === key
                ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300'
                : 'border-zinc-200 text-zinc-500 dark:border-zinc-700',
            ].join(' ')}
          >
            <Icon size={14} /> 加入{label}
          </button>
        ))}
      </div>

      <Labeled label="题目内容" hint="支持 Markdown 与 $LaTeX$ 公式，如 $x^2+1$">
        <textarea value={content} onChange={(e) => setContent(e.target.value)} rows={5}
          placeholder="例：已知函数 $f(x)=x^2-2ax+1$ 在 $[1,2]$ 上单调，求 $a$ 的取值范围。"
          className={`${field} resize-y font-mono`} />
      </Labeled>

      <Labeled label="答案">
        <textarea value={answer} onChange={(e) => setAnswer(e.target.value)} rows={2}
          placeholder="例：$a \\le 1$ 或 $a \\ge 2$" className={`${field} resize-y font-mono`} />
      </Labeled>

      <Labeled label="解析（选填）">
        <textarea value={analysis} onChange={(e) => setAnalysis(e.target.value)} rows={4}
          placeholder="解题步骤…" className={`${field} resize-y font-mono`} />
      </Labeled>

      <Labeled label="难度">
        <div className="flex gap-1.5">
          {[1, 2, 3, 4, 5].map((d) => (
            <button key={d} type="button" onClick={() => setDifficulty(d as Difficulty)}
              className={[
                'h-9 w-9 rounded-lg border text-sm font-medium transition-colors',
                difficulty === d
                  ? 'border-indigo-500 bg-indigo-600 text-white'
                  : 'border-zinc-200 text-zinc-500 dark:border-zinc-700',
              ].join(' ')}>
              {d}
            </button>
          ))}
        </div>
      </Labeled>

      <div className="flex justify-end gap-2 pt-2">
        <button type="button" onClick={() => router.push('/?view=mybank')}
          className="rounded-lg border border-zinc-300 px-4 py-1.5 text-sm text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800">
          取消
        </button>
        <button type="button" onClick={submit} disabled={!canSubmit}
          className="rounded-lg bg-indigo-600 px-5 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
          {isPending ? '保存中…' : '保存入库'}
        </button>
      </div>
    </div>
  );
}

function Labeled({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 flex items-baseline gap-2">
        <label className="text-sm font-medium text-zinc-700 dark:text-zinc-200">{label}</label>
        {hint && <span className="text-xs text-zinc-400">{hint}</span>}
      </div>
      {children}
    </div>
  );
}
