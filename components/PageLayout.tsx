'use client';

import { useId, useState, useCallback, useEffect, useTransition } from 'react';
import Link from 'next/link';
import { motion, LayoutGroup } from 'framer-motion';
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
  Star, XCircle, Clock, ChevronLeft, Plus, Loader2,
  BrainCircuit, ArrowRight, Library,
} from 'lucide-react';
import HomeSidebar from '@/components/HomeSidebar';
import { ZenModeProvider, useZenMode } from '@/components/layout/ZenModeProvider';
import ZenModeToggle from '@/components/layout/ZenModeToggle';
import SortSelect from '@/components/SortSelect';
import QuestionSearch from '@/components/QuestionSearch';
import SiteViewsBadge from '@/components/SiteViewsBadge';
import ForumPostList from '@/components/forum/ForumPostList';
import HeavyContentContainer from '@/components/dashboard/HeavyContentContainer';
import EditPaperButton from '@/components/admin/EditPaperButton';
import MyKnowledgeView from '@/components/knowledge/MyKnowledgeView';
import { useSoftNav, isPlainLeftClick } from '@/components/ui/useSoftNav';
import { deleteQuestion, updateQuestionCategory } from '@/app/actions/questions';
import type { SortOrder } from '@/app/actions/questions';
import type { TopicWithChildren, PaperRow, QuestionWithTopics, WorkspaceType } from '@/types/database';
import type { KnowledgeDoc } from '@/types/library';
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
  /** 我的题库当前在「知识库」标签页（workspace=documents），渲染 PDF 知识库而非题目。 */
  isDocsTab?: boolean;
  knowledgeDocs?: KnowledgeDoc[];
  favoritedIds: string[];
  erroredIds: string[];
  myRatings: Record<string, number>;
  siteViews: number;
  dueCount?: number;
}

const MYBANK_TABS: { key: WorkspaceType; label: string; icon: typeof Star }[] = [
  { key: 'favorites', label: '我的收藏', icon: Star },
  { key: 'errors', label: '我的错题', icon: XCircle },
  { key: 'history', label: '最近浏览', icon: Clock },
];

// 默认导出薄包装：注入 ZenModeProvider，使内部 aside/main 能 useZenMode()，
// 同时把 isZenMode 反射到 <html>.zen-active 驱动顶栏（位于 app/page.tsx）淡出。
export default function PageLayout(props: PageLayoutProps) {
  return (
    <ZenModeProvider>
      <PageLayoutInner {...props} />
    </ZenModeProvider>
  );
}

