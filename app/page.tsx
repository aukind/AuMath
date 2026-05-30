import { getQuestions, getQuestionTopics, getPapers, getQuestionsByPaperId } from '@/app/actions/questions';
import type { PaperQuestionsResult, SortOrder } from '@/app/actions/questions';
import { getFavoritedQuestionIds, getErroredQuestionIds, getWorkspaceQuestions } from '@/app/actions/user-workspace';
import { getSiteViews } from '@/app/actions/site-stats';
import { getForumPosts } from '@/app/actions/forum';
import { createClient } from '@/lib/supabase/server';
import { isAdminUser } from '@/lib/utils/auth';
import { logout } from '@/app/actions/auth';
import PageLayout, { type MainView } from '@/components/PageLayout';
import { Infinity, PenLine, LogOut, LayoutDashboard, UserCog } from 'lucide-react';
import ThemeToggle from '@/components/ThemeToggle';
import CanvasScratchpad from '@/components/CanvasScratchpad';
import MobileMenuDrawer from '@/components/MobileMenuDrawer';
import type { QuestionWithTopics, WorkspaceType } from '@/types/database';
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

  const mybankTab: WorkspaceType =
    workspace === 'errors' || workspace === 'history' ? workspace : 'favorites';

  // 主区视图：点了侧边栏题目 → 浏览；否则 view=mybank → 我的题库；默认 → 社区论坛
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
    siteViews,
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
    // 非 browse（论坛或题库）时两份数据都预取，喂给 DashboardWorkspace 的两个常驻 slot，
    // 客户端切换 Tab 不再发起服务端导航 → 0ms 秒切。
    mainView !== 'browse'
      ? getWorkspaceQuestions(mybankTab)
      : Promise.resolve<QuestionWithTopics[]>([]),
    mainView !== 'browse'
      ? getForumPosts()
      : Promise.resolve<ForumPost[]>([]),
    getFavoritedQuestionIds(),
    getErroredQuestionIds(),
    getSiteViews(),
  ]);

  const isAdmin = isAdminUser(user);
  const isLoggedIn = !!user;
  const userId = user?.id;

  // 非 browse 时统一携带 workspaceQuestions，供「我的题库」常驻 slot 使用（论坛 slot 用 forumPosts）。
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
    <div className="h-screen overflow-hidden flex flex-col bg-zinc-50 dark:bg-zinc-950">
      {/* ── 顶部导航 ── */}
      <header className="shrink-0 sticky top-0 z-30 border-b border-zinc-200 dark:border-zinc-800 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-sm">
        <div className="mx-auto max-w-7xl flex items-center gap-3 px-4 h-14">
          <MobileMenuDrawer
            topics={topics}
            papers={papers}
            selectedTopicId={paperId ? undefined : topicId}
            selectedPaperId={paperId}
            isAdmin={isAdmin}
            hasFilter={mainView === 'browse'}
          />

          <a href="/" className="flex items-center gap-2">
            <Infinity className="w-5 h-5 stroke-[1.5] text-indigo-600 dark:text-indigo-400" />
            <span className="font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-purple-600 dark:from-indigo-400 dark:to-purple-400 text-sm">
              AuMath
            </span>
          </a>

          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />
            {isLoggedIn ? (
              <>
                {isAdmin && (
                  <>
                    <a href="/dashboard" className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">
                      <LayoutDashboard size={13} /> <span className="hidden sm:inline">控制台</span>
                    </a>
                    <a href="/admin/paper-upload" className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-violet-50 dark:bg-violet-950/30 text-violet-700 dark:text-violet-300 border border-violet-200 dark:border-violet-800/60 hover:bg-violet-100 dark:hover:bg-violet-900/30 transition-colors">
                      <PenLine size={13} /> <span className="hidden sm:inline">AI 录题</span>
                    </a>
                  </>
                )}
                <a href="/account" className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">
                  <UserCog size={13} /> <span className="hidden sm:inline">账号</span>
                </a>
                <form action={logout}>
                  <button type="submit" className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 border border-zinc-200 dark:border-zinc-700 px-3 py-1.5 rounded-lg transition-colors">
                    <LogOut size={12} /> <span className="hidden sm:inline">退出</span>
                  </button>
                </form>
              </>
            ) : (
              <a href="/login" className="flex items-center justify-center min-w-[44px] min-h-[44px] px-3 text-xs text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors">
                登录
              </a>
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
        mybankTab={mybankTab}
        favoritedIds={favoritedIds}
        erroredIds={erroredIds}
        siteViews={siteViews}
      />

      <CanvasScratchpad />
    </div>
  );
}
