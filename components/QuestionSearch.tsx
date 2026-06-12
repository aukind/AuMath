'use client';

import { useState, useMemo } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { Search, X, SearchX, FileText, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import QuestionCard from '@/components/QuestionCard';
import { generateLecturePdf } from '@/app/actions/lecture';
import type { LectureQuestion } from '@/lib/lecture/types';
import type { QuestionWithTopics } from '@/types/database';

interface Props {
  questions: QuestionWithTopics[];
  isAdmin: boolean;
  userId?: string;
  onDelete?: (id: string) => void;
  isLoggedIn?: boolean;
  /** 当前列表标题（如试卷名），用作讲义抬头与文件名 */
  title?: string;
}

/** 把完整题目压成讲义 PDF 所需的精简投影（客户端已持有全量数据，无需服务端再查库）。 */
function toLectureQuestion(q: QuestionWithTopics): LectureQuestion {
  const primaryTopic = (
    q.question_topic_relations.find(r => r.is_primary) ?? q.question_topic_relations[0]
  )?.topics;
  return {
    id: q.id,
    content: q.content,
    options: q.metadata?.options ?? null,
    answer: q.answer ?? null,
    analysis: q.analysis ?? null,
    solution: q.solution ?? null,
    source: q.source ?? null,
    year: q.year ?? null,
    difficulty: q.difficulty,
    topicName: primaryTopic?.name ?? null,
  };
}

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

function DraggableCard({
  question,
  isAdmin,
  canModify,
  onDelete,
  isLoggedIn,
}: {
  question: QuestionWithTopics;
  isAdmin: boolean;
  canModify: boolean;
  onDelete?: (id: string) => void;
  isLoggedIn?: boolean;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: question.id,
    disabled: !canModify,
    // 拖拽幽灵卡（PageLayout 的 DragOverlay）从事件里取题，免去父层持有全量题目数组
    data: { question },
  });

  return (
    <div ref={setNodeRef}>
      <QuestionCard
        question={question}
        isAdmin={isAdmin}
        canModify={canModify}
        onDelete={canModify ? onDelete : undefined}
        isDragging={isDragging}
        dragHandleProps={canModify ? { ...listeners, ...attributes } : undefined}
        isLoggedIn={isLoggedIn}
      />
    </div>
  );
}

export default function QuestionSearch({ questions, isAdmin, userId, onDelete, isLoggedIn = false, title }: Props) {
  const [query, setQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showExport, setShowExport] = useState(false);
  const [includeAnswers, setIncludeAnswers] = useState(false);
  const [generating, setGenerating] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return questions;
    return questions.filter(question => matchesQuery(question, q));
  }, [questions, query]);

  const isSearching = query.trim().length > 0;
  const selectedCount = selectedIds.size;
  const allFilteredSelected =
    filtered.length > 0 && filtered.every(q => selectedIds.has(q.id));

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
    if (selectedCount === 0) return;
    setShowExport(true);
  }

  async function handleDownload() {
    // 用全量 questions（而非当前 filtered）筛选，避免弹窗开着时改搜索词丢掉已选题
    const selected = questions.filter(q => selectedIds.has(q.id));
    if (selected.length === 0) return;
    setGenerating(true);
    try {
      const res = await generateLecturePdf(selected.map(toLectureQuestion), includeAnswers, title);
      if (!res.ok) {
        toast.error(res.error || 'PDF 生成失败');
        return;
      }
      const bytes = Uint8Array.from(atob(res.base64), c => c.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = res.filename;
      a.click();
      URL.revokeObjectURL(url);
      setShowExport(false);
      toast.success(`已生成讲义（${selected.length} 题）`);
    } catch {
      toast.error('PDF 生成失败，请重试');
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div>
      {/* 吸顶工具栏：搜索 + 生成讲义按钮常驻顶部，选完底部的题也无需滑回最上面 */}
      <div className="sticky top-0 z-20 -mx-4 sm:-mx-6 px-4 sm:px-6 py-3 mb-3 bg-zinc-50/85 dark:bg-zinc-950/85 backdrop-blur supports-[backdrop-filter]:bg-zinc-50/70 dark:supports-[backdrop-filter]:bg-zinc-950/70 border-b border-zinc-100 dark:border-zinc-800">
      <div className="flex gap-3 max-w-3xl items-center">
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
      </div>

      {/* Selection controls */}
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

      {/* Card list */}
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
                <DraggableCard
                  question={q}
                  isAdmin={isAdmin}
                  canModify={isAdmin || (!!userId && q.created_by === userId)}
                  onDelete={onDelete}
                  isLoggedIn={isLoggedIn}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 导出讲义弹窗：含答案开关 + 一键下载 */}
      {showExport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => !generating && setShowExport(false)}
          />
          <div className="relative bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl w-full max-w-sm p-6 border border-zinc-200 dark:border-zinc-800">
            <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-blue-50 dark:bg-blue-950/40 mb-4 mx-auto">
              <FileText size={22} className="text-blue-600 dark:text-blue-400" />
            </div>
            <h2 className="text-center font-semibold text-zinc-900 dark:text-zinc-100 mb-1">
              生成讲义 PDF
            </h2>
            <p className="text-center text-sm text-zinc-500 dark:text-zinc-400 mb-5">
              已选 {selectedCount} 题，将直接下载为 PDF 文件
            </p>

            {/* 含答案/解析开关 */}
            <label className="flex items-center justify-between gap-3 px-4 py-3 mb-5 rounded-xl border border-zinc-200 dark:border-zinc-700 cursor-pointer select-none">
              <span className="flex flex-col">
                <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">含答案与解析</span>
                <span className="text-xs text-zinc-400">关：练习卷（留空白解答区）· 开：教师版</span>
              </span>
              <input
                type="checkbox"
                checked={includeAnswers}
                onChange={e => setIncludeAnswers(e.target.checked)}
                disabled={generating}
                className="w-4 h-4 rounded accent-blue-600 shrink-0"
              />
            </label>

            <div className="flex gap-2.5">
              <button
                onClick={() => setShowExport(false)}
                disabled={generating}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors disabled:opacity-50"
              >
                取消
              </button>
              <button
                onClick={handleDownload}
                disabled={generating}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 active:scale-95 transition-all disabled:opacity-70 disabled:active:scale-100"
              >
                {generating ? (
                  <>
                    <Loader2 size={15} className="animate-spin" /> 生成中…
                  </>
                ) : (
                  '下载 PDF'
                )}
              </button>
            </div>
          </div>
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