function PageLayoutInner({
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
  isDocsTab = false,
  knowledgeDocs = [],
  favoritedIds,
  erroredIds,
  myRatings,
  siteViews,
  dueCount = 0,
}: PageLayoutProps) {
  // ── 沉浸阅读模式 ──────────────────────────────────────────────
  const { isZenMode } = useZenMode();

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

  // ── 论坛/我的题库 切换：状态提升至此，由左栏主导航驱动；保留 0ms keep-alive 秒切 ──
  // workspace（urgent）驱动左栏高亮与 URL 软更新；contentWorkspace（transition）驱动重子树显隐。
  const [workspace, setWorkspace] = useState<'forum' | 'bank'>(mainView === 'mybank' ? 'bank' : 'forum');
  const [contentWorkspace, setContentWorkspace] = useState<'forum' | 'bank'>(mainView === 'mybank' ? 'bank' : 'forum');
  const [isWorkspacePending, startWorkspaceTransition] = useTransition();

  const switchWorkspace = useCallback((w: 'forum' | 'bank') => {
    if (w === workspace) return;
    setWorkspace(w); // 立即：左栏高亮瞬时响应（高优先级）
    // 软更新 URL（不触发服务端导航，刷新/分享仍保留当前视图）
    window.history.replaceState(window.history.state, '', w === 'bank' ? '/?view=mybank' : '/');
    startWorkspaceTransition(() => setContentWorkspace(w)); // 降级：重子树显隐（可中断的低优先级）
  }, [workspace]);

  // 服务端导航改变 mainView（如从 browse 返回、移动端跳转、刷新）时，于渲染期回灌工作区态
  // —— React 推荐的「随 prop 调整 state」模式，避免 effect 内 setState 的级联渲染。
  // 客户端秒切只走 replaceState、不改 mainView，故此处不会覆盖它。
  const [syncedMainView, setSyncedMainView] = useState(mainView);
  if (mainView !== syncedMainView) {
    setSyncedMainView(mainView);
    if (mainView !== 'browse') {
      const w: 'forum' | 'bank' = mainView === 'mybank' ? 'bank' : 'forum';
      setWorkspace(w);
      setContentWorkspace(w);
    }
  }

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
  // 显式给 DndContext 一个 SSR 稳定 id：否则 @dnd-kit 内部用自增计数器派生
  // aria-describedby（DndDescribedBy-N），服务端/客户端取值不一致 → 水合报错。
  const dndId = useId();

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
    <DndContext id={dndId} sensors={sensors} collisionDetection={pointerWithin} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="mx-auto max-w-7xl w-full flex flex-1 overflow-hidden">

        {/* ── Desktop sidebar：Linear 风全局导航 + 资源大厅/题库 语境面板 ── */}
        {/* Zen 时 track 折叠（w-0/px-0/border-0）让出整屏；淡出滑走由 globals.css
            的 [data-zen-chrome="left"] 接管。transition-all 保证宽度/内边距也平滑。 */}
        <aside
          data-zen-chrome="left"
          className={[
            'hidden lg:flex flex-col shrink-0 border-r border-zinc-200/70 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-900/40 py-5 gap-3 overflow-hidden',
            'transition-all duration-500',
            isZenMode ? 'lg:w-0 lg:px-0 lg:border-0' : 'w-56 xl:w-64 px-3',
          ].join(' ')}
        >
          <HomeSidebar
            topics={topics}
            papers={papers}
            selectedTopicId={paperId ? undefined : topicId}
            selectedPaperId={paperId}
            isAdmin={isAdmin}
            isLoggedIn={isLoggedIn}
            mainView={mainView}
            activeWorkspace={workspace}
            onWorkspaceChange={switchWorkspace}
          />
          <div className="mt-auto flex flex-col gap-2 pt-3 border-t border-zinc-100 dark:border-zinc-800">
            <SiteViewsBadge initialCount={siteViews} />
          </div>
        </aside>

        {/* ── Main content ── */}
        {/* scrollbar-gutter:stable 预留滚动条槽位，避免 chrome 淡出时横向位移抖动。 */}
        <main
          data-zen-reading
          className="flex-1 min-w-0 overflow-y-auto px-4 sm:px-6 py-6 [scrollbar-gutter:stable]"
        >
          {/* 固定阅读列宽：Zen 收成 max-w-3xl 居中，普通态保持原 max-w-none。
              侧栏 track 折叠只改变两侧留白、不改变文本换行点 → 无回流。 */}
          <div
            className={[
              'mx-auto w-full transition-[max-width] duration-500',
              isZenMode ? 'max-w-3xl' : 'max-w-none',
            ].join(' ')}
          >

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
              myRatings={myRatings}
              onDelete={handleDelete}
            />
          ) : (
            // ── 论坛 / 我的题库：左栏驱动 + 伪 Keep-Alive，两棵子树常驻、0ms 秒切 ──
            // isWorkspacePending 时容器轻微降透明，给「正在切」反馈而不阻塞点击。
            <div className={isWorkspacePending ? 'opacity-70 transition-opacity duration-200' : 'opacity-100 transition-opacity duration-200'}>
              <HeavyContentContainer
                activeTab={contentWorkspace}
                forum={<ForumPostList posts={forumPosts} canPost={isLoggedIn} />}
                bank={
                  isLoggedIn ? (
                    <MyBankView
                      tab={mybankTab}
                      isDocsTab={isDocsTab}
                      knowledgeDocs={knowledgeDocs}
                      questions={visibleQuestions}
                      isAdmin={isAdmin}
                      isLoggedIn={isLoggedIn}
                      userId={userId}
                      favoritedIds={favoritedIds}
                      erroredIds={erroredIds}
                      myRatings={myRatings}
                      dueCount={dueCount}
                      onDelete={handleDelete}
                    />
                  ) : (
                    <MyBankGate />
                  )
                }
              />
            </div>
          )}
          </div>
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

      {/* ── 沉浸阅读开关（右下角悬浮）── */}
      <ZenModeToggle />

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
  questions, hasTopics, isAdmin, isLoggedIn, userId, favoritedIds, erroredIds, myRatings, onDelete,
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
  myRatings: Record<string, number>;
  onDelete: (id: string) => void;
}) {
  const { navigate, isPending } = useSoftNav();
  return (
    <>
      <Link
        href="/"
        onClick={(e) => {
          if (!isPlainLeftClick(e)) return;
          e.preventDefault();
          navigate('/');
        }}
        className="inline-flex items-center gap-1 mb-4 text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors"
      >
        {isPending
          ? <Loader2 size={13} className="animate-spin" />
          : <ChevronLeft size={13} />}
        返回社区
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">{pageTitle}</h1>
          {activePaper?.year && <span className="text-xs text-zinc-400">{activePaper.year} 年</span>}
          {questions.length > 0 && <p className="text-xs text-zinc-400 mt-0.5">共 {questions.length} 道题</p>}
        </div>
        <div className="flex items-center gap-2">
          {/* 管理员：直接在浏览页编辑当前试卷信息 */}
          {isAdmin && activePaper && <EditPaperButton paper={activePaper} />}
          {!paperId && <SortSelect value={validSort} topicId={topicId} />}
        </div>
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
          myRatings={myRatings}
          title={pageTitle}
        />
      )}
    </>
  );
}

