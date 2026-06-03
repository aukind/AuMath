import { getQuestions, getQuestionTopics, getPapers, getQuestionsByPaperId } from '@/app/actions/questions';
import type { PaperQuestionsResult, SortOrder } from '@/app/actions/questions';
import { getFavoritedQuestionIds, getErroredQuestionIds, getWorkspaceQuestions } from '@/app/actions/user-workspace';
import { getTodayDueCount } from '@/app/actions/fsrs';
import { getMyDifficultyRatings } from '@/app/actions/difficulty';
import { getSiteViews } from '@/app/actions/site-stats';
import { getForumPosts } from '@/app/actions/forum';
import { getLibraryItems } from '@/app/actions/library';
import { getMyAccount } from '@/app/actions/account';
import { getUnreadNotificationCount } from '@/app/actions/notifications';
import { createClient } from '@/lib/supabase/server';
import { isAdminUser } from '@/lib/utils/auth';
import Link from 'next/link';
import PageLayout, { type MainView } from '@/components/PageLayout';
import { Infinity, PenLine, CalendarDays, Search as SearchIcon, FileText } from 'lucide-react';
import ThemeToggle from '@/components/ThemeToggle';
import LibraryMark from '@/components/library/LibraryMark';
import AccountMenu from '@/components/AccountMenu';
import NotificationBell from '@/components/NotificationBell';
import CanvasScratchpad from '@/components/CanvasScratchpad';
import MobileMenuDrawer from '@/components/MobileMenuDrawer';
import type { QuestionWithTopics, WorkspaceType } from '@/types/database';
import type { ForumPost } from '@/types/forum';
import type { LibraryItem } from '@/types/library';

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

  const mybankTab: WorkspaceType =
    workspace === 'errors' || workspace === 'history' ? workspace : 'favorites';

  const mainView: MainView = (topicId || paperId)
    ? 'browse'
    : view === 'mybank'
      ? 'mybank'
      : 'forum';

  const supabase = await createClient();
  const [
    { data: { user } },
    topics,
    papers,
    paperResult,
    topicQuestions,
    workspaceQuestions,
    forumPosts,
    favoritedIds,
    erroredIds,
    myRatings,
    siteViews,
    account,
    unreadCount,
    libraryHighlights,
    dueCount,
  ] = await Promise.all([
    supabase.auth.getUser(),
    getQuestionTopics(),
    getPapers(),
    mainView === 'browse' && paperId
      ? getQuestionsByPaperId(paperId)
      : Promise.resolve<PaperQuestionsResult>({ paper: null, questions: [] }),
    mainView === 'browse' && topicId && !paperId
      ? getQuestions(topicId, validSort, 20, 'public')
      : Promise.resolve<QuestionWithTopics[]>([]),
    mainView !== 'browse'
      ? getWorkspaceQuestions(mybankTab)
      : Promise.resolve<QuestionWithTopics[]>([]),
    mainView !== 'browse'
      ? getForumPosts()
      : Promise.resolve<ForumPost[]>([]),
    getFavoritedQuestionIds(),
    getErroredQuestionIds(),
    getMyDifficultyRatings(),
    getSiteViews(),
    getMyAccount(),
    getUnreadNotificationCount(),
    // Hero 横幅只在默认社区视图展示，故仅该视图预取
    mainView !== 'browse'
      ? getLibraryItems('all')
      : Promise.resolve<LibraryItem[]>([]),
    // FSRS 今日复习徽标，仅我的题库可见的非浏览视图预取（未登录内部返回 0）
    mainView !== 'browse'
      ? getTodayDueCount()
      : Promise.resolve(0),
  ]);

  const isAdmin = isAdminUser(user);
  const isLoggedIn = !!user;
  const userId = user?.id;
  
  const username =
    account?.username ||
    (user?.user_metadata?.username as string | undefined)?.trim() ||
    user?.email?.split('@')[0] ||
    '我';
  const avatarUrl = account?.avatarUrl ?? undefined;

  const questions = mainView === 'browse'
    ? (paperId ? paperResult.questions : topicQuestions)
    : workspaceQuestions;
  const activePaper = paperResult.paper;

  const findTopic = (id: string, nodes = topics): string | undefined => {
    for (const n of nodes) {
      if (n.id === id) return n.name;
      const found = findTopic(id, n.children);
      if (found) return found;
    }
  };
  const activeTopicName = topicId ? findTopic(topicId) : undefined;
  const pageTitle = activePaper?.title ?? activeTopicName ?? '全部题目';

  return (
    // data-lenis-prevent：本页是固定视口外壳（h-screen overflow-hidden），真正滚动的是
    // 内部 <main>/侧栏的 overflow-y-auto。全局 Lenis(root) 接管的是 document 滚动，会吞掉
    // 滚轮事件却无处可滚 → 内层滚不动。让 Lenis 忽略整个本页子树，内层恢复原生滚动。
    // （其余页面走 document 滚动，Lenis 平滑照常生效。）
    <div data-lenis-prevent className="h-screen overflow-hidden flex flex-col bg-zinc-50 dark:bg-zinc-950">
      {/* ── 顶部导航 ── */}
      {/* data-zen-chrome="top"：沉浸模式下由 globals.css 平滑上移淡出 */}
      <header data-zen-chrome="top" className="shrink-0 sticky top-0 z-30 border-b border-zinc-200 dark:border-zinc-800 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-sm">
        <div className="mx-auto max-w-7xl flex items-center gap-3 px-4 h-14">
          <MobileMenuDrawer
            topics={topics}
            papers={papers}
            selectedTopicId={paperId ? undefined : topicId}
            selectedPaperId={paperId}
            isAdmin={isAdmin}
            hasFilter={mainView === 'browse'}
            siteViews={siteViews} /* 将访问次数传递给移动端菜单 */
            libraryHighlights={libraryHighlights}
            mainView={mainView}
          />

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
            <Link
              href="/daily"
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              <CalendarDays size={14} className="text-indigo-500" />
              <span className="hidden sm:inline">每日一题</span>
            </Link>
            <Link
              href="/library"
              className="flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-gradient-to-r from-indigo-50 to-violet-50 px-2.5 py-1.5 text-xs font-semibold text-indigo-700 transition-colors hover:from-indigo-100 hover:to-violet-100 dark:border-indigo-500/30 dark:from-indigo-500/15 dark:to-violet-500/15 dark:text-indigo-300"
            >
              <LibraryMark size={16} />
              <span className="hidden sm:inline">资源大厅</span>
            </Link>
            <ThemeToggle />
            {isLoggedIn && userId ? (
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
                <AccountMenu username={username} userId={userId} isAdmin={isAdmin} avatarUrl={avatarUrl} />
              </>
            ) : (
              <Link href="/login" className="flex items-center justify-center min-w-[44px] min-h-[44px] px-3 text-xs text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors">
                登录
              </Link>
            )}
          </div>
        </div>
      </header>

      <PageLayout
        topics={topics}
        papers={papers}
        questions={questions as QuestionWithTopics[]}
        isAdmin={isAdmin}
        isLoggedIn={isLoggedIn}
        userId={userId}
        topicId={topicId}
        paperId={paperId}
        pageTitle={pageTitle}
        activePaper={activePaper}
        validSort={validSort}
        mainView={mainView}
        forumPosts={forumPosts}
        libraryHighlights={libraryHighlights}
        mybankTab={mybankTab}
        favoritedIds={favoritedIds}
        erroredIds={erroredIds}
        myRatings={myRatings}
        siteViews={siteViews}
        dueCount={dueCount}
      />

      <CanvasScratchpad />
    </div>
  );
}