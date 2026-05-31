// 每日一题（RSC）。公开可见；东八区每天一题。
import Link from 'next/link';
import { CalendarDays, ChevronLeft, Infinity as InfinityIcon } from 'lucide-react';
import ThemeToggle from '@/components/ThemeToggle';
import QuestionCard from '@/components/QuestionCard';
import { getDailyQuestion } from '@/app/actions/daily';
import { getFavoritedQuestionIds, getErroredQuestionIds } from '@/app/actions/user-workspace';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: '每日一题 · AuMath',
  description: '每天一道高阶数学题，坚持练习，稳步提升。',
};

export default async function DailyPage() {
  const supabase = await createClient();
  const [{ data: { user } }, daily, favoritedIds, erroredIds] = await Promise.all([
    supabase.auth.getUser(),
    getDailyQuestion(),
    getFavoritedQuestionIds(),
    getErroredQuestionIds(),
  ]);

  const { question, date: today } = daily;

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <header className="sticky top-0 z-30 border-b border-zinc-200 bg-white/80 backdrop-blur-sm dark:border-zinc-800 dark:bg-zinc-900/80">
        <div className="mx-auto flex h-14 max-w-3xl items-center gap-3 px-4">
          <Link href="/" className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">
            <ChevronLeft size={16} /> 返回社区
          </Link>
          <Link href="/" className="ml-auto flex items-center gap-1.5">
            <InfinityIcon className="h-5 w-5 stroke-[1.5] text-indigo-600 dark:text-indigo-400" />
            <span className="bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-sm font-extrabold tracking-tight text-transparent dark:from-indigo-400 dark:to-purple-400">
              AuMath
            </span>
          </Link>
          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8">
        <div className="mb-6 flex items-center gap-2">
          <CalendarDays size={22} className="text-indigo-500" />
          <div>
            <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">每日一题</h1>
            <p className="text-xs text-zinc-400 tabular-nums">{today}</p>
          </div>
        </div>

        {question ? (
          <QuestionCard
            question={question}
            isLoggedIn={!!user}
            initialFavorited={favoritedIds.includes(question.id)}
            initialErrored={erroredIds.includes(question.id)}
          />
        ) : (
          <div className="rounded-xl border border-dashed border-zinc-300 px-6 py-16 text-center text-sm text-zinc-400 dark:border-zinc-700">
            题库暂无公开题目，明天再来吧。
          </div>
        )}
      </main>
    </div>
  );
}
