import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { isAdminUser } from '@/lib/utils/auth';
import { getPapers } from '@/app/actions/questions';
import { ArrowLeft } from 'lucide-react';
import AdminPaperList from '@/components/admin/AdminPaperList';
import EmbeddingBackfillButton from '@/components/admin/EmbeddingBackfillButton';

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
          <div className="mt-4">
            <EmbeddingBackfillButton />
          </div>
        </header>

        <AdminPaperList papers={papers} />
      </div>
    </main>
  );
}
