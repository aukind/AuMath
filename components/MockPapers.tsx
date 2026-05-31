'use client';

import { useState } from 'react';
import Link from 'next/link';
import { FileText, ChevronDown, Loader2 } from 'lucide-react';
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

  if (papers.length === 0) {
    return <p className="text-xs text-zinc-400 px-1 py-2">暂无模拟题</p>;
  }

  return (
    <nav className="flex flex-col gap-0.5">
      {GRADES.map(({ key, label }) => {
        const items = papers.filter(p => p.grade === key);
        const isOpen = openGrade === key;

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
  );
}
