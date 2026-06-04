import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 讲义 PDF 用无头 Chromium 渲染：这两个包含原生二进制/可执行路径，
  // 必须排除出 server bundle，由 Node 在运行时从 node_modules 直接 require。
  serverExternalPackages: ['@sparticuz/chromium', 'playwright-core'],
  // playwright-core 用 `require(path.join(packageRoot, "browsers.json"))` 动态拼路径加载该数据文件，
  // Vercel 的 output file tracing 做静态分析时看不到这个运行时算出来的路径，于是 browsers.json 不会被打进
  // 函数，线上报「Cannot find module '/var/task/node_modules/playwright-core/browsers.json'」。这里强制把整个
  // playwright-core include 进调用 generateLecturePdf 的路由（首页 `/`），兜住所有动态加载的数据资源。
  outputFileTracingIncludes: {
    '/': ['./node_modules/playwright-core/**/*'],
  },
  experimental: {
    serverActions: {
      // 多套试卷 + 内嵌 SVG 几何图的 JSON 体积容易破 1MB 默认上限
      bodySizeLimit: '15mb',
    },
  },
};

export default nextConfig;
