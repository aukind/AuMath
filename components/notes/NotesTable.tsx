// 笔记表格视图（Bases-lite）。服务端纯展示，排序由 URL 参数驱动（点表头切 sort/dir）。
import Link from 'next/link';
import { ArrowUp, ArrowDown, Globe, Lock, Tag } from 'lucide-react';
import type { NoteSummary } from '@/types/notes';

export type SortKey = 'title' | 'links' | 'updated';

function headerHref(col: SortKey, sort: SortKey, dir: 'asc' | 'desc', tag?: string) {
  // 同列再点切换升/降；换列默认按更新降序的反直觉，故标题默认升、其余默认降。
  const nextDir = sort === col ? (dir === 'asc' ? 'desc' : 'asc') : (col === 'title' ? 'asc' : 'desc');
  const p = new URLSearchParams({ view: 'table', sort: col, dir: nextDir });
  if (tag) p.set('tag', tag);
  return `/notes?${p.toString()}`;
}

function SortHead({ col, label, sort, dir, tag, className }: {
  col: SortKey; label: string; sort: SortKey; dir: 'asc' | 'desc'; tag?: string; className?: string;
}) {
  const active = sort === col;
  return (
    <th className={`px-3 py-2 text-left font-medium ${className ?? ''}`}>
      <Link href={headerHref(col, sort, dir, tag)} className={`inline-flex items-center gap-1 ${active ? 'text-zinc-900 dark:text-zinc-100' : 'text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200'}`}>
        {label}
        {active && (dir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
      </Link>
    </th>
  );
}

export default function NotesTable({ notes, sort, dir, tag }: {
  notes: NoteSummary[]; sort: SortKey; dir: 'asc' | 'desc'; tag?: string;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
      <table className="w-full border-collapse text-sm">
        <thead className="border-b border-zinc-200 bg-zinc-50 text-xs dark:border-zinc-800 dark:bg-zinc-900/50">
          <tr>
            <SortHead col="title" label="标题" sort={sort} dir={dir} tag={tag} />
            <th className="px-3 py-2 text-left font-medium text-zinc-500 dark:text-zinc-400">标签</th>
            <SortHead col="links" label="出链" sort={sort} dir={dir} tag={tag} className="w-16" />
            <SortHead col="updated" label="更新" sort={sort} dir={dir} tag={tag} className="w-28" />
            <th className="w-12 px-3 py-2 text-left font-medium text-zinc-500 dark:text-zinc-400">可见</th>
          </tr>
        </thead>
        <tbody>
          {notes.map((n) => (
            <tr key={n.id} className="border-b border-zinc-100 last:border-0 hover:bg-zinc-50 dark:border-zinc-800/60 dark:hover:bg-zinc-900/40">
              <td className="px-3 py-2">
                <Link href={`/notes/${n.id}`} className="font-medium text-zinc-800 hover:text-cyan-700 dark:text-zinc-100 dark:hover:text-cyan-300">
                  {n.title}
                </Link>
              </td>
              <td className="px-3 py-2">
                <div className="flex flex-wrap gap-1">
                  {n.tags.slice(0, 4).map((t) => (
                    <Link key={t} href={`/notes?tag=${encodeURIComponent(t)}`} className="inline-flex items-center gap-0.5 rounded bg-zinc-100 px-1.5 py-0.5 text-[11px] text-zinc-500 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700">
                      <Tag size={9} /> {t}
                    </Link>
                  ))}
                </div>
              </td>
              <td className="px-3 py-2 tabular-nums text-zinc-500 dark:text-zinc-400">{n.linkCount || '—'}</td>
              <td className="px-3 py-2 tabular-nums text-zinc-400">{n.updatedAt.slice(0, 10)}</td>
              <td className="px-3 py-2">
                {n.isPublic ? <Globe size={13} className="text-emerald-500" /> : <Lock size={13} className="text-zinc-400" />}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
