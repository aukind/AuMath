import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 讲义 PDF 用无头 Chromium 渲染：这两个包含原生二进制/可执行路径，
  // 必须排除出 server bundle，由 Node 在运行时从 node_modules 直接 require。
  serverExternalPackages: ['@sparticuz/chromium', 'playwright-core'],
  experimental: {
    serverActions: {
      // 多套试卷 + 内嵌 SVG 几何图的 JSON 体积容易破 1MB 默认上限
      bodySizeLimit: '15mb',
    },
  },
};

export default nextConfig;
