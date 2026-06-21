// 笔记看板视图（Bases-lite Kanban，按标签分列）。服务端纯展示。
// 一篇多标签笔记会出现在它每个标签的列里；无标签笔记进「未分类」列。
import Link from 'next/link';
import { Tag, Link2 } from 'lucide-react';
import type { NoteSummary } from '@/types/notes';

const MAX_COLUMNS = 12;

export default function NotesBoard({ notes }: { notes: NoteSummary[] }) {
  // 按标签聚合（保序：按列内笔记数降序），外加未分类列。
  const byTag = new Map<string, NoteSummary[]>();
  const untagged: NoteSummary[] = [];
  for (const n of notes) {
    if (n.tags.length === 0) { untagged.push(n); continue; }
    for (const t of n.tags) {
      const arr = byTag.get(t);
      if (arr) arr.push(n); else byTag.set(t, [n]);
    }
  }
  const tagCols = [...byTag.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, MAX_COLUMNS);
  const columns: { key: string; label: string; items: NoteSummary[] }[] = [
    ...tagCols.map(([t, items]) => ({ key: t, label: t, items })),
    ...(untagged.length ? [{ key: '__untagged__', label: '未分类', items: untagged }] : []),
  ];

  return (
    <div className="flex gap-3 overflow-x-auto pb-2">
      {columns.map((col) => (
        <div key={col.key} className="w-64 shrink-0 rounded-xl border border-zinc-200 bg-zinc-50/60 p-2 dark:border-zinc-800 dark:bg-zinc-900/40">
          <div className="mb-2 flex items-center gap-1.5 px-1 text-sm font-medium text-zinc-700 dark:text-zinc-200">
            {col.key === '__untagged__'
              ? <span className="text-zinc-400">未分类</span>
              : <Link href={`/notes?tag=${encodeURIComponent(col.label)}`} className="inline-flex items-center gap-1 hover:text-cyan-700 dark:hover:text-cyan-300"><Tag size={13} /> {col.label}</Link>}
            <span className="ml-auto rounded-full bg-zinc-200 px-1.5 text-xs text-zinc-500 dark:bg-zinc-700 dark:text-zinc-300">{col.items.length}</span>
          </div>
          <div className="space-y-2">
            {col.items.map((n) => (
              <Link key={n.id} href={`/notes/${n.id}`} className="block rounded-lg border border-zinc-200 bg-white px-3 py-2 shadow-sm transition-colors hover:border-cyan-300 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-cyan-500/40">
                <div className="truncate text-sm font-medium text-zinc-800 dark:text-zinc-100">{n.title}</div>
                {n.snippet && <div className="mt-0.5 line-clamp-2 text-xs text-zinc-500 dark:text-zinc-400">{n.snippet}</div>}
                {n.linkCount > 0 && (
                  <div className="mt-1 inline-flex items-center gap-0.5 text-[11px] text-cyan-600 dark:text-cyan-400"><Link2 size={10} /> {n.linkCount}</div>
                )}
              </Link>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
