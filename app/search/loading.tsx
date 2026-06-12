import { PageSkeletonShell, Skeleton, QuestionCardSkeleton } from '@/components/ui/Skeleton';

export default function SearchLoading() {
  return (
    <PageSkeletonShell maxWidth="max-w-3xl">
      <Skeleton className="h-11 w-full rounded-xl" />
      <div className="space-y-3 pt-2">
        <QuestionCardSkeleton />
        <QuestionCardSkeleton />
      </div>
    </PageSkeletonShell>
  );
}
