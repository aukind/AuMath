'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Loader2 } from 'lucide-react';

/** 全站搜索输入框：回车软导航到 /search?q=。 */
export default function SearchBox({ initialQuery = '' }: { initialQuery?: string }) {
  const router = useRouter();
  const [q, setQ] = useState(initialQuery);
  const [pending, start] = useTransition();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const query = q.trim();
    if (!query) return;
    start(() => router.push(`/search?q=${encodeURIComponent(query)}`));
  };

  return (
    <form onSubmit={submit} className="relative">
      {pending ? (
        <Loader2 size={16} className="absolute left-3 top-1/2 -translate-y-1/2 animate-spin text-zinc-400" />
      ) : (
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
      )}
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="搜索题目内容、出处或帖子标题…"
        autoFocus
        className="w-full rounded-xl border border-zinc-200 bg-white py-2.5 pl-10 pr-3 text-sm text-zinc-800 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
      />
    </form>
  );
}
