import { PageSkeletonShell, Skeleton } from '@/components/ui/Skeleton';

export default function ProfileLoading() {
  return (
    <PageSkeletonShell maxWidth="max-w-3xl">
      <div className="flex items-center gap-4">
        <Skeleton className="h-16 w-16 rounded-full" />
        <div className="space-y-2">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-3 w-20" />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3 pt-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
            <Skeleton className="h-4 w-12" />
            <Skeleton className="mt-2 h-6 w-10" />
          </div>
        ))}
      </div>
    </PageSkeletonShell>
  );
}
