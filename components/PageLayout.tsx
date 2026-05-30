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
import {
  GripVertical, PenLine, CheckCircle2, Lock, LogIn,
  MessagesSquare, BookMarked, Star, XCircle, Clock, ChevronLeft, Plus,
} from 'lucide-react';
import SidebarTabs from '@/components/SidebarTabs';
import SortSelect from '@/components/SortSelect';
import QuestionSearch from '@/components/QuestionSearch';
import SiteViewsBadge from '@/components/SiteViewsBadge';
import ForumPostList from '@/components/forum/ForumPostList';
import DashboardWorkspace from '@/components/dashboard/DashboardWorkspace';
import type { TabItem } from '@/components/ui/AnimatedTabs';
import { deleteQuestion, updateQuestionCategory } from '@/app/actions/questions';
import type { SortOrder } from '@/app/actions/questions';
import type { TopicWithChildren, PaperRow, QuestionWithTopics, WorkspaceType } from '@/types/database';
import type { ForumPost } from '@/types/forum';

/** 主区显示模式：社区论坛 / 我的题库 / 题目浏览（点侧边栏知识点·真题·模拟题）。 */
export type MainView = 'forum' | 'mybank' | 'browse';

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
  mainView: MainView;
  forumPosts: ForumPost[];
  mybankTab: WorkspaceType;
  favoritedIds: string[];
  erroredIds: string[];
  siteViews: number;
}

const MYBANK_TABS: { key: WorkspaceType; label: string; icon: typeof Star }[] = [
  { key: 'favorites', label: '我的收藏', icon: Star },
  { key: 'errors', label: '我的错题', icon: XCircle },
  { key: 'history', label: '最近浏览', icon: Clock },
];

