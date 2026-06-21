import type { MetadataRoute } from 'next';

// PWA 清单：让 aumath.com 可「添加到主屏幕」装成全屏 App。
// Next 自动产出 /manifest.webmanifest，并由 layout 的 metadata.manifest 引用。
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'AuMath · 高阶数学题库与社区',
    short_name: 'AuMath',
    description: '面向高考真题、模拟题与圆锥曲线、导数等高难拔高训练的数学题库与学习社区。',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'any',
    background_color: '#ffffff',
    theme_color: '#4f46e5',
    lang: 'zh-CN',
    icons: [
      { src: '/pwa-icon/192', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/pwa-icon/512', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/pwa-icon/512', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
