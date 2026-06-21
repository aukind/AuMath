// 我的白板（RSC）。Obsidian Canvas 对标：无限画布上自由摆放卡片连线。
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ChevronLeft, Infinity as InfinityIcon, LayoutDashboard, Globe, Lock, Boxes } from 'lucide-react';
import ThemeToggle from '@/components/ThemeToggle';
import NewCanvasButton from '@/components/canvas/NewCanvasButton';
import { listCanvases } from '@/app/actions/canvas';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const metadata = { title: '我的白板 · AuMath' };

export default async function CanvasListPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?redirectTo=/canvas');

  const canvases = await listCanvases();

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <header className="sticky top-0 z-30 border-b border-zinc-200 bg-white/80 backdrop-blur-sm dark:border-zinc-800 dark:bg-zinc-900/80">
        <div className="mx-auto flex h-14 max-w-3xl items-center gap-3 px-4">
          <Link href="/" className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">
            <ChevronLeft size={16} /> 返回首页
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
        <div className="mb-6 flex items-center justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-xl font-bold text-zinc-900 dark:text-zinc-50">
              <LayoutDashboard size={20} className="text-rose-500" />
              我的白板
            </h1>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              无限画布上自由摆放文本卡 / 笔记卡并连线——画解题思路图、知识结构图、专题串讲。
            </p>
          </div>
          <NewCanvasButton />
        </div>

        {canvases.length === 0 ? (
          <div className="rounded-xl border border-dashed border-zinc-300 py-16 text-center dark:border-zinc-700">
            <LayoutDashboard size={28} className="mx-auto text-zinc-300 dark:text-zinc-600" />
            <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">还没有白板。新建一张，开始把想法连成网。</p>
          </div>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {canvases.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/canvas/${c.id}`}
                  className="group block rounded-xl border border-zinc-200 bg-white px-4 py-3.5 shadow-sm transition-colors hover:border-rose-300 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-rose-500/40"
                >
                  <div className="flex items-center gap-2">
                    <h2 className="flex-1 truncate font-semibold text-zinc-900 group-hover:text-rose-600 dark:text-zinc-100 dark:group-hover:text-rose-300">
                      {c.title}
                    </h2>
                    {c.isPublic
                      ? <Globe size={13} className="shrink-0 text-emerald-500" aria-label="公开" />
                      : <Lock size={13} className="shrink-0 text-zinc-400" aria-label="私有" />}
                  </div>
                  <p className="mt-1 flex items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400">
                    <Boxes size={12} /> {c.nodeCount} 个卡片
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
