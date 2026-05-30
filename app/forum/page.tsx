// 论坛首页（RSC）：帖子列表，置顶优先。作为社区入口。
import Link from 'next/link';
import { Eye } from 'lucide-react';
import { getForumPosts } from '@/app/actions/forum';

export const dynamic = 'force-dynamic';

export default async function ForumIndexPage() {
  const posts = await getForumPosts().catch(() => []);

  return (
    <main className="min-h-screen bg-zinc-50 py-8 dark:bg-zinc-950">
      <div className="mx-auto max-w-2xl px-3">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">社区讨论区</h1>
          <Link
            href="/forum/new"
            className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
          >
            发帖
          </Link>
        </div>

        {posts.length === 0 ? (
          <p className="rounded-lg border border-dashed border-zinc-300 py-12 text-center text-sm text-zinc-400 dark:border-zinc-700">
            还没有帖子。
          </p>
        ) : (
          <ul className="space-y-2">
            {posts.map((post) => (
              <li key={post.id}>
                <Link
                  href={`/forum/${post.id}`}
                  className="block rounded-lg border border-zinc-200 bg-white px-4 py-3 transition-colors hover:border-blue-300 dark:border-zinc-800 dark:bg-zinc-900"
                >
                  <h2 className="font-medium text-zinc-900 dark:text-zinc-100">{post.title}</h2>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                    <span>{post.author.username}</span>
                    <span>· {new Date(post.createdAt).toLocaleDateString('zh-CN')}</span>
                    <span className="inline-flex items-center gap-1">
                      <Eye className="h-3.5 w-3.5" />
                      {post.viewCount}
                    </span>
                    {post.tags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full bg-blue-50 px-1.5 py-0.5 text-blue-600 dark:bg-blue-950 dark:text-blue-300"
                      >
                        #{tag}
                      </span>
                    ))}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
