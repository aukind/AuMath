// 通用加载骨架原语：与 dashboard/loading.tsx 的 Bar 同款视觉，供各路由 loading.tsx 复用。
export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-zinc-200 dark:bg-zinc-800 ${className}`} />;
}

/** 题卡骨架：题头一行 + 三行正文 + 操作条，近似 QuestionCard 占位高度，减少加载完成时的布局跳动。 */
export function QuestionCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-100 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="border-b border-zinc-100 bg-zinc-50/60 px-5 py-3 dark:border-zinc-800 dark:bg-zinc-800/30">
        <Skeleton className="h-4 w-40" />
      </div>
      <div className="space-y-2.5 px-5 py-5">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-11/12" />
        <Skeleton className="h-4 w-3/5" />
      </div>
      <div className="flex gap-3 border-t border-zinc-100 px-5 py-3 dark:border-zinc-800">
        <Skeleton className="h-6 w-20" />
        <Skeleton className="h-6 w-16" />
        <Skeleton className="h-6 w-16" />
      </div>
    </div>
  );
}

/** 居中页面骨架外壳：顶栏占位 + 内容区，适配「返回 + Logo」式子页面布局。 */
export function PageSkeletonShell({ children, maxWidth = 'max-w-2xl' }: { children: React.ReactNode; maxWidth?: string }) {
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <header className="sticky top-0 z-30 border-b border-zinc-200 bg-white/80 backdrop-blur-sm dark:border-zinc-800 dark:bg-zinc-900/80">
        <div className={`mx-auto flex h-14 items-center gap-3 px-4 ${maxWidth}`}>
          <Skeleton className="h-4 w-20" />
          <Skeleton className="ml-auto h-5 w-24" />
        </div>
      </header>
      <main className={`mx-auto space-y-4 px-4 py-8 ${maxWidth}`}>{children}</main>
    </div>
  );
}
