'use client';

import { useState } from 'react';
import Link from 'next/link';
import { FileText, ChevronDown, Loader2, Search } from 'lucide-react';
import { useSoftNav, isPlainLeftClick } from '@/components/ui/useSoftNav';
import type { PaperRow, PaperGrade } from '@/types/database';

const GRADES: { key: PaperGrade; label: string }[] = [
  { key: 'high_school_3', label: '高三' },
  { key: 'high_school_2', label: '高二' },
  { key: 'high_school_1', label: '高一' },
];

interface MockPapersProps {
  papers: PaperRow[];
  selectedPaperId?: string;
}

export default function MockPapers({ papers, selectedPaperId }: MockPapersProps) {
  const { navigate, isPending, pendingHref } = useSoftNav();
  const defaultOpen = (() => {
    if (selectedPaperId) {
      const p = papers.find(p => p.id === selectedPaperId);
      if (p?.grade) return p.grade as PaperGrade;
    }
    return GRADES[0].key;
  })();

  const [openGrade, setOpenGrade] = useState<PaperGrade | null>(defaultOpen);
  const [query, setQuery] = useState('');

  if (papers.length === 0) {
    return <p className="text-xs text-zinc-400 px-1 py-2">暂无模拟题</p>;
  }

  const q = query.trim().toLowerCase();
  const filtered = q ? papers.filter(p => p.title.toLowerCase().includes(q)) : papers;

  return (
    <div className="flex flex-col gap-2">
      {/* 搜索框 —— 与真题列表一致，可跨学段按卷名搜索 */}
      <div className="relative">
        <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="搜索模拟卷…"
          className="w-full pl-7 pr-3 py-1.5 text-xs rounded-md border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/60 text-zinc-800 dark:text-zinc-200 placeholder:text-zinc-400 focus:outline-none focus:ring-1 focus:ring-violet-400 dark:focus:ring-violet-600 transition-all"
        />
      </div>

      {q && filtered.length === 0 ? (
        <p className="text-xs text-zinc-400 px-1 py-2">无匹配结果</p>
      ) : (
      <nav className="flex flex-col gap-0.5">
      {GRADES.map(({ key, label }) => {
        const items = filtered.filter(p => p.grade === key);
        // 搜索时：有匹配的学段自动展开、无匹配的隐藏；非搜索时按手风琴折叠。
        if (q && items.length === 0) return null;
        const isOpen = q ? true : openGrade === key;

        return (
          <div key={key}>
            {/* Grade header */}
            <button
              onClick={() => setOpenGrade(isOpen ? null : key)}
              className="w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-xs font-bold tracking-wide text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            >
              <span>{label}</span>
              <div className="flex items-center gap-1.5">
                {items.length > 0 && (
                  <span className="text-[9px] font-medium text-zinc-400 dark:text-zinc-500 bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded-full leading-none">
                    {items.length}套
                  </span>
                )}
                <ChevronDown
                  size={11}
                  className={`text-zinc-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
                />
              </div>
            </button>

            {/* Paper list under this grade */}
            {isOpen && (
              <div className="mt-0.5 mb-1 pl-1 space-y-0.5">
                {items.length === 0 ? (
                  <p className="text-[0.6875rem] text-zinc-400 px-2.5 py-1">暂无试卷</p>
                ) : (
                  items.map(paper => {
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
                          'group flex items-center gap-2 rounded-lg py-1.5 pl-2.5 pr-2 text-xs transition-colors',
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
                        <span className="flex-1 truncate leading-snug">{paper.title}</span>
                        {!!paper.total_questions && (
                          <span className="shrink-0 text-[9px] font-medium text-zinc-400 dark:text-zinc-500 bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded-full leading-none">
                            {paper.total_questions}题
                          </span>
                        )}
                      </Link>
                    );
                  })
                )}
              </div>
            )}
          </div>
        );
      })}
      </nav>
      )}
    </div>
  );
}
