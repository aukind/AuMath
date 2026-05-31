import type { MetadataRoute } from 'next';
import { getForumPosts } from '@/app/actions/forum';
import { getPapers } from '@/app/actions/questions';

const SITE = 'https://aumath.com';

export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes: MetadataRoute.Sitemap = ['', '/daily', '/search'].map((p) => ({
    url: `${SITE}${p}`,
    changeFrequency: 'daily',
    priority: p === '' ? 1 : 0.7,
  }));

  // 论坛帖子 + 试卷（题库浏览以 query 参数驱动，用试卷作可索引入口）
  const [posts, papers] = await Promise.all([
    getForumPosts().catch(() => []),
    getPapers().catch(() => []),
  ]);

  const postRoutes: MetadataRoute.Sitemap = posts.map((p) => ({
    url: `${SITE}/forum/${p.id}`,
    lastModified: p.createdAt ? new Date(p.createdAt) : undefined,
    changeFrequency: 'weekly',
    priority: 0.6,
  }));

  const paperRoutes: MetadataRoute.Sitemap = papers.map((p) => ({
    url: `${SITE}/?paper=${p.id}`,
    changeFrequency: 'monthly',
    priority: 0.5,
  }));

  return [...staticRoutes, ...postRoutes, ...paperRoutes];
}
