import { PageSkeletonShell, Skeleton } from '@/components/ui/Skeleton';

export default function NotificationsLoading() {
  return (
    <PageSkeletonShell>
      <Skeleton className="h-6 w-24" />
      <div className="space-y-2 pt-2">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
            <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-3/5" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
        ))}
      </div>
    </PageSkeletonShell>
  );
}
