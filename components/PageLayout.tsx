'use client';

import { Suspense, use, useId, useMemo, useState, useCallback, useEffect, useTransition } from 'react';
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
import { PersonalizationProvider } from '@/components/question/PersonalizationContext';
import { useSoftNav, isPlainLeftClick } from '@/components/ui/useSoftNav';
import { deleteQuestion, updateQuestionCategory } from '@/app/actions/questions';
import type { SortOrder } from '@/app/actions/questions';
import type { TopicWithChildren, PaperRow, QuestionWithTopics, WorkspaceType } from '@/types/database';
import type { KnowledgeDoc } from '@/types/library';
import type { ForumPost } from '@/types/forum';

/** 主区显示模式：社区论坛 / 我的题库 / 题目浏览（点侧边栏知识点·真题·模拟题）。 */
export type MainView = 'forum' | 'mybank' | 'browse';

/** 会话三要素——由 app/page.tsx 的 auth promise 推导，各 Suspense 子树 use() 解包。 */
export interface SessionInfo {
  isAdmin: boolean;
  isLoggedIn: boolean;
  userId?: string;
}

/** 题目浏览视图的数据包（题目 + 试卷信息 + 标题），服务端聚合为单个 promise。 */
export interface BrowseData {
  questions: QuestionWithTopics[];
  activePaper: PaperRow | null;
  pageTitle: string;
}

