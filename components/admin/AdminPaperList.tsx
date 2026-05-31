'use client';

// 试卷管理列表 + 搜索。按卷名/年份筛选；行内可进入详情或删除整卷。
import { useState } from 'react';
import Link from 'next/link';
import { FileText, ChevronRight, Search } from 'lucide-react';
import PaperRowActions from '@/components/admin/PaperRowActions';
import type { PaperRow } from '@/types/database';

export default function AdminPaperList({ papers }: { papers: PaperRow[] }) {
  const [query, setQuery] = useState('');

  const q = query.trim().toLowerCase();
  const filtered = q
    ? papers.filter(p =>
        p.title.toLowerCase().includes(q) ||
        (p.year ? String(p.year).includes(q) : false))
    : papers;

  if (papers.length === 0) {
    return (
      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 py-16 text-center text-sm text-muted-foreground">
        暂无试卷，请前往{' '}
        <Link href="/admin/paper-upload" className="text-blue-600 hover:underline">录题工作台</Link>{' '}
        上传。
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* 搜索框 */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400 pointer-events-none" />
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="搜索试卷（按卷名或年份）…"
          className="w-full pl-9 pr-3 py-2.5 text-sm rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
        />
      </div>

      {q && (
        <p className="px-1 text-xs text-muted-foreground">
          匹配 {filtered.length} / {papers.length} 套
        </p>
      )}

      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 divide-y divide-zinc-100 dark:divide-zinc-800">
        {filtered.length === 0 ? (
          <div className="py-16 text-center text-sm text-muted-foreground">无匹配的试卷</div>
        ) : (
          filtered.map((p) => (
            <div key={p.id} className="flex items-center gap-3 px-5 py-3.5 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors group">
              <FileText className="h-4 w-4 text-zinc-400 shrink-0" />
              <Link
                href={`/admin/papers/${p.id}`}
                className="flex-1 min-w-0 flex items-center gap-3"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-foreground truncate">
                    {p.title}
                  </div>
                  <div className="mt-0.5 flex items-center gap-3 text-xs text-muted-foreground">
                    {p.year && <span>{p.year} 年</span>}
                    <span className="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-[10px]">
                      {p.type === 'real' ? '真题' : '模拟'}
                    </span>
                    <span>{p.total_questions} 题</span>
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-zinc-300 dark:text-zinc-600 group-hover:text-zinc-500 dark:group-hover:text-zinc-400 transition-colors" />
              </Link>
              <PaperRowActions paperId={p.id} title={p.title} />
            </div>
          ))
        )}
      </div>
    </div>
  );
}
