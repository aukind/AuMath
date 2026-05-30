'use client';

import { useState, useTransition } from 'react';
import { ChevronDown, GripVertical, Layers, Pencil, Star, Trash2, X } from 'lucide-react';
import MathRenderer from '@/components/MathRenderer';
import QuestionInteractiveSandbox from '@/components/QuestionInteractiveSandbox';
import { toggleFavorite, markError, removeError, recordView } from '@/app/actions/user-workspace';
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
  /** true if current user can delete/drag this question (admin OR owner of private question) */
  canModify?: boolean;
  onDelete?: (id: string) => void;
  isDragging?: boolean;
  dragHandleProps?: Record<string, unknown>;
  isLoggedIn?: boolean;
  initialFavorited?: boolean;
  initialErrored?: boolean;
}

function normalizeOptions(raw: unknown): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw === 'object') {
    return Object.entries(raw as Record<string, unknown>).map(
      ([k, v]) => `**${k}.** ${v}`,
    );
  }
  return [];
}

export default function QuestionCard({ question, isAdmin = false, canModify, onDelete, isDragging = false, dragHandleProps, isLoggedIn = false, initialFavorited = false, initialErrored = false }: QuestionCardProps) {
  const effectiveCanModify = canModify ?? isAdmin;
  const [solutionOpen, setSolutionOpen] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [favorited, setFavorited] = useState(initialFavorited);
  const [errored, setErrored] = useState(initialErrored);
  const [isPending, startTransition] = useTransition();

  function handleToggleSolution() {
    const opening = !solutionOpen;
    setSolutionOpen(opening);
    if (opening && isLoggedIn) {
      recordView(question.id).catch(() => {});
    }
  }

  function handleToggleFavorite(e: React.MouseEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await toggleFavorite(question.id);
      if (result.success) setFavorited(result.favorited);
    });
  }

  function handleToggleError() {
    startTransition(async () => {
      if (errored) {
        const result = await removeError(question.id);
        if (result.success) setErrored(false);
      } else {
        const result = await markError(question.id);
        if (result.success) setErrored(true);
      }
    });
  }

  const primaryTopic = (question.question_topic_relations.find(r => r.is_primary) ?? question.question_topic_relations[0])?.topics;
  const diff = DIFFICULTY_META[question.difficulty] ?? { label: '未知', cls: 'text-zinc-600 bg-zinc-100' };
  const solutionContent = [question.answer, question.analysis || question.solution].filter(Boolean).join('\n\n---\n\n');
  const options = normalizeOptions(question.metadata?.options);

  // Gemini 经常把 (A)/(B)/(C)/(D) 同时塞进 content 和 options，于是渲染两遍。
  // 当本题有 options 且 content 末尾刚好出现 (A)...(B)...(C)...(D) 序列时，
  // 把这段尾巴砍掉，避免视觉上重复。
  const displayContent = options.length >= 2
    ? question.content.replace(/\s*\(A\)[\s\S]*?\(B\)[\s\S]*?(?:\(C\)[\s\S]*?)?(?:\(D\)[\s\S]*?)?$/, '').trimEnd()
    : question.content;

  async function handleConfirmDelete() {
    if (!onDelete) return;
    setDeleting(true);
    onDelete(question.id);
    setShowConfirm(false);
    setDeleting(false);
  }

  return (
    <>
      <article
        className={[
          'group rounded-2xl border border-zinc-100 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden',
          isDragging ? 'opacity-40' : 'opacity-100',
        ].join(' ')}
      >
        {/* Card header */}
        <div className="flex flex-wrap items-center gap-2 px-5 py-2.5 border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-800/30">
          {dragHandleProps && (
            <button
              type="button"
              {...(dragHandleProps as React.ButtonHTMLAttributes<HTMLButtonElement>)}
              title="拖拽归类"
              className="flex items-center justify-center w-5 h-5 -ml-2 rounded text-zinc-300 dark:text-zinc-600 hover:text-zinc-500 dark:hover:text-zinc-400 cursor-grab active:cursor-grabbing touch-none shrink-0 transition-colors"
            >
              <GripVertical size={13} />
            </button>
          )}
          <span className={`text-[0.6875rem] font-semibold px-2 py-0.5 rounded-full ${diff.cls}`}>
            {diff.label}
          </span>
          {primaryTopic && (
            <span className="text-xs text-zinc-500 dark:text-zinc-400">{primaryTopic.name}</span>
          )}
          <div className="ml-auto flex items-center gap-2 text-xs text-zinc-400">
            {isLoggedIn && (
              <button
                onClick={handleToggleFavorite}
                disabled={isPending}
                title={favorited ? '取消收藏' : '收藏此题'}
                className={[
                  'flex items-center justify-center w-6 h-6 rounded-md transition-colors',
                  favorited
                    ? 'text-amber-400 hover:text-amber-500'
                    : 'text-zinc-300 dark:text-zinc-600 hover:text-amber-400 dark:hover:text-amber-500',
                  isPending && 'opacity-50 cursor-not-allowed',
                ].join(' ')}
              >
                <Star size={13} fill={favorited ? 'currentColor' : 'none'} />
              </button>
            )}
            {question.year && <span>{question.year} 年</span>}
            {question.source && <span>{question.source}</span>}
            {(isAdmin || (effectiveCanModify && onDelete)) && (
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                {isAdmin && (
                  <a
                    href={`/admin/edit/${question.id}`}
                    title="编辑题目"
                    className="flex items-center gap-1 px-2 py-0.5 rounded-md border border-zinc-200 dark:border-zinc-700 text-zinc-400 hover:text-blue-600 hover:border-blue-300 dark:hover:text-blue-400 dark:hover:border-blue-700 transition-colors"
                  >
                    <Pencil size={11} /> 编辑
                  </a>
                )}
                {effectiveCanModify && onDelete && (
                  <button
                    onClick={() => setShowConfirm(true)}
                    title="删除题目"
                    className="flex items-center gap-1 px-2 py-0.5 rounded-md border border-zinc-200 dark:border-zinc-700 text-zinc-400 hover:text-red-600 hover:border-red-300 dark:hover:text-red-500 dark:hover:border-red-700 transition-colors"
                  >
                    <Trash2 size={11} /> 删除
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Question body */}
        <div className="px-5 pt-5 pb-1 text-[15px]">
          <MathRenderer content={displayContent} />
        </div>

        {/* Interactive Rive sandbox — 仅当题目配置了交互动画时渲染 */}
        {question.interactive_sandbox && (
          <QuestionInteractiveSandbox config={question.interactive_sandbox} />
        )}

        {/* Options — 字号、行距与题干完全一致，确保 1990 年代高考排版的整齐 */}
        {options.length > 0 && (
          <div className={`px-5 pb-4 pt-2 grid gap-x-8 gap-y-2 ${options.length <= 2 ? 'grid-cols-1' : 'grid-cols-2'}`}>
            {options.map((opt, i) => (
              <div key={i} className="text-[15px] [&_.prose_p]:my-0 [&_.prose_p]:leading-[1.85]">
                <MathRenderer content={opt} />
              </div>
            ))}
          </div>
        )}

        {/* Action bar */}
        <div className="flex items-center gap-2 px-5 py-3 border-t border-zinc-100 dark:border-zinc-800">
          <button
            onClick={handleToggleSolution}
            className="flex items-center gap-1.5 text-sm font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
          >
            <ChevronDown
              size={15}
              className={`transition-transform duration-200 ${solutionOpen ? 'rotate-180' : ''}`}
            />
            {solutionOpen ? '收起解析' : '查看解析'}
          </button>
          {isLoggedIn && (
            <button
              onClick={handleToggleError}
              disabled={isPending}
              title={errored ? '点击从错题本移除' : '标记为错题'}
              className={[
                'flex items-center gap-1 text-xs px-2 py-1 rounded-md border transition-colors',
                errored
                  ? 'border-green-200 dark:border-green-800 text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-950/30 hover:border-red-300 dark:hover:border-red-700 hover:text-red-500 dark:hover:text-red-400 hover:bg-transparent'
                  : 'border-zinc-200 dark:border-zinc-700 text-zinc-400 hover:border-red-300 dark:hover:border-red-700 hover:text-red-500 dark:hover:text-red-400',
                isPending && 'opacity-50 cursor-not-allowed',
              ].join(' ')}
            >
              {errored ? '✓ 已记录' : '我做错了'}
            </button>
          )}
          <VariantButton count={question.variations?.length ?? 0} />
        </div>

        {/* Solution panel */}
        {solutionOpen && (
          <div className="border-t border-blue-100 dark:border-blue-900/60 bg-blue-50/40 dark:bg-blue-950/20 px-5 py-5">
            <p className="text-[0.6875rem] font-semibold uppercase tracking-widest text-blue-600 dark:text-blue-400 mb-3">
              参考答案与解析
            </p>
            <MathRenderer content={solutionContent} />
          </div>
        )}
      </article>

      {/* Delete confirm modal */}
      {showConfirm && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setShowConfirm(false)}
          />
          <div className="relative bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl w-full max-w-xs p-6 border border-zinc-200 dark:border-zinc-800">
            <button
              onClick={() => setShowConfirm(false)}
              className="absolute top-4 right-4 p-1 rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            >
              <X size={16} />
            </button>
            <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-red-50 dark:bg-red-950/40 mb-4 mx-auto">
              <Trash2 size={22} className="text-red-600 dark:text-red-400" />
            </div>
            <h2 className="text-center font-semibold text-zinc-900 dark:text-zinc-100 mb-1">
              确认删除
            </h2>
            <p className="text-center text-sm text-zinc-500 dark:text-zinc-400 mb-6">
              此操作不可撤销，题目将从题库中永久移除。
            </p>
            <div className="flex gap-2.5">
              <button
                onClick={() => setShowConfirm(false)}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleConfirmDelete}
                disabled={deleting}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-red-600 text-white hover:bg-red-700 active:scale-95 transition-all disabled:opacity-60"
              >
                {deleting ? '删除中…' : '确认删除'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
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
