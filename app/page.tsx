import { Suspense } from 'react';
import { getQuestions, getQuestionTopics, getPapers, getQuestionsByPaperId } from '@/app/actions/questions';
import type { SortOrder } from '@/app/actions/questions';
import { getFavoritedQuestionIds, getErroredQuestionIds, getWorkspaceQuestions } from '@/app/actions/user-workspace';
import { getMyKnowledgeDocs } from '@/app/actions/knowledge';
import { getTodayDueCount } from '@/app/actions/fsrs';
import { getMyDifficultyRatings } from '@/app/actions/difficulty';
import { getSiteViews } from '@/app/actions/site-stats';
import { getForumPosts } from '@/app/actions/forum';
import { getMyAccount } from '@/app/actions/account';
import { getUnreadNotificationCount } from '@/app/actions/notifications';
import { createClient } from '@/lib/supabase/server';
import { isAdminUser } from '@/lib/utils/auth';
import Link from 'next/link';
import PageLayout, { type MainView, type SessionInfo, type BrowseData } from '@/components/PageLayout';
import { Infinity, Menu, PenLine, Search as SearchIcon, FileText } from 'lucide-react';
import ThemeToggle from '@/components/ThemeToggle';
import AccountMenu from '@/components/AccountMenu';
import NotificationBell from '@/components/NotificationBell';
import CanvasScratchpad from '@/components/CanvasScratchpad';
import FluidCursor from '@/components/background/FluidCursor';
import HomeAurora from '@/components/background/HomeAurora';
import MobileMenuDrawer from '@/components/MobileMenuDrawer';
import type { User } from '@supabase/supabase-js';
import type { TopicWithChildren, PaperRow, QuestionWithTopics, WorkspaceType } from '@/types/database';
import type { KnowledgeDoc } from '@/types/library';
import type { ForumPost } from '@/types/forum';