interface PageLayoutProps {
  // ── URL 派生（同步可得，决定渲染哪些区块）──
  topicId?: string;
  paperId?: string;
  validSort: SortOrder;
  mainView: MainView;
  mybankTab: WorkspaceType;
  /** 我的题库当前在「知识库」标签页（workspace=documents），渲染 PDF 知识库而非题目。 */
  isDocsTab?: boolean;
  // ── 流式数据（RSC 只创建 promise 不 await；各 Suspense 子树 use() 解包注水）──
  sessionPromise: Promise<SessionInfo>;
  topicsPromise: Promise<TopicWithChildren[]>;
  papersPromise: Promise<PaperRow[]>;
  /** 仅 browse 视图（?topic / ?paper）存在，其余为 null。 */
  browsePromise: Promise<BrowseData> | null;
  workspaceQuestionsPromise: Promise<QuestionWithTopics[]>;
  knowledgeDocsPromise: Promise<KnowledgeDoc[]>;
  forumPostsPromise: Promise<ForumPost[]>;
  favoritedIdsPromise: Promise<string[]>;
  erroredIdsPromise: Promise<string[]>;
  myRatingsPromise: Promise<Record<string, number>>;
  siteViewsPromise: Promise<number>;
  dueCountPromise: Promise<number>;
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
  topicId,
  paperId,
  validSort,
  mainView,
  mybankTab,
  isDocsTab = false,
  sessionPromise,
  topicsPromise,
  papersPromise,
  browsePromise,
  workspaceQuestionsPromise,
  knowledgeDocsPromise,
  forumPostsPromise,
  favoritedIdsPromise,
  erroredIdsPromise,
  myRatingsPromise,
  siteViewsPromise,
  dueCountPromise,
}: PageLayoutProps) {
  // ── 沉浸阅读模式 ──────────────────────────────────────────────
  const { isZenMode } = useZenMode();

  // ── Optimistic delete ────────────────────────────────────────
  // 列表数据已下沉到各 Suspense 子树解包，这里只保管「已删 id 集合」，子树各自过滤。
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set());

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

  // ── 个人化数据（收藏/错题/评分）promise 直通：题卡小部件各自独立注水 ──
  const personalization = useMemo(
    () => ({ favoritedIds: favoritedIdsPromise, erroredIds: erroredIdsPromise, myRatings: myRatingsPromise }),
    [favoritedIdsPromise, erroredIdsPromise, myRatingsPromise],
  );

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
    // 题目数组在 Suspense 子树内部，这里从 useDraggable 的 data 里取被拖的题
    const dragged = (event.active.data.current as { question?: QuestionWithTopics } | undefined)?.question;
    setActiveQuestion(dragged ?? null);
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
      <PersonalizationProvider value={personalization}>
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
          <Suspense fallback={<SidebarSkeleton />}>
            <SidebarPanel
              topicsPromise={topicsPromise}
              papersPromise={papersPromise}
              sessionPromise={sessionPromise}
              siteViewsPromise={siteViewsPromise}
              topicId={topicId}
              paperId={paperId}
              mainView={mainView}
              activeWorkspace={workspace}
              onWorkspaceChange={switchWorkspace}
            />
          </Suspense>
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

          {mainView === 'browse' && browsePromise ? (
            <Suspense fallback={<BrowseSkeleton />}>
              <BrowseView
                browsePromise={browsePromise}
                sessionPromise={sessionPromise}
                topicsPromise={topicsPromise}
                validSort={validSort}
                topicId={topicId}
                paperId={paperId}
                deletedIds={deletedIds}
                onDelete={handleDelete}
              />
            </Suspense>
          ) : (
            // ── 论坛 / 我的题库：左栏驱动 + 伪 Keep-Alive，两棵子树常驻、0ms 秒切 ──
            // isWorkspacePending 时容器轻微降透明，给「正在切」反馈而不阻塞点击。
            <div className={isWorkspacePending ? 'opacity-70 transition-opacity duration-200' : 'opacity-100 transition-opacity duration-200'}>
              <HeavyContentContainer
                activeTab={contentWorkspace}
                forum={
                  <Suspense fallback={<ListSkeleton rows={4} />}>
                    <ForumPanel forumPostsPromise={forumPostsPromise} sessionPromise={sessionPromise} />
                  </Suspense>
                }
                bank={
                  <Suspense fallback={<ListSkeleton rows={3} />}>
                    <BankPanel
                      sessionPromise={sessionPromise}
                      workspaceQuestionsPromise={workspaceQuestionsPromise}
                      knowledgeDocsPromise={knowledgeDocsPromise}
                      dueCountPromise={dueCountPromise}
                      mybankTab={mybankTab}
                      isDocsTab={isDocsTab}
                      deletedIds={deletedIds}
                      onDelete={handleDelete}
                    />
                  </Suspense>
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
      </PersonalizationProvider>
    </DndContext>
  );
}

// ── 侧栏（导航 + 题目树 + 访问量徽标）：等 topics/papers/session 解包后整体亮起 ──
function SidebarPanel({
  topicsPromise, papersPromise, sessionPromise, siteViewsPromise,
  topicId, paperId, mainView, activeWorkspace, onWorkspaceChange,
}: {
  topicsPromise: Promise<TopicWithChildren[]>;
  papersPromise: Promise<PaperRow[]>;
  sessionPromise: Promise<SessionInfo>;
  siteViewsPromise: Promise<number>;
  topicId?: string;
  paperId?: string;
  mainView: MainView;
  activeWorkspace: 'forum' | 'bank';
  onWorkspaceChange: (w: 'forum' | 'bank') => void;
}) {
  const topics = use(topicsPromise);
  const papers = use(papersPromise);
  const { isAdmin, isLoggedIn } = use(sessionPromise);
  const siteViews = use(siteViewsPromise);

  return (
    <>
      <HomeSidebar
        topics={topics}
        papers={papers}
        selectedTopicId={paperId ? undefined : topicId}
        selectedPaperId={paperId}
        isAdmin={isAdmin}
        isLoggedIn={isLoggedIn}
        mainView={mainView}
        activeWorkspace={activeWorkspace}
        onWorkspaceChange={onWorkspaceChange}
      />
      <div className="mt-auto flex flex-col gap-2 pt-3 border-t border-zinc-100 dark:border-zinc-800">
        <SiteViewsBadge initialCount={siteViews} />
      </div>
    </>
  );
}

function SidebarSkeleton() {
  return (
    <div aria-hidden className="flex flex-col gap-2 px-1 pt-1">
      {Array.from({ length: 7 }).map((_, i) => (
        <div
          key={i}
          className="h-8 rounded-lg bg-zinc-200/50 dark:bg-zinc-800/50 animate-pulse"
          style={{ animationDelay: `${i * 90}ms` }}
        />
      ))}
    </div>
  );
}

// ── 论坛面板：帖子列表注水 ───────────────────────────────────
function ForumPanel({
  forumPostsPromise, sessionPromise,
}: {
  forumPostsPromise: Promise<ForumPost[]>;
  sessionPromise: Promise<SessionInfo>;
}) {
  const posts = use(forumPostsPromise);
  const { isLoggedIn } = use(sessionPromise);
  return <ForumPostList posts={posts} canPost={isLoggedIn} />;
}

// ── 我的题库面板：会话解包后分流 登录墙 / 题库视图 ───────────
function BankPanel({
  sessionPromise, workspaceQuestionsPromise, knowledgeDocsPromise, dueCountPromise,
  mybankTab, isDocsTab, deletedIds, onDelete,
}: {
  sessionPromise: Promise<SessionInfo>;
  workspaceQuestionsPromise: Promise<QuestionWithTopics[]>;
  knowledgeDocsPromise: Promise<KnowledgeDoc[]>;
  dueCountPromise: Promise<number>;
  mybankTab: WorkspaceType;
  isDocsTab: boolean;
  deletedIds: Set<string>;
  onDelete: (id: string) => void;
}) {
  const session = use(sessionPromise);
  if (!session.isLoggedIn) return <MyBankGate />;
  return (
    <MyBankView
      tab={mybankTab}
      isDocsTab={isDocsTab}
      workspaceQuestionsPromise={workspaceQuestionsPromise}
      knowledgeDocsPromise={knowledgeDocsPromise}
      dueCountPromise={dueCountPromise}
      isAdmin={session.isAdmin}
      isLoggedIn={session.isLoggedIn}
      userId={session.userId}
      deletedIds={deletedIds}
      onDelete={onDelete}
    />
  );
}

// ── 通用列表骨架（论坛/题库/浏览共用）────────────────────────
function ListSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div aria-hidden className="space-y-5 max-w-3xl">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="h-40 rounded-2xl border border-zinc-100 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm animate-pulse"
          style={{ animationDelay: `${i * 120}ms` }}
        />
      ))}
    </div>
  );
}

