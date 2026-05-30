'use client';

import { useState, useCallback, useEffect } from 'react';
import {
  DndContext,
  DragOverlay,
  DragEndEvent,
  DragStartEvent,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { GripVertical, PenLine, CheckCircle2, Lock, LogIn, BookOpen, BookMarked } from 'lucide-react';
import SidebarTabs from '@/components/SidebarTabs';
import SortSelect from '@/components/SortSelect';
import QuestionSearch from '@/components/QuestionSearch';
import SiteViewsBadge from '@/components/SiteViewsBadge';
import { deleteQuestion, updateQuestionCategory } from '@/app/actions/questions';
import type { SortOrder, BankView } from '@/app/actions/questions';
import type { TopicWithChildren, PaperRow, QuestionWithTopics, WorkspaceCounts, WorkspaceType } from '@/types/database';

interface PageLayoutProps {
  topics: TopicWithChildren[];
  papers: PaperRow[];
  questions: QuestionWithTopics[];
  isAdmin: boolean;
  isLoggedIn: boolean;
  userId?: string;
  topicId?: string;
  paperId?: string;
  pageTitle: string;
  activePaper: PaperRow | null;
  validSort: SortOrder;
  bankView: BankView;
  workspaceCounts: WorkspaceCounts;
  activeWorkspace?: WorkspaceType;
  favoritedIds: string[];
  erroredIds: string[];
  siteViews: number;
}

export default function PageLayout({
  topics,
  papers,
  questions,
  isAdmin,
  isLoggedIn,
  userId,
  topicId,
  paperId,
  pageTitle,
  activePaper,
  validSort,
  bankView,
  workspaceCounts,
  activeWorkspace,
  favoritedIds,
  erroredIds,
  siteViews,
}: PageLayoutProps) {
  // ── Optimistic delete ────────────────────────────────────────
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set());
  const visibleQuestions = questions.filter(q => !deletedIds.has(q.id));

  const handleDelete = useCallback(async (id: string) => {
    setDeletedIds(prev => new Set([...prev, id]));
    const result = await deleteQuestion(id);
    if (!result.success) {
      setDeletedIds(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      showToast(`删除失败：${result.error}`, 'error');
    }
  }, []);

  // ── Toast ────────────────────────────────────────────────────
  const [toast, setToast] = useState<{ msg: string; kind: 'success' | 'error' } | null>(null);

  function showToast(msg: string, kind: 'success' | 'error' = 'success') {
    setToast({ msg, kind });
  }

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2800);
    return () => clearTimeout(t);
  }, [toast]);

  // ── DnD ─────────────────────────────────────────────────────
  const [activeQuestion, setActiveQuestion] = useState<QuestionWithTopics | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  function handleDragStart(event: DragStartEvent) {
    const q = questions.find(q => q.id === event.active.id);
    setActiveQuestion(q ?? null);
  }

  async function handleDragEnd(event: DragEndEvent) {
    setActiveQuestion(null);
    const { active, over } = event;
    if (!over) return;

    const questionId = active.id as string;
    const dropTopicId = over.id as string;
    const categoryName = (over.data.current as { name?: string })?.name;
    if (!categoryName) return;

    const result = await updateQuestionCategory(questionId, dropTopicId, categoryName);
    if (result.success) {
      showToast(`已归类到「${categoryName}」`);
    } else {
      showToast(`归类失败：${result.error}`, 'error');
    }
  }

  // ── Bank switcher URL builders ───────────────────────────────
  function bankHref(view: BankView) {
    const params = new URLSearchParams();
    if (view === 'private') params.set('bank', 'private');
    if (topicId) params.set('topic', topicId);
    if (paperId) params.set('paper', paperId);
    const qs = params.toString();
    return qs ? `/?${qs}` : '/';
  }

  const isPrivate = bankView === 'private';

  return (
    <DndContext sensors={sensors} collisionDetection={pointerWithin} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="mx-auto max-w-7xl w-full flex flex-1 overflow-hidden">

        {/* ── Desktop sidebar ── */}
        <aside className="hidden lg:flex flex-col w-56 xl:w-64 shrink-0 border-r border-zinc-200/70 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/60 px-3 py-5 gap-3 overflow-y-auto">
          <SidebarTabs
            topics={topics}
            papers={papers}
            selectedTopicId={paperId ? undefined : topicId}
            selectedPaperId={paperId}
            isAdmin={isAdmin}
            workspaceCounts={workspaceCounts}
            activeWorkspace={activeWorkspace}
          />

          <div className="mt-auto flex flex-col gap-2 pt-3 border-t border-zinc-100 dark:border-zinc-800">
            {(topicId || paperId) && (
              <a href="/" className="block text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors">
                ← 返回全部题目
              </a>
            )}
            <a href="/forum" className="block text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors">
              💬 社区讨论区
            </a>
            <SiteViewsBadge initialCount={siteViews} />
          </div>
        </aside>

        {/* ── Main content ── */}
        <main className="flex-1 min-w-0 overflow-y-auto px-4 sm:px-6 py-6">

          {/* ── 公共/私人题库切换器 ── */}
          {!paperId && !activeWorkspace && (
            <div className="flex items-center gap-1 mb-5 p-1 rounded-xl bg-zinc-100 dark:bg-zinc-800/80 w-fit">
              <a
                href={bankHref('public')}
                className={[
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150',
                  !isPrivate
                    ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm'
                    : 'text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300',
                ].join(' ')}
              >
                <BookOpen size={12} />
                公共题库
              </a>
              <a
                href={bankHref('private')}
                className={[
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150',
                  isPrivate
                    ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm'
                    : 'text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300',
                ].join(' ')}
              >
                <BookMarked size={12} />
                我的题库
              </a>
            </div>
          )}

          {/* 私人题库 + 未登录 → 引导登录 */}
          {isPrivate && !isLoggedIn ? (
            <PrivateBankGate />
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
                <div>
                  <h1 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
                    {isPrivate ? '我的题库' : pageTitle}
                  </h1>
                  {activePaper?.year && (
                    <span className="text-xs text-zinc-400">{activePaper.year} 年</span>
                  )}
                  {visibleQuestions.length > 0 && (
                    <p className="text-xs text-zinc-400 mt-0.5">共 {visibleQuestions.length} 道题</p>
                  )}
                </div>
                {!paperId && !isPrivate && <SortSelect value={validSort} topicId={topicId} />}
              </div>

              {visibleQuestions.length === 0 ? (
                <EmptyState
                  hasTopics={topics.length > 0}
                  isAdmin={isAdmin}
                  isPrivate={isPrivate}
                />
              ) : (
                <QuestionSearch
                  questions={visibleQuestions}
                  isAdmin={isAdmin}
                  isLoggedIn={isLoggedIn}
                  userId={userId}
                  onDelete={handleDelete}
                  favoritedIds={favoritedIds}
                  erroredIds={erroredIds}
                />
              )}
            </>
          )}
        </main>
      </div>

      {/* ── Drag overlay ghost ── */}
      <DragOverlay dropAnimation={null}>
        {activeQuestion && (
          <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-white dark:bg-zinc-900 border-2 border-blue-400 dark:border-blue-600 shadow-2xl shadow-blue-500/20 text-sm font-medium text-zinc-700 dark:text-zinc-300 max-w-xs cursor-grabbing">
            <GripVertical size={14} className="text-blue-500 shrink-0" />
            <span className="truncate">
              {activeQuestion.source || activeQuestion.content.slice(0, 40).replace(/\$[^$]*\$/g, '…')}
            </span>
          </div>
        )}
      </DragOverlay>

      {/* ── Toast notification ── */}
      {toast && (
        <div
          className={[
            'fixed bottom-24 left-1/2 -translate-x-1/2 z-[300] flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium shadow-xl whitespace-nowrap pointer-events-none',
            toast.kind === 'success'
              ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900'
              : 'bg-red-600 text-white',
          ].join(' ')}
        >
          {toast.kind === 'success' && <CheckCircle2 size={15} className="shrink-0" />}
          {toast.msg}
        </div>
      )}
    </DndContext>
  );
}

