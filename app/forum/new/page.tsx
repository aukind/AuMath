// 发帖页（RSC）。未登录则重定向到登录页并带回跳地址。
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Toaster } from 'sonner';
import { ChevronLeft } from 'lucide-react';
import PostComposer from '@/components/forum/PostComposer';
import { getSessionForumUser } from '@/app/actions/forum';

export const dynamic = 'force-dynamic';

export default async function NewForumPostPage({
  searchParams,
}: {
  searchParams: Promise<{ tag?: string }>;
}) {
  const user = await getSessionForumUser();
  if (!user) redirect('/login?redirectTo=/forum/new');

  const { tag } = await searchParams;

  return (
    <main className="min-h-screen bg-zinc-50 py-8 dark:bg-zinc-950">
      <div className="mx-auto max-w-2xl px-3">
        <Link href="/" className="mb-5 inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">
          <ChevronLeft size={16} /> 返回社区
        </Link>
        {/* 传入 tag */}
        <PostComposer currentUser={user} initialTag={tag} />
      </div>
      <Toaster richColors position="top-center" />
    </main>
  );
}