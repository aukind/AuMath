import { getQuestions, getQuestionTopics } from '@/app/actions/questions';
import { createClient } from '@/lib/supabase/server';
import { logout } from '@/app/actions/auth';
import TopicTree from '@/components/TopicTree';
import QuestionCard from '@/components/QuestionCard';
import SortSelect from '@/components/SortSelect';
import { BookOpen, PenLine, LogOut } from 'lucide-react';
import ThemeToggle from '@/components/ThemeToggle';

export const dynamic = 'force-dynamic';

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ topic?: string; sort?: string }>;
}) {
  const { topic: topicId, sort } = await searchParams;

  const validSort = (sort === 'difficulty_asc' || sort === 'difficulty_desc' || sort === 'updated_at_desc')
    ? sort
    : 'updated_at_desc';

  // ── 并行拉取：auth 状态 + 数据 ──────────────────────────────
  const supabase = await createClient();
  const [
    { data: { user } },
    topics,
    questions,
  ] = await Promise.all([
    supabase.auth.getUser(),
    getQuestionTopics(),
    getQuestions(topicId, validSort),
  ]);

  const isAdmin = !!user;

  const findTopic = (id: string, nodes = topics): string | undefined => {
    for (const n of nodes) {
      if (n.id === id) return n.name;
      const found = findTopic(id, n.children);
      if (found) return found;
    }
  };
  const activeTopicName = topicId ? findTopic(topicId) : undefined;

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      {/* ── 顶部导航 ── */}
      <header className="sticky top-0 z-20 border-b border-zinc-200 dark:border-zinc-800 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-sm">
        <div className="mx-auto max-w-7xl flex items-center gap-3 px-4 h-14">
          <BookOpen size={18} className="text-blue-600 dark:text-blue-400" />
          <span className="font-semibold text-zinc-900 dark:text-zinc-100 text-sm tracking-tight">
            高阶数学题库
          </span>
          <span className="hidden sm:block text-zinc-300 dark:text-zinc-700">|</span>
          <span className="hidden sm:block text-xs text-zinc-400">高考拔高 · 圆锥曲线 · 导数</span>

          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />
            {isAdmin ? (
              <>
                <a
                  href="/admin/add"
                  className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors shadow-sm"
                >
                  <PenLine size={13} /> 录题
                </a>
                {/* 退出登录 */}
                <form action={logout}>
                  <button
                    type="submit"
                    className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 border border-zinc-200 dark:border-zinc-700 px-3 py-1.5 rounded-lg transition-colors"
                  >
                    <LogOut size={12} /> 退出
                  </button>
                </form>
              </>
            ) : (
              <a
                href="/login"
                className="text-xs text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors"
              >
                管理员登录
              </a>
            )}
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl flex min-h-[calc(100vh-3.5rem)]">
        {/* ── 侧边栏 ── */}
        <aside className="hidden lg:flex flex-col w-56 xl:w-64 shrink-0 border-r border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-5 gap-4">
          <div className="px-3">
            <span className="text-[0.6875rem] font-semibold uppercase tracking-widest text-zinc-400">
              知识点目录
            </span>
          </div>

          <TopicTree topics={topics} selectedId={topicId} />

          <div className="mt-auto pt-4 border-t border-zinc-100 dark:border-zinc-800 space-y-2">
            {topicId && (
              <a href="/" className="block text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors">
                ← 返回全部题目
              </a>
            )}
            {isAdmin && (
              <a
                href="/admin/add"
                className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
              >
                <PenLine size={11} /> 录入新题目
              </a>
            )}
          </div>
        </aside>

        {/* ── 主内容 ── */}
        <main className="flex-1 min-w-0 px-4 sm:px-6 py-6">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
            <div>
              <h1 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
                {activeTopicName ?? '全部题目'}
              </h1>
              {questions.length > 0 && (
                <p className="text-xs text-zinc-400 mt-0.5">共 {questions.length} 道题</p>
              )}
            </div>
            <SortSelect value={validSort} topicId={topicId} />
          </div>

          {questions.length === 0 ? (
            <EmptyState hasTopics={topics.length > 0} isAdmin={isAdmin} />
          ) : (
            <div className="space-y-5 max-w-3xl">
              {questions.map(q => (
                <QuestionCard key={q.id} question={q} isAdmin={isAdmin} />
              ))}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function EmptyState({ hasTopics, isAdmin }: { hasTopics: boolean; isAdmin: boolean }) {
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
