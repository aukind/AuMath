import { getQuestions, getQuestionTopics, getPapers, getQuestionsByPaperId } from '@/app/actions/questions';
import type { PaperQuestionsResult, SortOrder, BankView } from '@/app/actions/questions';
import { getWorkspaceCounts, getFavoritedQuestionIds, getErroredQuestionIds, getWorkspaceQuestions } from '@/app/actions/user-workspace';
import { getSiteViews } from '@/app/actions/site-stats';
import { createClient } from '@/lib/supabase/server';
import { isAdminUser } from '@/lib/utils/auth';
import { logout } from '@/app/actions/auth';
import PageLayout from '@/components/PageLayout';
import { Infinity, PenLine, LogOut, LayoutDashboard } from 'lucide-react';
import ThemeToggle from '@/components/ThemeToggle';
import CanvasScratchpad from '@/components/CanvasScratchpad';
import MobileMenuDrawer from '@/components/MobileMenuDrawer';
import type { QuestionWithTopics, WorkspaceType, WorkspaceCounts } from '@/types/database';

export const dynamic = 'force-dynamic';

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ topic?: string; sort?: string; paper?: string; workspace?: string; bank?: string }>;
}) {
  const { topic: topicId, sort, paper: paperId, workspace, bank } = await searchParams;

  const validSort: SortOrder = (sort === 'difficulty_asc' || sort === 'difficulty_desc' || sort === 'updated_at_desc')
    ? sort
    : 'updated_at_desc';

  const validWorkspace: WorkspaceType | undefined =
    workspace === 'favorites' || workspace === 'errors' || workspace === 'history'
      ? workspace
      : undefined;

  const bankView: BankView = bank === 'private' ? 'private' : 'public';

  const emptyWorkspaceCounts: WorkspaceCounts = { favorites: 0, errors: 0, history: 0 };

  const supabase = await createClient();
  const [
    { data: { user } },
    topics,
    papers,
    paperResult,
    topicQuestions,
    workspaceCounts,
    favoritedIds,
    erroredIds,
    workspaceQuestions,
    siteViews,
  ] = await Promise.all([
    supabase.auth.getUser(),
    getQuestionTopics(),
    getPapers(),
    paperId
      ? getQuestionsByPaperId(paperId)
      : Promise.resolve<PaperQuestionsResult>({ paper: null, questions: [] }),
    (paperId || validWorkspace)
      ? Promise.resolve<QuestionWithTopics[]>([])
      : getQuestions(topicId, validSort, 20, bankView),
    getWorkspaceCounts(),
    getFavoritedQuestionIds(),
    getErroredQuestionIds(),
    validWorkspace
      ? getWorkspaceQuestions(validWorkspace)
      : Promise.resolve<QuestionWithTopics[]>([]),
    getSiteViews(),
  ]);

  const isAdmin = isAdminUser(user);
  const isLoggedIn = !!user;
  const userId = user?.id;

  const questions = paperId ? paperResult.questions
    : validWorkspace   ? workspaceQuestions
    : topicQuestions;
  const activePaper = paperResult.paper;

  const findTopic = (id: string, nodes = topics): string | undefined => {
    for (const n of nodes) {
      if (n.id === id) return n.name;
      const found = findTopic(id, n.children);
      if (found) return found;
    }
  };
  const activeTopicName = topicId ? findTopic(topicId) : undefined;
  const workspaceTitles: Record<WorkspaceType, string> = { favorites: '我的收藏', errors: '我的错题', history: '最近浏览' };
  const pageTitle = activePaper?.title
    ?? (validWorkspace ? workspaceTitles[validWorkspace] : activeTopicName ?? '全部题目');

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
            hasFilter={!!(topicId || paperId || validWorkspace)}
            workspaceCounts={workspaceCounts ?? emptyWorkspaceCounts}
            activeWorkspace={validWorkspace}
          />

          <div className="flex items-center gap-2">
            <Infinity className="w-5 h-5 stroke-[1.5] text-indigo-600 dark:text-indigo-400" />
            <span className="font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-purple-600 dark:from-indigo-400 dark:to-purple-400 text-sm">
              AuMath
            </span>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />
            {isAdmin ? (
              <>
                <a
                  href="/dashboard"
                  className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                >
                  <LayoutDashboard size={13} /> <span className="hidden sm:inline">控制台</span>
                </a>
                <a
                  href="/admin/paper-upload"
                  className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-violet-50 dark:bg-violet-950/30 text-violet-700 dark:text-violet-300 border border-violet-200 dark:border-violet-800/60 hover:bg-violet-100 dark:hover:bg-violet-900/30 transition-colors"
                >
                  <PenLine size={13} /> <span className="hidden sm:inline">AI 录题</span>
                </a>
                <a
                  href="/admin/papers"
                  className="hidden sm:flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                >
                  试卷管理
                </a>
                <a
                  href="/admin/add"
                  className="hidden sm:flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                >
                  <PenLine size={13} /> 手动录题
                </a>
                <form action={logout}>
                  <button
                    type="submit"
                    className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 border border-zinc-200 dark:border-zinc-700 px-3 py-1.5 rounded-lg transition-colors"
                  >
                    <LogOut size={12} /> <span className="hidden sm:inline">退出</span>
                  </button>
                </form>
              </>
            ) : isLoggedIn ? (
              <>
                <a
                  href="/dashboard"
                  className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                >
                  <LayoutDashboard size={13} /> <span className="hidden sm:inline">控制台</span>
                </a>
                <a
                  href="/admin/add"
                  className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                >
                  <PenLine size={13} /> 录入题目
                </a>
                <form action={logout}>
                  <button
                    type="submit"
                    className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 border border-zinc-200 dark:border-zinc-700 px-3 py-1.5 rounded-lg transition-colors"
                  >
                    <LogOut size={12} /> <span className="hidden sm:inline">退出</span>
                  </button>
                </form>
              </>
            ) : (
              <a
                href="/login"
                className="flex items-center justify-center min-w-[44px] min-h-[44px] px-3 text-xs text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors"
              >
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
        bankView={bankView}
        workspaceCounts={workspaceCounts ?? emptyWorkspaceCounts}
        activeWorkspace={validWorkspace}
        favoritedIds={favoritedIds}
        erroredIds={erroredIds}
        siteViews={siteViews}
      />

      <CanvasScratchpad />
    </div>
  );
}
