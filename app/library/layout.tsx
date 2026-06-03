// 资源大厅共享外壳：左侧常驻 HomeSidebar（含资源大厅分级目录树）+ 右侧内容。
// 这样从首页点开「资源大厅」进入 /library?cat=… 时，左侧栏不消失（与高考题库一致体验）。
import Link from 'next/link';
import { Infinity as InfinityIcon } from 'lucide-react';
import { Toaster } from 'sonner';
import { getQuestionTopics, getPapers } from '@/app/actions/questions';
import { createClient } from '@/lib/supabase/server';
import { isAdminUser } from '@/lib/utils/auth';
import HomeSidebar from '@/components/HomeSidebar';
import ThemeToggle from '@/components/ThemeToggle';

export const dynamic = 'force-dynamic';

export default async function LibraryLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const [{ data: { user } }, topics, papers] = await Promise.all([
    supabase.auth.getUser(),
    getQuestionTopics(),
    getPapers(),
  ]);
  const isAdmin = isAdminUser(user);

  return (
    // 与首页一致：固定视口外壳 + 内部 overflow-y-auto 滚动；data-lenis-prevent 让内层恢复原生滚动。
    <div data-lenis-prevent className="flex h-screen flex-col overflow-hidden bg-zinc-50 dark:bg-zinc-950">
      <header className="sticky top-0 z-30 shrink-0 border-b border-zinc-200 bg-white/80 backdrop-blur-sm dark:border-zinc-800 dark:bg-zinc-900/80">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-2 px-4">
          <Link href="/" className="flex items-center gap-2">
            <InfinityIcon className="h-5 w-5 stroke-[1.5] text-indigo-600 dark:text-indigo-400" />
            <span className="bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-sm font-extrabold tracking-tight text-transparent dark:from-indigo-400 dark:to-purple-400">
              AuMath
            </span>
          </Link>
          <span className="text-sm text-zinc-400">· 资源大厅</span>
          <div className="ml-auto">
            <ThemeToggle />
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-7xl flex-1 overflow-hidden">
        <aside className="hidden w-56 shrink-0 flex-col gap-3 overflow-y-auto border-r border-zinc-200/70 bg-zinc-50/60 px-3 py-5 lg:flex xl:w-64 dark:border-zinc-800 dark:bg-zinc-900/40">
          <HomeSidebar topics={topics} papers={papers} isAdmin={isAdmin} mainView="forum" />
        </aside>
        <main className="min-w-0 flex-1 overflow-y-auto [scrollbar-gutter:stable]">
          {children}
        </main>
      </div>

      <Toaster richColors position="top-center" />
    </div>
  );
}
