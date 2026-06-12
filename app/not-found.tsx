// 全站 404：失效的题目/帖子/用户链接落到这里，给出明确的去处而非原生报错页。
import Link from 'next/link';
import { Home, Search, Infinity as InfinityIcon } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-zinc-50 px-6 text-center dark:bg-zinc-950">
      <InfinityIcon className="h-10 w-10 stroke-[1.5] text-indigo-300 dark:text-indigo-700" />
      <p className="text-5xl font-extrabold tracking-tight text-zinc-200 dark:text-zinc-800">404</p>
      <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">页面不存在</h1>
      <p className="max-w-sm text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">
        你访问的题目、帖子或页面可能已被删除，或者链接有误。
      </p>
      <div className="mt-2 flex gap-2.5">
        <Link
          href="/"
          className="flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition-all hover:bg-indigo-700 active:scale-95"
        >
          <Home size={14} /> 回首页
        </Link>
        <Link
          href="/search"
          className="flex items-center gap-1.5 rounded-xl border border-zinc-200 px-4 py-2.5 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          <Search size={14} /> 去搜索
        </Link>
      </div>
    </div>
  );
}
