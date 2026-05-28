'use client';

import { useState, useMemo, useEffect } from 'react';
import { Search, X, SearchX, FileText } from 'lucide-react';
import QuestionCard from '@/components/QuestionCard';
import PrintContainer from '@/components/PrintContainer';
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
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [printQuestions, setPrintQuestions] = useState<QuestionWithTopics[]>([]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return questions;
    return questions.filter(question => matchesQuery(question, q));
  }, [questions, query]);

  const isSearching = query.trim().length > 0;
  const selectedCount = selectedIds.size;
  const allFilteredSelected =
    filtered.length > 0 && filtered.every(q => selectedIds.has(q.id));

  // Wait for KaTeX to render inside the portal, then trigger print dialog
  useEffect(() => {
    if (printQuestions.length === 0) return;
    const timer = setTimeout(() => {
      window.print();
      setPrintQuestions([]);
    }, 400);
    return () => clearTimeout(timer);
  }, [printQuestions]);

  function toggleSelection(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (allFilteredSelected) {
        filtered.forEach(q => next.delete(q.id));
      } else {
        filtered.forEach(q => next.add(q.id));
      }
      return next;
    });
  }

  function handleGeneratePDF() {
    // Preserve the filtered display order
    const selected = filtered.filter(q => selectedIds.has(q.id));
    if (selected.length === 0) return;
    setPrintQuestions(selected);
  }

  return (
    <div>
      {/* Search bar + Generate PDF button */}
      <div className="flex gap-3 max-w-3xl mb-3 items-center">
        <div className="relative flex-1">
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

        <button
          onClick={handleGeneratePDF}
          disabled={selectedCount === 0}
          className="shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all
            bg-blue-600 text-white hover:bg-blue-700 active:scale-95
            disabled:bg-zinc-100 disabled:text-zinc-400 disabled:cursor-not-allowed disabled:active:scale-100
            dark:disabled:bg-zinc-800 dark:disabled:text-zinc-600"
        >
          <FileText size={15} />
          生成讲义
          {selectedCount > 0 && (
            <span className="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full bg-white/25 text-xs font-bold leading-none">
              {selectedCount}
            </span>
          )}
        </button>
      </div>

      {/* Selection controls row */}
      {filtered.length > 0 && (
        <div className="flex items-center gap-4 max-w-3xl mb-4 px-0.5">
          <label className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={allFilteredSelected}
              onChange={toggleSelectAll}
              className="w-3.5 h-3.5 rounded accent-blue-600"
            />
            全选当前列表（{filtered.length} 题）
          </label>

          {selectedCount > 0 && (
            <span className="text-xs font-medium text-blue-600 dark:text-blue-400">
              已选 {selectedCount} 题
            </span>
          )}

          {isSearching && (
            <span className="ml-auto text-xs text-zinc-400">
              找到{' '}
              <span className="font-semibold text-zinc-600 dark:text-zinc-300">
                {filtered.length}
              </span>{' '}
              道相关题目
            </span>
          )}
        </div>
      )}

      {/* Empty search state */}
      {isSearching && filtered.length === 0 ? (
        <EmptySearch query={query} />
      ) : (
        <div className="space-y-5 max-w-3xl">
          {filtered.map(q => (
            <div key={q.id} className="flex items-start gap-3">
              <label className="flex items-center pt-3 cursor-pointer shrink-0">
                <input
                  type="checkbox"
                  checked={selectedIds.has(q.id)}
                  onChange={() => toggleSelection(q.id)}
                  className="w-4 h-4 rounded accent-blue-600 cursor-pointer"
                />
              </label>
              <div className="flex-1 min-w-0">
                <QuestionCard question={q} isAdmin={isAdmin} />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Print portal — hidden on screen, visible only when printing */}
      <PrintContainer questions={printQuestions} />
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