function PrivateBankGate() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center max-w-sm mx-auto gap-4">
      <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-zinc-100 dark:bg-zinc-800">
        <Lock size={28} className="text-zinc-400" />
      </div>
      <h2 className="font-semibold text-zinc-800 dark:text-zinc-200 text-base">需要登录</h2>
      <p className="text-sm text-zinc-400 leading-relaxed">
        登录后即可查看与管理你的私人题库。
      </p>
      <div className="flex gap-2.5 mt-1">
        <a
          href="/login"
          className="flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors"
        >
          <LogIn size={14} /> 立即登录
        </a>
        <a
          href="/signup"
          className="flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
        >
          免费注册
        </a>
      </div>
    </div>
  );
}

function EmptyState({
  hasTopics,
  isAdmin,
  isPrivate,
}: {
  hasTopics: boolean;
  isAdmin: boolean;
  isPrivate: boolean;
}) {
  if (isPrivate) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center max-w-sm mx-auto gap-3">
        <div className="text-4xl">📝</div>
        <h2 className="font-semibold text-zinc-700 dark:text-zinc-300">私人题库为空</h2>
        <p className="text-sm text-zinc-400 leading-relaxed">
          还没有录入任何私人题目，点击右上角「录入题目」开始添加。
        </p>
        <a
          href="/admin/add"
          className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors"
        >
          <PenLine size={14} /> 录入第一道题
        </a>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center py-24 text-center max-w-sm mx-auto gap-3">
      <div className="text-4xl">📐</div>
      <h2 className="font-semibold text-zinc-700 dark:text-zinc-300">暂无题目</h2>
      <p className="text-sm text-zinc-400 leading-relaxed">
        {hasTopics ? '当前知识点下还没有已发布的题目。' : '题库为空。'}
      </p>
      {isAdmin && (
        <a
          href="/admin/add"
          className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors"
        >
          <PenLine size={14} /> 录入第一道题
        </a>
      )}
    </div>
  );
}