/** 顶层工作区切换：社区论坛 / 我的题库（Magic Tab）。 */
const WORKSPACE_TABS: TabItem[] = [
  { id: 'forum', label: '社区论坛', icon: <MessagesSquare size={14} /> },
  { id: 'bank', label: '我的题库', icon: <BookMarked size={14} /> },
];

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
  mainView,
  forumPosts,
  mybankTab,
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

  // ── 顶层 论坛/题库 切换：纯客户端态，软更新 URL（不触发服务端导航，刷新/分享仍保留当前页）──
  const syncWorkspaceUrl = useCallback((tabId: string) => {
    const url = tabId === 'bank' ? '/?view=mybank' : '/';
    window.history.replaceState(window.history.state, '', url);
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

  // ── DnD（仅题目浏览模式下用于管理员拖拽归类）─────────────────
  const [activeQuestion, setActiveQuestion] = useState<QuestionWithTopics | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  function handleDragStart(event: DragStartEvent) {
    setActiveQuestion(questions.find(q => q.id === event.active.id) ?? null);
  }

  async function handleDragEnd(event: DragEndEvent) {
    setActiveQuestion(null);
    const { active, over } = event;
    if (!over) return;
    const categoryName = (over.data.current as { name?: string })?.name;
    if (!categoryName) return;
    const result = await updateQuestionCategory(active.id as string, over.id as string, categoryName);
    showToast(result.success ? `已归类到「${categoryName}」` : `归类失败：${result.error}`, result.success ? 'success' : 'error');
  }

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
          />
          <div className="mt-auto flex flex-col gap-2 pt-3 border-t border-zinc-100 dark:border-zinc-800">
            <SiteViewsBadge initialCount={siteViews} />
          </div>
        </aside>

        {/* ── Main content ── */}
        <main className="flex-1 min-w-0 overflow-y-auto px-4 sm:px-6 py-6">

          {mainView === 'browse' ? (
            <BrowseView
              pageTitle={pageTitle}
              activePaper={activePaper}
              validSort={validSort}
              topicId={topicId}
              paperId={paperId}
              questions={visibleQuestions}
              hasTopics={topics.length > 0}
              isAdmin={isAdmin}
              isLoggedIn={isLoggedIn}
              userId={userId}
              favoritedIds={favoritedIds}
              erroredIds={erroredIds}
              onDelete={handleDelete}
            />
          ) : (
            // ── 论坛 / 我的题库：Magic Tab + 伪 Keep-Alive，两棵子树常驻、0ms 秒切 ──
            <DashboardWorkspace
              tabs={WORKSPACE_TABS}
              defaultTab={mainView === 'mybank' ? 'bank' : 'forum'}
              onTabChange={syncWorkspaceUrl}
              forum={<ForumPostList posts={forumPosts} canPost={isLoggedIn} />}
              bank={
                isLoggedIn ? (
                  <MyBankView
                    tab={mybankTab}
                    questions={visibleQuestions}
                    isAdmin={isAdmin}
                    isLoggedIn={isLoggedIn}
                    userId={userId}
                    favoritedIds={favoritedIds}
                    erroredIds={erroredIds}
                    onDelete={handleDelete}
                  />
                ) : (
                  <MyBankGate />
                )
              }
            />
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

// ── 题目浏览（点侧边栏知识点 / 真题 / 模拟题）────────────────
function BrowseView({
  pageTitle, activePaper, validSort, topicId, paperId,
  questions, hasTopics, isAdmin, isLoggedIn, userId, favoritedIds, erroredIds, onDelete,
}: {
  pageTitle: string;
  activePaper: PaperRow | null;
  validSort: SortOrder;
  topicId?: string;
  paperId?: string;
  questions: QuestionWithTopics[];
  hasTopics: boolean;
  isAdmin: boolean;
  isLoggedIn: boolean;
  userId?: string;
  favoritedIds: string[];
  erroredIds: string[];
  onDelete: (id: string) => void;
}) {
  return (
    <>
      <a href="/" className="inline-flex items-center gap-1 mb-4 text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors">
        <ChevronLeft size={13} /> 返回社区
      </a>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">{pageTitle}</h1>
          {activePaper?.year && <span className="text-xs text-zinc-400">{activePaper.year} 年</span>}
          {questions.length > 0 && <p className="text-xs text-zinc-400 mt-0.5">共 {questions.length} 道题</p>}
        </div>
        {!paperId && <SortSelect value={validSort} topicId={topicId} />}
      </div>

      {questions.length === 0 ? (
        <EmptyBrowse hasTopics={hasTopics} isAdmin={isAdmin} />
      ) : (
        <QuestionSearch
          questions={questions}
          isAdmin={isAdmin}
          isLoggedIn={isLoggedIn}
          userId={userId}
          onDelete={onDelete}
          favoritedIds={favoritedIds}
          erroredIds={erroredIds}
        />
      )}
    </>
  );
}

// ── 我的题库（收藏 / 错题 / 最近浏览）────────────────────────
function MyBankView({
  tab, questions, isAdmin, isLoggedIn, userId, favoritedIds, erroredIds, onDelete,
}: {
  tab: WorkspaceType;
  questions: QuestionWithTopics[];
  isAdmin: boolean;
  isLoggedIn: boolean;
  userId?: string;
  favoritedIds: string[];
  erroredIds: string[];
  onDelete: (id: string) => void;
}) {
  const meta: Record<WorkspaceType, { title: string; empty: string }> = {
    favorites: { title: '我的收藏', empty: '还没有收藏任何题目。浏览题目时点 ★ 即可加入收藏。' },
    errors: { title: '我的错题', empty: '错题本是空的。做题时标记错题，方便日后复盘。' },
    history: { title: '最近浏览', empty: '还没有浏览记录。' },
  };

  return (
    <div>
      {/* 子标签 + 自己录题 */}
      <div className="flex items-center gap-1 mb-5 border-b border-zinc-200 dark:border-zinc-800">
        {MYBANK_TABS.map(({ key, label, icon: Icon }) => (
          <a
            key={key}
            href={`/?view=mybank&workspace=${key}`}
            className={[
              'flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
              tab === key
                ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
                : 'border-transparent text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300',
            ].join(' ')}
          >
            <Icon size={14} /> {label}
          </a>
        ))}
        {tab !== 'history' && (
          <a
            href={`/mybank/new?target=${tab}`}
            className="ml-auto mb-1 inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-1 text-xs font-medium text-white hover:bg-indigo-700"
          >
            <Plus size={13} /> 自己录题
          </a>
        )}
      </div>

      {questions.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 py-24 text-center max-w-sm mx-auto">
          <div className="text-4xl">{tab === 'favorites' ? '⭐' : tab === 'errors' ? '✗' : '🕒'}</div>
          <h2 className="font-semibold text-zinc-700 dark:text-zinc-300">{meta[tab].title}为空</h2>
          <p className="text-sm text-zinc-400 leading-relaxed">{meta[tab].empty}</p>
        </div>
      ) : (
        <>
          <p className="mb-4 text-xs text-zinc-400">共 {questions.length} 道题</p>
          <QuestionSearch
            questions={questions}
            isAdmin={isAdmin}
            isLoggedIn={isLoggedIn}
            userId={userId}
            onDelete={onDelete}
            favoritedIds={favoritedIds}
            erroredIds={erroredIds}
          />
        </>
      )}
    </div>
  );
}

function MyBankGate() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center max-w-sm mx-auto gap-4">
      <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-zinc-100 dark:bg-zinc-800">
        <Lock size={28} className="text-zinc-400" />
      </div>
      <h2 className="font-semibold text-zinc-800 dark:text-zinc-200 text-base">需要登录</h2>
      <p className="text-sm text-zinc-400 leading-relaxed">登录后即可查看你的收藏、错题与浏览记录。</p>
      <div className="flex gap-2.5 mt-1">
        <a href="/login" className="flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors">
          <LogIn size={14} /> 立即登录
        </a>
        <a href="/signup" className="flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors">
          免费注册
        </a>
      </div>
    </div>
  );
}

function EmptyBrowse({ hasTopics, isAdmin }: { hasTopics: boolean; isAdmin: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center max-w-sm mx-auto gap-3">
      <div className="text-4xl">📐</div>
      <h2 className="font-semibold text-zinc-700 dark:text-zinc-300">暂无题目</h2>
      <p className="text-sm text-zinc-400 leading-relaxed">
        {hasTopics ? '当前知识点下还没有已发布的题目。' : '题库为空。'}
      </p>
      {isAdmin && (
        <a href="/admin/add" className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors">
          <PenLine size={14} /> 录入第一道题
        </a>
      )}
    </div>
  );
}
