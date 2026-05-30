import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { isAdminUser } from '@/lib/utils/auth';
import { getPapers } from '@/app/actions/questions';
import { ArrowLeft, FileText, ChevronRight } from 'lucide-react';
import PaperRowActions from '@/components/admin/PaperRowActions';

export const dynamic = 'force-dynamic';
export const metadata = { title: '试卷管理 · AuMath' };

export default async function AdminPapersPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!isAdminUser(user)) redirect('/login');

  const papers = await getPapers();

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-5xl px-6 py-10">
        <header className="mb-6">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mb-3 transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> 返回首页
          </Link>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">试卷管理</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            管理已入库的全部试卷 · 共 {papers.length} 套 · 点击进入逐题校对
          </p>
        </header>

        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 divide-y divide-zinc-100 dark:divide-zinc-800">
          {papers.length === 0 ? (
            <div className="py-16 text-center text-sm text-muted-foreground">
              暂无试卷，请前往{' '}
              <Link href="/admin/paper-upload" className="text-blue-600 hover:underline">
                录题工作台
              </Link>{' '}
              上传。
            </div>
          ) : (
            papers.map((p) => (
              <div key={p.id} className="flex items-center gap-3 px-5 py-3.5 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors group">
                <FileText className="h-4 w-4 text-zinc-400 shrink-0" />
                <Link
                  href={`/admin/papers/${p.id}`}
                  className="flex-1 min-w-0 flex items-center gap-3"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-foreground truncate">
                      {p.title}
                    </div>
                    <div className="mt-0.5 flex items-center gap-3 text-xs text-muted-foreground">
                      {p.year && <span>{p.year} 年</span>}
                      <span className="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-[10px]">
                        {p.type === 'real' ? '真题' : '模拟'}
                      </span>
                      <span>{p.total_questions} 题</span>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-zinc-300 dark:text-zinc-600 group-hover:text-zinc-500 dark:group-hover:text-zinc-400 transition-colors" />
                </Link>
                <PaperRowActions paperId={p.id} title={p.title} />
              </div>
            ))
          )}
        </div>
      </div>
    </main>
  );
}
