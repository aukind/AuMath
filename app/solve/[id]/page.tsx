// 解题工作台（RSC）。读题 → 全屏手写演算 → 卡住求助渐进提示 → 自评沉淀。
// 题面/答案在服务端用 MathRenderer 渲染后，作为 slot 注入客户端 SolvingWorkbench
// （沿用「服务端内容当 prop 注入」范式，首屏 KaTeX 无闪烁）。
import Link from 'next/link';
import { redirect, notFound } from 'next/navigation';
import { Toaster } from 'sonner';
import { ChevronLeft, Infinity as InfinityIcon } from 'lucide-react';
import ThemeToggle from '@/components/ThemeToggle';
import MathRenderer from '@/components/MathRenderer';
import CanvasScratchpad from '@/components/CanvasScratchpad';
import SolvingWorkbench from '@/components/solve/SolvingWorkbench';
import { getQuestionForGraph } from '@/app/actions/graph';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = await getQuestionForGraph(id);
  if (!detail) return { title: '解题工作台 · AuMath' };
  return { title: `解题 · ${detail.question.source || '题目'} · AuMath` };
}

export default async function SolvePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?redirectTo=/solve/${id}`);

  const detail = await getQuestionForGraph(id);
  if (!detail) notFound();
  const q = detail.question;

  // 题面（不含答案）——academicTypography 沿用题库阅读排版。
  const problemSlot = <MathRenderer content={q.content} academicTypography />;

  // 答案 / 解析 / 标准解——折叠在「对答案」之后。
  const answerSlot = (
    <div className="flex flex-col gap-5">
      {q.answer?.trim() && (
        <section>
          <h3 className="mb-1.5 text-sm font-bold text-amber-700 dark:text-amber-300">答案</h3>
          <MathRenderer content={q.answer} />
        </section>
      )}
      {q.analysis?.trim() && (
        <section>
          <h3 className="mb-1.5 text-sm font-bold text-zinc-700 dark:text-zinc-200">解析</h3>
          <MathRenderer content={q.analysis} academicTypography />
        </section>
      )}
      {q.solution?.trim() && (
        <section>
          <h3 className="mb-1.5 text-sm font-bold text-zinc-700 dark:text-zinc-200">标准解</h3>
          <MathRenderer content={q.solution} academicTypography />
        </section>
      )}
      {!q.answer?.trim() && !q.analysis?.trim() && !q.solution?.trim() && (
        <p className="text-sm text-zinc-400">该题暂无答案与解析。</p>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <header className="sticky top-0 z-30 border-b border-zinc-200 bg-white/80 backdrop-blur-sm dark:border-zinc-800 dark:bg-zinc-900/80">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-3 px-4">
          <Link href={`/question/${id}`} className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">
            <ChevronLeft size={16} /> 退出工作台
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

      <main className="mx-auto max-w-5xl px-4 py-8">
        <SolvingWorkbench
          questionId={q.id}
          meta={{ source: q.source, year: q.year, difficulty: q.difficulty }}
          problemSlot={problemSlot}
          answerSlot={answerSlot}
        />
      </main>

      {/* 全屏手写演算草稿本（右下角 FAB 召出） */}
      <CanvasScratchpad />
      <Toaster richColors position="top-center" />
    </div>
  );
}
