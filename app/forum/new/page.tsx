// 发帖页（RSC）。未登录则重定向到登录页并带回跳地址。
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Toaster } from 'sonner';
import { ChevronLeft } from 'lucide-react';
import PostComposer from '@/components/forum/PostComposer';
import { getSessionForumUser } from '@/app/actions/forum';

export const dynamic = 'force-dynamic';

export default async function NewForumPostPage() {
  const user = await getSessionForumUser();
  if (!user) redirect('/login?redirectTo=/forum/new');

  return (
    <main className="min-h-screen bg-zinc-50 py-8 dark:bg-zinc-950">
      <div className="mx-auto max-w-2xl px-3">
        <Link href="/" className="mb-3 inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">
          <ChevronLeft size={16} /> 返回社群
        </Link>
        <h1 className="mb-4 text-xl font-bold text-zinc-900 dark:text-zinc-50">发表新主题</h1>
        <PostComposer />
      </div>
      <Toaster richColors position="top-center" />
    </main>
  );
}
