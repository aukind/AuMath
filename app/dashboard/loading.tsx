// 控制台加载骨架：导航到 /dashboard 时 Next 立即渲染此骨架，
// getUserProfile 的查询链在后台进行 —— 消除"点进去要白等"的卡顿感。
import DashboardLayout from '@/components/dashboard/DashboardLayout';

function Bar({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-zinc-200 dark:bg-zinc-800 ${className}`} />;
}

export default function DashboardLoading() {
  return (
    <DashboardLayout>
      <header className="mb-8">
        <Bar className="h-6 w-48" />
        <Bar className="mt-2 h-4 w-64" />
      </header>

      {/* 统计概览骨架 */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
            <Bar className="h-4 w-20" />
            <Bar className="mt-3 h-7 w-16" />
          </div>
        ))}
      </div>

      {/* 动态时间线骨架 */}
      <div className="mt-10 space-y-3">
        <Bar className="h-5 w-24" />
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-3 rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
            <Bar className="h-9 w-9 shrink-0 rounded-full" />
            <div className="flex-1">
              <Bar className="h-4 w-3/5" />
              <Bar className="mt-2 h-3 w-2/5" />
            </div>
          </div>
        ))}
      </div>
    </DashboardLayout>
  );
}
