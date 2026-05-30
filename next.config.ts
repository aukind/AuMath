import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // 多套试卷 + 内嵌 SVG 几何图的 JSON 体积容易破 1MB 默认上限
      bodySizeLimit: '15mb',
    },
  },
};

export default nextConfig;