// ── 我的题库（收藏 / 错题 / 最近浏览）────────────────────────
function MyBankView({
  tab, isDocsTab = false, knowledgeDocs = [], questions, isAdmin, isLoggedIn, userId, favoritedIds, erroredIds, myRatings, dueCount = 0, onDelete,
}: {
  tab: WorkspaceType;
  isDocsTab?: boolean;
  knowledgeDocs?: KnowledgeDoc[];
  questions: QuestionWithTopics[];
  isAdmin: boolean;
  isLoggedIn: boolean;
  userId?: string;
  favoritedIds: string[];
  erroredIds: string[];
  myRatings: Record<string, number>;
  dueCount?: number;
  onDelete: (id: string) => void;
}) {
  const meta: Record<WorkspaceType, { title: string; empty: string }> = {
    favorites: { title: '我的收藏', empty: '还没有收藏任何题目。浏览题目时点 ★ 即可加入收藏。' },
    errors: { title: '我的错题', empty: '错题本是空的。做题时标记错题，方便日后复盘。' },
    history: { title: '最近浏览', empty: '还没有浏览记录。' },
  };

  const { navigate, isPending, pendingHref } = useSoftNav();
  const underlineId = useId();
  // 知识库标签页 href（独立于三个题目 tab）；激活态在导航期间也要乐观点亮。
  const docsHref = '/?view=mybank&workspace=documents';
  const docsActive = isPending ? pendingHref === docsHref : isDocsTab;

  return (
    <div>
      {/* 子标签 + 自己录题 —— 软导航 + framer-motion 滑动下划线 */}
      <LayoutGroup id={underlineId}>
        <div className="flex items-center gap-1 mb-5 border-b border-zinc-200 dark:border-zinc-800">
          {MYBANK_TABS.map(({ key, label, icon: Icon }) => {
            const href = `/?view=mybank&workspace=${key}`;
            const isLoading = isPending && pendingHref === href;
            // 乐观激活：导航期间只认 pendingHref（下划线点击即滑过去），否则认服务端确认的 tab
            // 知识库标签页激活时，三个题目 tab 一律不亮。
            const active = isPending ? pendingHref === href : (!isDocsTab && tab === key);
            return (
              <Link
                key={key}
                href={href}
                aria-current={active ? 'page' : undefined}
                onClick={(e) => {
                  if (!isPlainLeftClick(e)) return;
                  e.preventDefault();
                  navigate(href);
                }}
                className={[
                  'relative flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors',
                  active
                    ? 'text-indigo-600 dark:text-indigo-400'
                    : 'text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300',
                ].join(' ')}
              >
                {isLoading ? <Loader2 size={14} className="animate-spin" /> : <Icon size={14} />}
                {label}
                {active && (
                  <motion.span
                    aria-hidden
                    layoutId={`${underlineId}-underline`}
                    transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                    className="absolute -bottom-px left-0 right-0 h-0.5 rounded-full bg-indigo-500"
                  />
                )}
              </Link>
            );
          })}

          {/* 第 4 个 tab：知识库（PDF 文档，独立于三个题目 tab） */}
          <Link
            href={docsHref}
            aria-current={docsActive ? 'page' : undefined}
            onClick={(e) => {
              if (!isPlainLeftClick(e)) return;
              e.preventDefault();
              navigate(docsHref);
            }}
            className={[
              'relative flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors',
              docsActive ? 'text-indigo-600 dark:text-indigo-400' : 'text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300',
            ].join(' ')}
          >
            {isPending && pendingHref === docsHref ? <Loader2 size={14} className="animate-spin" /> : <Library size={14} />}
            知识库
            {docsActive && (
              <motion.span
                aria-hidden
                layoutId={`${underlineId}-underline`}
                transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                className="absolute -bottom-px left-0 right-0 h-0.5 rounded-full bg-indigo-500"
              />
            )}
          </Link>

          {!isDocsTab && tab !== 'history' && (
            <Link
              href={`/mybank/new?target=${tab}`}
              className="ml-auto mb-1 inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-1 text-xs font-medium text-white hover:bg-indigo-700"
            >
              <Plus size={13} /> 自己录题
            </Link>
          )}
        </div>
      </LayoutGroup>

      {/* 知识库标签页：渲染个人 PDF 知识库，取代题目区 */}
      {isDocsTab ? (
        <MyKnowledgeView docs={knowledgeDocs} />
      ) : (
      <>{/* 题目三 tab 内容 */}

      {/* 错题本专属：FSRS 今日复习入口 */}
      {tab === 'errors' && (
        dueCount > 0 ? (
          <Link
            href="/mybank/review"
            className="group mb-5 flex items-center gap-3 rounded-2xl border border-indigo-200 bg-gradient-to-r from-indigo-50 to-violet-50 px-4 py-3.5 transition-colors hover:from-indigo-100 hover:to-violet-100 dark:border-indigo-500/30 dark:from-indigo-500/10 dark:to-violet-500/10 dark:hover:from-indigo-500/20 dark:hover:to-violet-500/20"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-sm">
              <BrainCircuit size={20} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-indigo-900 dark:text-indigo-100">
                开始今日复习
                <span className="ml-1.5 rounded-full bg-indigo-600 px-1.5 py-0.5 text-[0.7rem] font-bold text-white tabular-nums">
                  {dueCount}
                </span>
              </span>
              <span className="block text-xs text-indigo-500/80 dark:text-indigo-300/70">
                FSRS 间隔重复 · 按记忆曲线精准召回到期错题
              </span>
            </span>
            <ArrowRight size={18} className="shrink-0 text-indigo-400 transition-transform group-hover:translate-x-0.5" />
          </Link>
        ) : (
          <div className="mb-5 flex items-center gap-3 rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3.5 dark:border-zinc-800 dark:bg-zinc-900/50">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-zinc-200 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500">
              <CheckCircle2 size={20} />
            </span>
            <span className="text-sm text-zinc-500 dark:text-zinc-400">
              今日复习已清空 🎉 暂无到期错题，明天再来。
            </span>
          </div>
        )
      )}

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
            myRatings={myRatings}
          />
        </>
      )}
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
