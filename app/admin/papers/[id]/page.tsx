import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { isAdminUser } from '@/lib/utils/auth';
import { getQuestionsByPaperId } from '@/app/actions/questions';
import { ArrowLeft, Pencil } from 'lucide-react';
import MathRenderer from '@/components/MathRenderer';
import PaperDetailActions from '@/components/admin/PaperDetailActions';
import EditPaperButton from '@/components/admin/EditPaperButton';
import PaperQuestionRowActions from '@/components/admin/PaperQuestionRowActions';

export const dynamic = 'force-dynamic';
export const metadata = { title: '试卷详情 · AuMath 管理' };

export default async function PaperDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!isAdminUser(user)) redirect('/login');

  const { id } = await params;
  const { paper, questions } = await getQuestionsByPaperId(id);

  if (!paper) notFound();

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-4xl px-6 py-10">
        <header className="mb-6">
          <Link
            href="/admin/papers"
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mb-3 transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> 返回试卷列表
          </Link>
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-bold tracking-tight text-foreground truncate">
                {paper.title}
              </h1>
              <p className="mt-1.5 text-sm text-muted-foreground">
                {paper.year && `${paper.year} 年 · `}
                {paper.type === 'real' ? '真题' : '模拟'} ·{' '}
                共 {questions.length} 题 ·{' '}
                点击右侧&quot;编辑&quot;或&quot;删除&quot;按钮校对每道题
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <EditPaperButton paper={paper} />
              <PaperDetailActions paperId={paper.id} title={paper.title} />
            </div>
          </div>
        </header>

        {questions.length === 0 ? (
          <div className="rounded-xl border border-dashed border-zinc-200 dark:border-zinc-800 py-16 text-center text-sm text-muted-foreground">
            该试卷暂无题目
          </div>
        ) : (
          <div className="space-y-3">
            {questions.map((q) => (
              <div
                key={q.id}
                className="group rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-5 py-4"
              >
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="font-mono text-zinc-400">
                      #{q.question_number ?? '?'}
                    </span>
                    {(q.rating_count ?? 0) > 0 && (
                      <span className="px-1.5 py-0.5 rounded bg-amber-50 dark:bg-amber-950/40 text-[10px] text-amber-600 dark:text-amber-400">
                        难度 {Number(q.rating_avg ?? 0).toFixed(1)}★ · {q.rating_count}人
                      </span>
                    )}
                    {q.metadata?.tags && typeof q.metadata.tags === 'string' && (
                      <span className="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-[10px] text-zinc-600 dark:text-zinc-300">
                        {q.metadata.tags}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Link
                      href={`/admin/edit/${q.id}`}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-md border border-zinc-200 dark:border-zinc-700 text-xs text-zinc-500 hover:text-blue-600 hover:border-blue-300 dark:hover:text-blue-400 dark:hover:border-blue-700 transition-colors"
                    >
                      <Pencil size={11} /> 编辑
                    </Link>
                    <PaperQuestionRowActions
                      questionId={q.id}
                      questionNumber={q.question_number ?? 0}
                    />
                  </div>
                </div>
                <div className="text-sm">
                  <MathRenderer content={q.content} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
