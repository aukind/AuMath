'use client';

import { useState } from 'react';
import { ChevronDown, Layers, Pencil } from 'lucide-react';
import MathRenderer from '@/components/MathRenderer';
import type { QuestionWithTopics, Difficulty } from '@/types/database';

const DIFFICULTY_META: Record<Difficulty, { label: string; cls: string }> = {
  1: { label: '基础', cls: 'text-emerald-700 bg-emerald-50 dark:text-emerald-300 dark:bg-emerald-950/40' },
  2: { label: '进阶', cls: 'text-sky-700 bg-sky-50 dark:text-sky-300 dark:bg-sky-950/40' },
  3: { label: '中等', cls: 'text-yellow-700 bg-yellow-50 dark:text-yellow-300 dark:bg-yellow-950/40' },
  4: { label: '拔高', cls: 'text-orange-700 bg-orange-50 dark:text-orange-300 dark:bg-orange-950/40' },
  5: { label: '竞赛', cls: 'text-red-700 bg-red-50 dark:text-red-300 dark:bg-red-950/40' },
};

interface QuestionCardProps {
  question: QuestionWithTopics;
  isAdmin?: boolean;
}

export default function QuestionCard({ question, isAdmin = false }: QuestionCardProps) {
  const [solutionOpen, setSolutionOpen] = useState(false);

  const primaryTopic = (question.question_topic_relations.find(r => r.is_primary) ?? question.question_topic_relations[0])?.topics;
  const diff = DIFFICULTY_META[question.difficulty] ?? { label: '未知', cls: 'text-zinc-600 bg-zinc-100' };
  const solutionContent = [question.answer, question.analysis || question.solution].filter(Boolean).join('\n\n---\n\n');

  return (
    <article className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm overflow-hidden">
      {/* Card header: meta tags */}
      <div className="flex flex-wrap items-center gap-2 px-5 py-2.5 border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-800/30">
        <span className={`text-[0.6875rem] font-semibold px-2 py-0.5 rounded-full ${diff.cls}`}>
          {diff.label}
        </span>
        {primaryTopic && (
          <span className="text-xs text-zinc-500 dark:text-zinc-400">{primaryTopic.name}</span>
        )}
        <div className="ml-auto flex items-center gap-2 text-xs text-zinc-400">
          {question.year && <span>{question.year} 年</span>}
          {question.source && <span>{question.source}</span>}
          {isAdmin && (
            <a
              href={`/admin/edit/${question.id}`}
              title="编辑题目"
              className="ml-1 flex items-center gap-1 px-2 py-0.5 rounded-md border border-zinc-200 dark:border-zinc-700 text-zinc-400 hover:text-blue-600 hover:border-blue-300 dark:hover:text-blue-400 dark:hover:border-blue-700 transition-colors"
            >
              <Pencil size={11} /> 编辑
            </a>
          )}
        </div>
      </div>

      {/* Question body */}
      <div className="px-5 pt-5 pb-4">
        <MathRenderer content={question.content} />
      </div>

      {/* Action bar */}
      <div className="flex items-center gap-2 px-5 py-3 border-t border-zinc-100 dark:border-zinc-800">
        <button
          onClick={() => setSolutionOpen(v => !v)}
          className="flex items-center gap-1.5 text-sm font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
        >
          <ChevronDown
            size={15}
            className={`transition-transform duration-200 ${solutionOpen ? 'rotate-180' : ''}`}
          />
          {solutionOpen ? '收起解析' : '查看解析'}
        </button>

        <VariantButton count={question.variations?.length ?? 0} />
      </div>

      {/* Solution accordion panel */}
      {solutionOpen && (
        <div className="border-t border-blue-100 dark:border-blue-900/60 bg-blue-50/40 dark:bg-blue-950/20 px-5 py-5">
          <p className="text-[0.6875rem] font-semibold uppercase tracking-widest text-blue-600 dark:text-blue-400 mb-3">
            参考答案与解析
          </p>
          <MathRenderer content={solutionContent} />
        </div>
      )}
    </article>
  );
}

function VariantButton({ count }: { count: number }) {
  return (
    <button
      disabled={count === 0}
      title={count === 0 ? '暂无变式题' : `${count} 道变式题`}
      className="ml-auto flex items-center gap-1.5 text-sm font-medium text-zinc-500 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-1.5 hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
    >
      <Layers size={14} />
      查看变式题
      {count > 0 && (
        <span className="text-[0.625rem] font-semibold bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300 px-1.5 py-0.5 rounded-full leading-none">
          {count}
        </span>
      )}
    </button>
  );
}
