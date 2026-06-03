// 拦截路由：从根级页面（首页 / 等）软导航至 /forum/[id] 时挂载此弹窗，
// 服务端预取主贴/评论/登录态后交给 PostDetailView 做共享元素 morph。
// 硬刷新 / 新标签直开该 URL 时不走拦截，由 app/forum/[id]/page.tsx 渲染全页。
import { notFound } from 'next/navigation';
import { getForumComments, getForumPost, getSessionForumUser } from '@/app/actions/forum';
import PostDetailView from '@/components/forum/PostDetailView';
import type { ForumPost } from '@/types/forum';

export default async function InterceptedForumModal({
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
    <PostDetailView
      postId={id}
      currentUser={currentUser}
      initialPost={post}
      initialComments={initialComments}
    />
  );
}
