'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Search, FileText, Loader2 } from 'lucide-react';
import { useSoftNav, isPlainLeftClick } from '@/components/ui/useSoftNav';
import type { PaperRow } from '@/types/database';

interface PaperListProps {
  papers: PaperRow[];
  selectedPaperId?: string;
}

function groupByYear(papers: PaperRow[]): Array<{ year: string; items: PaperRow[] }> {
  const map = new Map<string, PaperRow[]>();
  for (const p of papers) {
    const key = p.year ? String(p.year) : '未知年份';
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(p);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => {
      if (a === '未知年份') return 1;
      if (b === '未知年份') return -1;
      return Number(b) - Number(a);
    })
    .map(([year, items]) => ({ year, items }));
}

export default function PaperList({ papers, selectedPaperId }: PaperListProps) {
  const [query, setQuery] = useState('');
  const { navigate, isPending, pendingHref } = useSoftNav();

  const filtered = query.trim()
    ? papers.filter(p => p.title.toLowerCase().includes(query.toLowerCase()))
    : papers;

  const groups = groupByYear(filtered);

  return (
    <div className="flex flex-col gap-2">
      {/* Search input */}
      <div className="relative">
        <Search
          size={11}
          className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none"
        />
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="搜索试卷…"
          className="w-full pl-7 pr-3 py-1.5 text-xs rounded-md border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/60 text-zinc-800 dark:text-zinc-200 placeholder:text-zinc-400 focus:outline-none focus:ring-1 focus:ring-violet-400 dark:focus:ring-violet-600 transition-all"
        />
      </div>

      {/* Grouped list */}
      {groups.length === 0 ? (
        <p className="text-xs text-zinc-400 px-1 py-2">
          {papers.length === 0 ? '暂无试卷' : '无匹配结果'}
        </p>
      ) : (
        <nav className="flex flex-col gap-3 overflow-y-auto">
          {groups.map(({ year, items }) => (
            <div key={year}>
              {/* Year heading */}
              <div className="px-1 mb-1 text-[0.5625rem] font-bold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
                {year}
              </div>

              <div className="space-y-0.5">
                {items.map(paper => {
                  const isSelected = paper.id === selectedPaperId;
                  const href = isSelected ? '/' : `/?paper=${paper.id}`;
                  const isLoading = isPending && pendingHref === href;
                  const active = isSelected || isLoading;
                  return (
                    <Link
                      key={paper.id}
                      href={href}
                      title={paper.title}
                      aria-current={active ? 'page' : undefined}
                      onClick={(e) => {
                        if (!isPlainLeftClick(e)) return;
                        e.preventDefault();
                        navigate(href);
                      }}
                      className={[
                        'group flex items-center gap-2 rounded-lg py-1.5 pl-2.5 pr-2 text-[0.8125rem] transition-colors',
                        active
                          ? 'bg-violet-50 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300'
                          : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800',
                      ].join(' ')}
                    >
                      {isLoading ? (
                        <Loader2 size={11} className="shrink-0 animate-spin" />
                      ) : (
                        <FileText
                          size={11}
                          className="shrink-0 opacity-40 group-hover:opacity-60 transition-opacity"
                        />
                      )}
                      <span className="flex-1 truncate leading-snug text-xs">
                        {paper.title}
                      </span>
                      {!!paper.total_questions && (
                        <span className="shrink-0 text-[9px] font-medium text-zinc-400 dark:text-zinc-500 bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded-full leading-none">
                          {paper.total_questions}题
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
      )}
    </div>
  );
}
