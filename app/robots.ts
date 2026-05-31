import type { MetadataRoute } from 'next';

const SITE = 'https://aumath.com';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // 个人/管理类页面不收录
      disallow: ['/admin', '/account', '/following', '/notifications', '/mybank', '/login', '/signup'],
    },
    sitemap: `${SITE}/sitemap.xml`,
  };
}