export const dynamic = 'force-dynamic';

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ topic?: string; sort?: string; paper?: string; workspace?: string; view?: string }>;
}) {
  const { topic: topicId, sort, paper: paperId, workspace, view } = await searchParams;

  const validSort: SortOrder = (sort === 'difficulty_asc' || sort === 'difficulty_desc' || sort === 'updated_at_desc')
    ? sort
    : 'updated_at_desc';

  const isDocsTab = workspace === 'documents';
  const mybankTab: WorkspaceType =
    workspace === 'errors' || workspace === 'history' ? workspace : 'favorites';

  const mainView: MainView = (topicId || paperId)
    ? 'browse'
    : view === 'mybank'
      ? 'mybank'
      : 'forum';

  // ── 并行预热：只创建 promise、一律不 await ──────────────────────────────
  // 外壳（顶栏 chrome + 布局骨架）随首字节同步流出，各数据区块由下方的
  // <Suspense> 边界（页头两处 + PageLayout 内侧栏/列表/个人化）各自注水。
  const userPromise: Promise<User | null> = (async () => {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    return user;
  })();
  const sessionPromise: Promise<SessionInfo> = userPromise.then((user) => ({
    isAdmin: isAdminUser(user),
    isLoggedIn: !!user,
    userId: user?.id,
  }));

  const topicsPromise = getQuestionTopics();   // unstable_cache：通常即刻命中
  const papersPromise = getPapers();           // 同上
  const siteViewsPromise = getSiteViews();

  // 个人化（未登录均解析为空值，内部已自兜底）
  const favoritedIdsPromise = getFavoritedQuestionIds();
  const erroredIdsPromise = getErroredQuestionIds();
  const myRatingsPromise = getMyDifficultyRatings();
  const accountPromise = getMyAccount();
  const unreadCountPromise = getUnreadNotificationCount();

  // 题目浏览数据包：题目 + 试卷 + 页标题聚合为单个 promise，仅 browse 视图创建
  const browsePromise: Promise<BrowseData> | null = mainView === 'browse'
    ? (async (): Promise<BrowseData> => {
        if (paperId) {
          const { paper, questions } = await getQuestionsByPaperId(paperId);
          return { questions, activePaper: paper, pageTitle: paper?.title ?? '全部题目' };
        }
        const [questions, topics] = await Promise.all([
          getQuestions(topicId!, validSort, 20, 'public'),
          topicsPromise,
        ]);
        const findTopic = (id: string, nodes: TopicWithChildren[]): string | undefined => {
          for (const n of nodes) {
            if (n.id === id) return n.name;
            const found = findTopic(id, n.children);
            if (found) return found;
          }
        };
        return { questions, activePaper: null, pageTitle: findTopic(topicId!, topics) ?? '全部题目' };
      })()
    : null;

  // 论坛 / 我的题库（非 browse 视图才真正查询，否则给已解析的空 promise）
  const forumPostsPromise = mainView !== 'browse'
    ? getForumPosts()
    : Promise.resolve<ForumPost[]>([]);
  const workspaceQuestionsPromise = mainView !== 'browse' && !isDocsTab
    ? getWorkspaceQuestions(mybankTab)
    : Promise.resolve<QuestionWithTopics[]>([]);
  const knowledgeDocsPromise = mainView !== 'browse' && isDocsTab
    ? getMyKnowledgeDocs()
    : Promise.resolve<KnowledgeDoc[]>([]);
  // FSRS 今日复习徽标，仅我的题库可见的非浏览视图预取（未登录内部返回 0）
  const dueCountPromise = mainView !== 'browse'
    ? getTodayDueCount()
    : Promise.resolve(0);

  return (
    // data-lenis-prevent：本页是固定视口外壳（h-screen overflow-hidden），真正滚动的是
    // 内部 <main>/侧栏的 overflow-y-auto。全局 Lenis(root) 接管的是 document 滚动，会吞掉
    // 滚轮事件却无处可滚 → 内层滚不动。让 Lenis 忽略整个本页子树，内层恢复原生滚动。
    // （其余页面走 document 滚动，Lenis 平滑照常生效。）
    <div data-lenis-prevent className="relative isolate h-screen overflow-hidden flex flex-col bg-zinc-50 dark:bg-zinc-950">
      {/* 极光动态背景：-z-10 垫底，半透明顶栏/侧栏自然透光（纯 CSS，零运行时开销） */}
      <HomeAurora />

      {/* ── 顶部导航 ── */}
      {/* data-zen-chrome="top"：沉浸模式下由 globals.css 平滑上移淡出 */}
      <header data-zen-chrome="top" className="shrink-0 sticky top-0 z-30 border-b border-zinc-200 dark:border-zinc-800 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-sm">
        <div className="mx-auto max-w-7xl flex items-center gap-3 px-4 h-14">
          <Suspense fallback={<MobileMenuFallback />}>
            <MobileMenuArea
              topicsPromise={topicsPromise}
              papersPromise={papersPromise}
              sessionPromise={sessionPromise}
              siteViewsPromise={siteViewsPromise}
              topicId={topicId}
              paperId={paperId}
              mainView={mainView}
            />
          </Suspense>

          <Link href="/" className="flex items-center gap-2">
            <Infinity className="w-5 h-5 stroke-[1.5] text-indigo-600 dark:text-indigo-400" />
            <span className="font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-purple-600 dark:from-indigo-400 dark:to-purple-400 text-sm">
              AuMath
            </span>
          </Link>

          <div className="ml-auto flex items-center gap-2">
            <Link
              href="/search"
              aria-label="搜索"
              className="flex h-9 w-9 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
            >
              <SearchIcon size={18} />
            </Link>
            <ThemeToggle />
            <Suspense fallback={<HeaderAuthFallback />}>
              <HeaderAuthArea
                userPromise={userPromise}
                accountPromise={accountPromise}
                unreadCountPromise={unreadCountPromise}
              />
            </Suspense>
          </div>
        </div>
      </header>

      <PageLayout
        topicId={topicId}
        paperId={paperId}
        validSort={validSort}
        mainView={mainView}
        mybankTab={mybankTab}
        isDocsTab={isDocsTab}
        sessionPromise={sessionPromise}
        topicsPromise={topicsPromise}
        papersPromise={papersPromise}
        browsePromise={browsePromise}
        workspaceQuestionsPromise={workspaceQuestionsPromise}
        knowledgeDocsPromise={knowledgeDocsPromise}
        forumPostsPromise={forumPostsPromise}
        favoritedIdsPromise={favoritedIdsPromise}
        erroredIdsPromise={erroredIdsPromise}
        myRatingsPromise={myRatingsPromise}
        siteViewsPromise={siteViewsPromise}
        dueCountPromise={dueCountPromise}
      />

      <CanvasScratchpad />

      {/* 首页专属：指针流体拖尾特效层（z-35 盖过内容、居演算板/弹窗之下，
          mix-blend 融合不遮文字；reduced-motion / 无 WebGL2 时静默缺席） */}
      <FluidCursor />
    </div>
  );
}

