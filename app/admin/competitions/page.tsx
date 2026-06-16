// 竞赛管理（管理员 RSC 门控）。列表 + 新建/编辑/删除 + 初始化常见竞赛。
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Toaster } from 'sonner';
import { ArrowLeft, CalendarClock } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { isAdminUser } from '@/lib/utils/auth';
import { getAllCompetitions } from '@/app/actions/competitions';
import CompetitionManager from '@/components/admin/CompetitionManager';

export const dynamic = 'force-dynamic';
export const metadata = { title: '竞赛管理 · AuMath' };

export default async function AdminCompetitionsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!isAdminUser(user)) redirect('/');

  const competitions = await getAllCompetitions();

  return (
    <main className="min-h-screen bg-zinc-50 px-4 py-8 dark:bg-zinc-950">
      <div className="mx-auto max-w-2xl">
        <header className="mb-6">
          <Link href="/calendar" className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">
            <ArrowLeft size={15} /> 返回竞赛日历
          </Link>
          <h1 className="mt-2 flex items-center gap-2 text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
            <CalendarClock className="h-6 w-6 text-indigo-600 dark:text-indigo-400" /> 竞赛管理
          </h1>
          <p className="mt-1.5 text-sm text-zinc-500 dark:text-zinc-400">
            维护各级竞赛/高考的考试日、报名截止与官网链接 · 共 {competitions.length} 项
          </p>
        </header>

        <CompetitionManager initial={competitions} />
        <Toaster richColors position="top-center" />
      </div>
    </main>
  );
}
