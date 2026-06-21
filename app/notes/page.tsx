// 我的笔记（RSC）——Obsidian 式原子笔记列表。
// ?ref=标题：来自正文 [[note:标题]] 维基链接的直达入口，命中即重定向到该笔记。
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ChevronLeft, Infinity as InfinityIcon, NotebookPen, Link2, Globe, Lock, Tag, LayoutList, Table2, Columns3 } from 'lucide-react';
import ThemeToggle from '@/components/ThemeToggle';
import NewNoteButton from '@/components/notes/NewNoteButton';
import NotesTable, { type SortKey } from '@/components/notes/NotesTable';
import NotesBoard from '@/components/notes/NotesBoard';
import { getMyNotes, getNoteByTitle } from '@/app/actions/notes';
import { createClient } from '@/lib/supabase/server';

type View = 'card' | 'table' | 'board';

export const dynamic = 'force-dynamic';
export const metadata = { title: '我的笔记 · AuMath' };

export default async function NotesPage({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string; tag?: string; view?: string; sort?: string; dir?: string }>;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?redirectTo=/notes');

  const sp = await searchParams;
  const { ref, tag } = sp;
  // [[note:标题]] 直达：命中本人笔记则跳转详情。
  if (ref) {
    const hit = await getNoteByTitle(ref);
    if (hit) redirect(`/notes/${hit.id}`);
  }

  const view: View = sp.view === 'table' ? 'table' : sp.view === 'board' ? 'board' : 'card';
  const sort: SortKey = sp.sort === 'title' ? 'title' : sp.sort === 'links' ? 'links' : 'updated';
  const dir: 'asc' | 'desc' = sp.dir === 'asc' ? 'asc' : 'desc';

  const allNotes = await getMyNotes();
  // 全部标签（按出现频次降序），供过滤条。
  const tagCount = new Map<string, number>();
  for (const n of allNotes) for (const t of n.tags) tagCount.set(t, (tagCount.get(t) ?? 0) + 1);
  const allTags = [...tagCount.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t);
  let notes = tag ? allNotes.filter((n) => n.tags.includes(tag)) : allNotes;

  // 表格视图按所选列排序（其余视图保留 getMyNotes 的更新时间倒序）。
  if (view === 'table') {
    const cmp = (a: typeof notes[number], b: typeof notes[number]) => {
      const v = sort === 'title' ? a.title.localeCompare(b.title, 'zh')
        : sort === 'links' ? a.linkCount - b.linkCount
        : a.updatedAt.localeCompare(b.updatedAt);
      return dir === 'asc' ? v : -v;
    };
    notes = [...notes].sort(cmp);
  }

  // 构造保留视图/标签的 URL。
  const buildHref = (opts: { tag?: string; view?: View }) => {
    const p = new URLSearchParams();
    const t = opts.tag ?? tag;
    const v = opts.view ?? view;
    if (t) p.set('tag', t);
    if (v !== 'card') p.set('view', v);
    const qs = p.toString();
    return qs ? `/notes?${qs}` : '/notes';
  };

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

      <main className={`mx-auto px-4 py-8 ${view === 'card' ? 'max-w-3xl' : 'max-w-6xl'}`}>
        <div className="mb-6 flex items-center justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-xl font-bold text-zinc-900 dark:text-zinc-50">
              <NotebookPen size={20} className="text-cyan-600 dark:text-cyan-400" />
              我的笔记
            </h1>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              用 <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">[[知识点]]</code>、
              <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">[[thm:定理]]</code>、
              <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">[[note:别的笔记]]</code> 双链，笔记会长进知识星图。
            </p>
          </div>
          <NewNoteButton />
        </div>

        {/* 视图切换器（卡片 / 表格 / 看板 —— Bases 式多视图） */}
        <div className="mb-4 inline-flex items-center gap-0.5 rounded-lg border border-zinc-200 bg-white p-0.5 dark:border-zinc-800 dark:bg-zinc-900">
          {([
            { v: 'card' as View, icon: <LayoutList size={14} />, label: '卡片' },
            { v: 'table' as View, icon: <Table2 size={14} />, label: '表格' },
            { v: 'board' as View, icon: <Columns3 size={14} />, label: '看板' },
          ]).map(({ v, icon, label }) => (
            <Link
              key={v}
              href={buildHref({ view: v })}
              className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium ${view === v ? 'bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100' : 'text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200'}`}
            >
              {icon} {label}
            </Link>
          ))}
        </div>

        {ref && (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
            没有找到标题为「{ref}」的笔记。可在上方「新建」一篇同名笔记补上这条链接。
          </div>
        )}

        {/* 标签过滤条 */}
        {allTags.length > 0 && (
          <div className="mb-4 flex flex-wrap items-center gap-1.5">
            <Link href={buildHref({ tag: undefined })} className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs ${!tag ? 'bg-zinc-800 text-white dark:bg-zinc-100 dark:text-zinc-900' : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300'}`}>
              全部
            </Link>
            {allTags.map((t) => (
              <Link key={t} href={buildHref({ tag: t })} className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs ${tag === t ? 'bg-zinc-800 text-white dark:bg-zinc-100 dark:text-zinc-900' : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300'}`}>
                <Tag size={11} /> {t} <span className="opacity-60">{tagCount.get(t)}</span>
              </Link>
            ))}
          </div>
        )}

        {notes.length === 0 ? (
          <div className="rounded-xl border border-dashed border-zinc-300 py-16 text-center dark:border-zinc-700">
            <NotebookPen size={28} className="mx-auto text-zinc-300 dark:text-zinc-600" />
            <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">还没有笔记。新建第一条，开始搭建你的第二大脑。</p>
          </div>
        ) : view === 'table' ? (
          <NotesTable notes={notes} sort={sort} dir={dir} tag={tag} />
        ) : view === 'board' ? (
          <NotesBoard notes={notes} />
        ) : (
          <ul className="space-y-2.5">
            {notes.map((n) => (
              <li key={n.id}>
                <Link
                  href={`/notes/${n.id}`}
                  className="group block rounded-xl border border-zinc-200 bg-white px-4 py-3.5 shadow-sm transition-colors hover:border-cyan-300 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-cyan-500/40"
                >
                  <div className="flex items-center gap-2">
                    <h2 className="flex-1 truncate font-semibold text-zinc-900 group-hover:text-cyan-700 dark:text-zinc-100 dark:group-hover:text-cyan-300">
                      {n.title}
                    </h2>
                    {n.isPublic
                      ? <Globe size={13} className="shrink-0 text-emerald-500" aria-label="公开" />
                      : <Lock size={13} className="shrink-0 text-zinc-400" aria-label="私有" />}
                    {n.linkCount > 0 && (
                      <span className="flex shrink-0 items-center gap-0.5 text-xs text-cyan-600 dark:text-cyan-400">
                        <Link2 size={12} /> {n.linkCount}
                      </span>
                    )}
                  </div>
                  {n.snippet && (
                    <p className="mt-1 line-clamp-1 text-sm text-zinc-500 dark:text-zinc-400">{n.snippet}</p>
                  )}
                  {n.tags.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {n.tags.slice(0, 5).map((t) => (
                        <span key={t} className="inline-flex items-center gap-0.5 rounded bg-zinc-100 px-1.5 py-0.5 text-[11px] text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                          <Tag size={9} /> {t}
                        </span>
                      ))}
                    </div>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