// ── 顶栏右侧账户区（铃铛 + 头像 / 登录入口）：独立 Suspense 注水 ──────────
async function HeaderAuthArea({
  userPromise,
  accountPromise,
  unreadCountPromise,
}: {
  userPromise: Promise<User | null>;
  accountPromise: ReturnType<typeof getMyAccount>;
  unreadCountPromise: Promise<number>;
}) {
  const [user, account, unreadCount] = await Promise.all([userPromise, accountPromise, unreadCountPromise]);

  if (!user?.id) {
    return (
      <Link href="/login" className="flex items-center justify-center min-w-[44px] min-h-[44px] px-3 text-xs text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors">
        登录
      </Link>
    );
  }

  const isAdmin = isAdminUser(user);
  const username =
    account?.username ||
    (user.user_metadata?.username as string | undefined)?.trim() ||
    user.email?.split('@')[0] ||
    '我';
  const avatarUrl = account?.avatarUrl ?? undefined;

  return (
    <>
      {isAdmin && (
        <>
          <Link href="/admin/paper-upload" className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-violet-50 dark:bg-violet-950/30 text-violet-700 dark:text-violet-300 border border-violet-200 dark:border-violet-800/60 hover:bg-violet-100 dark:hover:bg-violet-900/30 transition-colors">
            <PenLine size={13} /> <span className="hidden sm:inline">AI 录题</span>
          </Link>
          <Link href="/admin/papers" className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg text-zinc-600 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">
            <FileText size={13} /> <span className="hidden sm:inline">试卷管理</span>
          </Link>
        </>
      )}
      <NotificationBell count={unreadCount} />
      <AccountMenu username={username} userId={user.id} isAdmin={isAdmin} avatarUrl={avatarUrl} />
    </>
  );
}

function HeaderAuthFallback() {
  return (
    <div aria-hidden className="flex items-center gap-2">
      <div className="h-9 w-9 rounded-lg bg-zinc-100 dark:bg-zinc-800 animate-pulse" />
      <div className="h-9 w-9 rounded-full bg-zinc-100 dark:bg-zinc-800 animate-pulse" />
    </div>
  );
}

// ── 移动端抽屉（汉堡菜单）：依赖 topics/papers/会话，独立 Suspense 注水 ────
async function MobileMenuArea({
  topicsPromise,
  papersPromise,
  sessionPromise,
  siteViewsPromise,
  topicId,
  paperId,
  mainView,
}: {
  topicsPromise: Promise<TopicWithChildren[]>;
  papersPromise: Promise<PaperRow[]>;
  sessionPromise: Promise<SessionInfo>;
  siteViewsPromise: Promise<number>;
  topicId?: string;
  paperId?: string;
  mainView: MainView;
}) {
  const [topics, papers, session, siteViews] = await Promise.all([
    topicsPromise, papersPromise, sessionPromise, siteViewsPromise,
  ]);
  return (
    <MobileMenuDrawer
      topics={topics}
      papers={papers}
      selectedTopicId={paperId ? undefined : topicId}
      selectedPaperId={paperId}
      isAdmin={session.isAdmin}
      isLoggedIn={session.isLoggedIn}
      hasFilter={mainView === 'browse'}
      siteViews={siteViews} /* 将访问次数传递给移动端菜单 */
      mainView={mainView}
    />
  );
}

function MobileMenuFallback() {
  return (
    <div aria-hidden className="lg:hidden flex items-center justify-center w-11 h-11 rounded-lg text-zinc-300 dark:text-zinc-600">
      <Menu size={20} />
    </div>
  );
}
