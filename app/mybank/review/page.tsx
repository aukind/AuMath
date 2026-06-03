// 今日复习页（RSC）。预取今日到期错题，交 ReviewSession 维护答题流。
// 演算复用全屏草稿本 CanvasScratchpad（右下角 FAB 召出，与卡片布局解耦）。
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Toaster } from 'sonner';
import { ChevronLeft, Infinity as InfinityIcon, Sparkles } from 'lucide-react';
import ThemeToggle from '@/components/ThemeToggle';
import CanvasScratchpad from '@/components/CanvasScratchpad';
import ReviewSession from '@/components/mybank/ReviewSession';
import { getTodayDueQuestions } from '@/app/actions/fsrs';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function ReviewPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?redirectTo=/mybank/review');

  const due = await getTodayDueQuestions();

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <header className="sticky top-0 z-30 border-b border-zinc-200 bg-white/80 backdrop-blur-sm dark:border-zinc-800 dark:bg-zinc-900/80">
        <div className="mx-auto flex h-14 max-w-3xl items-center gap-3 px-4">
          <Link
            href="/?view=mybank&workspace=errors"
            className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
          >
            <ChevronLeft size={16} /> 返回错题本
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

      <main className="mx-auto max-w-3xl px-4 py-8 sm:py-12">
        {due.length === 0 ? (
          <div className="mx-auto flex max-w-md flex-col items-center gap-4 rounded-3xl border border-zinc-200 bg-white px-8 py-20 text-center shadow-xl shadow-black/5 dark:border-zinc-800 dark:bg-zinc-900">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-500 text-white shadow-lg">
              <Sparkles size={30} />
            </div>
            <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">今日已清空 🎉</h1>
            <p className="text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">
              暂时没有到期的错题。继续做题、标记错题，系统会按 FSRS 算法在最佳时机把它们推送给你。
            </p>
            <Link
              href="/?view=mybank&workspace=errors"
              className="mt-1 inline-flex items-center gap-1.5 rounded-2xl bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white transition-transform hover:scale-[1.03] active:scale-95 dark:bg-zinc-100 dark:text-zinc-900"
            >
              返回错题本
            </Link>
          </div>
        ) : (
          <ReviewSession initialQuestions={due} />
        )}
      </main>

      {/* 全屏演算草稿本（右下角 FAB 召出） */}
      <CanvasScratchpad />
      <Toaster richColors position="top-center" />
    </div>
  );
}
