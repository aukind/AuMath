'use client';

// 全站错误边界：任何 RSC 数据查询 / 渲染抛错不再白屏，
// 给出可操作的恢复路径（重试 = 重渲染该 segment，不丢失其余 UI）。
import { useEffect } from 'react';
import Link from 'next/link';
import { RefreshCw, Home, TriangleAlert } from 'lucide-react';

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // digest 是 Vercel 日志里定位服务端原始错误的钥匙
    console.error('[app-error]', error.digest ?? '', error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 dark:bg-amber-950/40">
        <TriangleAlert size={26} className="text-amber-500" />
      </div>
      <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">页面出了点问题</h1>
      <p className="max-w-sm text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">
        可能是网络波动或服务暂时不可用。重试通常就能恢复；若反复出现，请稍后再来。
        {error.digest && (
          <span className="mt-1 block text-xs text-zinc-400 dark:text-zinc-600">
            错误编号：{error.digest}
          </span>
        )}
      </p>
      <div className="mt-2 flex gap-2.5">
        <button
          onClick={reset}
          className="flex items-center gap-1.5 rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition-all hover:bg-zinc-700 active:scale-95 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          <RefreshCw size={14} /> 重试
        </button>
        <Link
          href="/"
          className="flex items-center gap-1.5 rounded-xl border border-zinc-200 px-4 py-2.5 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          <Home size={14} /> 回首页
        </Link>
      </div>
    </div>
  );
}
