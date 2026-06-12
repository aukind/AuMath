import { Skeleton } from '@/components/ui/Skeleton';

export default function LibraryLoading() {
  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-8">
      <Skeleton className="h-7 w-32" />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="aspect-[3/4] w-full rounded-xl" />
            <Skeleton className="h-4 w-4/5" />
            <Skeleton className="h-3 w-3/5" />
          </div>
        ))}
      </div>
    </div>
  );
}
