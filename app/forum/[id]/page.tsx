// 论坛详情页（RSC）。服务端预取主贴/评论并取登录态，首屏直出、利于 SEO。
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Toaster } from 'sonner';
import { ChevronLeft, Infinity as InfinityIcon } from 'lucide-react';
import ForumThread from '@/components/forum/ForumThread';
import ThemeToggle from '@/components/ThemeToggle';
import {
  getForumComments,
  getForumPost,
  getSessionForumUser,
} from '@/app/actions/forum';
import type { ForumPost } from '@/types/forum';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const post = await getForumPost(id).catch(() => null as ForumPost | null);
  if (!post) return { title: '帖子 · AuMath' };
  // 正文是 Lexical JSON，剥离标签/符号后截断作描述
  const plain = post.content
    .replace(/<[^>]+>/g, ' ')
    .replace(/[{}[\]"]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const description = plain.slice(0, 120) || `${post.author.username} 在 AuMath 社区发布的讨论`;
  return {
    title: `${post.title} · AuMath 社区`,
    description,
    openGraph: { title: post.title, description, type: 'article' },
  };
}

export default async function ForumPostPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [currentUser, post] = await Promise.all([
    getSessionForumUser(),
    getForumPost(id).catch(() => null as ForumPost | null),
  ]);

  if (!post) notFound();

  const initialComments = await getForumComments(id).catch(() => []);

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      {/* 统一顶栏：始终可返回社区 / 回首页 */}
      <header className="sticky top-0 z-30 border-b border-zinc-200 bg-white/80 backdrop-blur-sm dark:border-zinc-800 dark:bg-zinc-900/80">
        <div className="mx-auto flex h-14 max-w-2xl items-center gap-3 px-4">
          <Link href="/" className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">
            <ChevronLeft size={16} /> 返回社区
          </Link>
          <Link href="/" className="ml-auto flex items-center gap-1.5">
            <InfinityIcon className="h-5 w-5 stroke-[1.5] text-indigo-600 dark:text-indigo-400" />
            <span className="bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-sm font-extrabold tracking-tight text-transparent dark:from-indigo-400 dark:to-purple-400">
              AuMath
            </span>
          </Link>
          <ThemeToggle />
        </div>
      </header>

      <main className="py-8">
        <ForumThread
          postId={id}
          currentUser={currentUser}
          initialPost={post}
          initialComments={initialComments}
        />
        <Toaster richColors position="top-center" />
      </main>
    </div>
  );
}
