// 题目详情页（RSC）。硬刷新 / 新标签直开 /question/[id] 时渲染此全页（拦截路由的回退）。
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Toaster } from 'sonner';
import { ChevronLeft, Infinity as InfinityIcon } from 'lucide-react';
import QuestionCard from '@/components/QuestionCard';
import ThemeToggle from '@/components/ThemeToggle';
import { getQuestionForGraph } from '@/app/actions/graph';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = await getQuestionForGraph(id);
  if (!detail) return { title: '题目 · AuMath' };
  const plain = detail.question.content.replace(/\$+/g, '').replace(/\s+/g, ' ').trim();
  return {
    title: `${detail.question.source || '题目'} · AuMath 题库`,
    description: plain.slice(0, 120),
  };
}

export default async function QuestionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const detail = await getQuestionForGraph(id);
  if (!detail) notFound();

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <header className="sticky top-0 z-30 border-b border-zinc-200 bg-white/80 backdrop-blur-sm dark:border-zinc-800 dark:bg-zinc-900/80">
        <div className="mx-auto flex h-14 max-w-2xl items-center gap-3 px-4">
          <Link href="/" className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">
            <ChevronLeft size={16} /> 返回题库
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

      <main className="mx-auto max-w-2xl px-4 py-8">
        <QuestionCard
          question={detail.question}
          isLoggedIn={detail.isLoggedIn}
          initialFavorited={detail.favorited}
          initialErrored={detail.errored}
          initialMyRating={detail.myRating}
        />
        <Toaster richColors position="top-center" />
      </main>
    </div>
  );
}
