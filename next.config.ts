import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 讲义 PDF 用无头 Chromium 渲染：这两个包含原生二进制/可执行路径，
  // 必须排除出 server bundle，由 Node 在运行时从 node_modules 直接 require。
  // node-tikzjax：录题作图引擎（WASM TeX），运行时用 fs 读自带的 core.dump / wasm /
  // BaKoMa 字体，不能被打包器内联，须留在 node_modules 由运行时 require。
  serverExternalPackages: ['@sparticuz/chromium', 'playwright-core', 'node-tikzjax'],
  // playwright-core 用 `require(path.join(packageRoot, "browsers.json"))` 动态拼路径加载该数据文件，
  // Vercel 的 output file tracing 做静态分析时看不到这个运行时算出来的路径，于是 browsers.json 不会被打进
  // 函数，线上报「Cannot find module '/var/task/node_modules/playwright-core/browsers.json'」。这里强制把整个
  // playwright-core include 进调用 generateLecturePdf 的路由（首页 `/`），兜住所有动态加载的数据资源。
  // 同理 @sparticuz/chromium：executablePath() 在运行时 `path.join(__dirname, "../bin")` 解出无头浏览器二进制
  // （bin/*.br，约 70MB），静态分析同样看不到这个动态路径，于是 bin/ 不会被 trace 进函数，线上(aumath.com)报
  // 「The input directory "/var/task/node_modules/@sparticuz/chromium/bin" does not exist」（本地 node_modules
  // 里 bin/ 现成所以只在线上炸）。强制把整个包 include 进 `/`，把 bin/*.br 一并打进 Lambda。
  // 同理 node-tikzjax 的 dump/wasm/*.ttf 经动态路径 fs 读取，显式纳入用到它的路由（/contribute）。
  outputFileTracingIncludes: {
    '/': [
      './node_modules/playwright-core/**/*',
      './node_modules/@sparticuz/chromium/**/*',
    ],
    '/contribute': ['./node_modules/node-tikzjax/tex/**/*', './node_modules/node-tikzjax/css/**/*'],
  },
  experimental: {
    serverActions: {
      // 多套试卷 + 内嵌 SVG 几何图的 JSON 体积容易破 1MB 默认上限
      bodySizeLimit: '15mb',
    },
  },
};

export default nextConfig;
