// 论坛详情页（RSC）。服务端预取主贴/评论并取登录态，首屏直出、利于 SEO。
import { notFound } from 'next/navigation';
import { Toaster } from 'sonner';
import ForumThread from '@/components/forum/ForumThread';
import {
  getForumComments,
  getForumPost,
  getSessionForumUser,
} from '@/app/actions/forum';
import type { ForumPost } from '@/types/forum';

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
    <main className="min-h-screen bg-zinc-50 py-8 dark:bg-zinc-950">
      <ForumThread
        postId={id}
        currentUser={currentUser}
        initialPost={post}
        initialComments={initialComments}
      />
      <Toaster richColors position="top-center" />
    </main>
  );
}
