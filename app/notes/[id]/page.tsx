// 笔记详情（RSC）。正文用 MathRenderer 服务端渲染（含 KaTeX + [[维基链接]] linkify），
// 作为 children 传给客户端壳 NoteDetailClient——它负责「阅读 / 编辑」切换、保存、删除。
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ChevronLeft, Infinity as InfinityIcon } from 'lucide-react';
import ThemeToggle from '@/components/ThemeToggle';
import NoteBody from '@/components/notes/NoteBody';
import NoteDetailClient from '@/components/notes/NoteDetailClient';
import { getNote, getUnlinkedMentions } from '@/app/actions/notes';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function NoteDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ edit?: string }>;
}) {
  const { id } = await params;
  const { edit } = await searchParams;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?redirectTo=/notes/${id}`);

  const note = await getNote(id);
  if (!note) notFound();

  // 未链接提及（仅本人笔记有意义；getUnlinkedMentions 内部已做归属校验）。
  const mentions = await getUnlinkedMentions(id);

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <header className="sticky top-0 z-30 border-b border-zinc-200 bg-white/80 backdrop-blur-sm dark:border-zinc-800 dark:bg-zinc-900/80">
        <div className="mx-auto flex h-14 max-w-3xl items-center gap-3 px-4">
          <Link href="/notes" className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">
            <ChevronLeft size={16} /> 我的笔记
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
        <NoteDetailClient note={note} startEditing={edit === '1'} mentions={mentions}>
          {note.bodyMd.trim()
            ? <NoteBody body={note.bodyMd} />
            : <p className="text-sm italic text-zinc-400 dark:text-zinc-500">（空白笔记，点「编辑」开始书写）</p>}
        </NoteDetailClient>
      </main>
    </div>
  );
}
