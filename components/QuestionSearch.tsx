'use client';

import { useState, useMemo } from 'react';
import { Search, X, SearchX } from 'lucide-react';
import QuestionCard from '@/components/QuestionCard';
import type { QuestionWithTopics } from '@/types/database';

interface Props {
  questions: QuestionWithTopics[];
  isAdmin: boolean;
}

/** 去掉 LaTeX 定界符和反斜杠命令，仅保留中文和字母，提升搜索准确性 */
function stripLatex(text: string): string {
  return text
    .replace(/\$\$[\s\S]*?\$\$/g, ' ')
    .replace(/\$[^$]*?\$/g, ' ')
    .replace(/\\[a-zA-Z]+/g, ' ')
    .replace(/[{}\[\]]/g, ' ');
}

function matchesQuery(question: QuestionWithTopics, q: string): boolean {
  const fields = [
    question.content,
    question.analysis ?? '',
    question.answer ?? '',
    question.source ?? '',
    question.question_topic_relations.map(r => r.topics?.name ?? '').join(' '),
  ];
  return fields.some(f => stripLatex(f).toLowerCase().includes(q));
}

export default function QuestionSearch({ questions, isAdmin }: Props) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return questions;
    return questions.filter(question => matchesQuery(question, q));
  }, [questions, query]);

  const isSearching = query.trim().length > 0;

  return (
    <div>
      {/* 搜索框 */}
      <div className="relative max-w-3xl mb-5">
        <Search
          size={15}
          className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400"
        />
        <input
          type="search"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="搜索题目内容、解析、知识点…"
          className="w-full rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 py-2.5 pl-10 pr-10 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 transition-all focus:outline-none focus:ring-2 focus:ring-blue-500/25 focus:border-blue-400 dark:focus:border-blue-600"
        />
        {isSearching && (
          <button
            onClick={() => setQuery('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-0.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors"
            aria-label="清空搜索"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* 搜索中：结果计数 */}
      {isSearching && filtered.length > 0 && (
        <p className="mb-4 text-xs text-zinc-400">
          找到{' '}
          <span className="font-semibold text-zinc-600 dark:text-zinc-300">
            {filtered.length}
          </span>{' '}
          道相关题目
        </p>
      )}

      {/* 空结果态 */}
      {isSearching && filtered.length === 0 ? (
        <EmptySearch query={query} />
      ) : (
        <div className="space-y-5 max-w-3xl">
          {filtered.map(q => (
            <QuestionCard key={q.id} question={q} isAdmin={isAdmin} />
          ))}
        </div>
      )}
    </div>
  );
}

function EmptySearch({ query }: { query: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center max-w-sm mx-auto gap-3">
      <SearchX size={36} className="text-zinc-300 dark:text-zinc-600" />
      <h2 className="font-semibold text-zinc-700 dark:text-zinc-300">未找到相关题目</h2>
      <p className="text-sm text-zinc-400 leading-relaxed">
        没有与{' '}
        <span className="font-medium text-zinc-600 dark:text-zinc-300">
          &ldquo;{query}&rdquo;
        </span>{' '}
        匹配的题目，试试其他关键词。
      </p>
    </div>
  );
}