function BrowseSkeleton() {
  return (
    <div aria-hidden>
      <div className="h-4 w-20 mb-4 rounded bg-zinc-200/60 dark:bg-zinc-800/60 animate-pulse" />
      <div className="h-6 w-48 mb-6 rounded bg-zinc-200/60 dark:bg-zinc-800/60 animate-pulse" />
      <ListSkeleton rows={3} />
    </div>
  );
}

// ── 题目浏览（点侧边栏知识点 / 真题 / 模拟题）────────────────
function BrowseView({
  browsePromise, sessionPromise, topicsPromise,
  validSort, topicId, paperId, deletedIds, onDelete,
}: {
  browsePromise: Promise<BrowseData>;
  sessionPromise: Promise<SessionInfo>;
  topicsPromise: Promise<TopicWithChildren[]>;
  validSort: SortOrder;
  topicId?: string;
  paperId?: string;
  deletedIds: Set<string>;
  onDelete: (id: string) => void;
}) {
  const { questions, activePaper, pageTitle } = use(browsePromise);
  const { isAdmin, isLoggedIn, userId } = use(sessionPromise);
  const hasTopics = use(topicsPromise).length > 0;
  const visibleQuestions = questions.filter(q => !deletedIds.has(q.id));
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
          {visibleQuestions.length > 0 && <p className="text-xs text-zinc-400 mt-0.5">共 {visibleQuestions.length} 道题</p>}
        </div>
        <div className="flex items-center gap-2">
          {/* 管理员：直接在浏览页编辑当前试卷信息 */}
          {isAdmin && activePaper && <EditPaperButton paper={activePaper} />}
          {!paperId && <SortSelect value={validSort} topicId={topicId} />}
        </div>
      </div>

      {visibleQuestions.length === 0 ? (
        <EmptyBrowse hasTopics={hasTopics} isAdmin={isAdmin} />
      ) : (
        <QuestionSearch
          questions={visibleQuestions}
          isAdmin={isAdmin}
          isLoggedIn={isLoggedIn}
          userId={userId}
          onDelete={onDelete}
          title={pageTitle}
        />
      )}
    </>
  );
}

// ── 我的题库（收藏 / 错题 / 最近浏览）────────────────────────
function MyBankView({
  tab, isDocsTab = false, workspaceQuestionsPromise, knowledgeDocsPromise, dueCountPromise,
  isAdmin, isLoggedIn, userId, deletedIds, onDelete,
}: {
  tab: WorkspaceType;
  isDocsTab?: boolean;
  workspaceQuestionsPromise: Promise<QuestionWithTopics[]>;
  knowledgeDocsPromise: Promise<KnowledgeDoc[]>;
  dueCountPromise: Promise<number>;
  isAdmin: boolean;
  isLoggedIn: boolean;
  userId?: string;
  deletedIds: Set<string>;
  onDelete: (id: string) => void;
}) {
  // 知识库标签页只拉文档、题目标签页只拉题目（另一侧是已解析的空 promise，use 不挂起）
  const questions = use(workspaceQuestionsPromise).filter(q => !deletedIds.has(q.id));
  const knowledgeDocs = isDocsTab ? use(knowledgeDocsPromise) : [];

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

      {/* 错题本专属：FSRS 今日复习入口 —— due 数独立注水，不阻塞错题列表 */}
      {tab === 'errors' && (
        <Suspense fallback={<FsrsEntrySkeleton />}>
          <FsrsReviewEntry dueCountPromise={dueCountPromise} />
        </Suspense>
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
          />
        </>
      )}
      </>
      )}
    </div>
  );
}

// ── FSRS 今日复习入口（错题 tab 顶部横幅）────────────────────
function FsrsReviewEntry({ dueCountPromise }: { dueCountPromise: Promise<number> }) {
  const dueCount = use(dueCountPromise);
  return dueCount > 0 ? (
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
  );
}

function FsrsEntrySkeleton() {
  return (
    <div aria-hidden className="mb-5 h-[4.25rem] rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 animate-pulse" />
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
