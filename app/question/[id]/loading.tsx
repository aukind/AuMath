import { PageSkeletonShell, QuestionCardSkeleton } from '@/components/ui/Skeleton';

export default function QuestionLoading() {
  return (
    <PageSkeletonShell>
      <QuestionCardSkeleton />
    </PageSkeletonShell>
  );
}
