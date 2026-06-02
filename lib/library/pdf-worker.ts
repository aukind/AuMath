'use client';

// 资源大厅共享的 PDF.js 配置（阅读器 PdfViewerModal 与封面生成 generateCover 共用）。
// ⚠️ 仅可在客户端运行路径里被加载：
//   · PdfViewerModal 经 dynamic(ssr:false) 懒载 → 其静态 import 此模块 OK；
//   · generateCover 经运行时 import() 动态加载 → 不会在 SSR 阶段求值。
// 用 pdfjs.version 拼 CDN worker，保证 API 与 Worker 版本永远一致。

import { pdfjs } from 'react-pdf';

const PDF_CDN = `https://unpkg.com/pdfjs-dist@${pdfjs.version}`;

pdfjs.GlobalWorkerOptions.workerSrc = `${PDF_CDN}/build/pdf.worker.min.mjs`;

/** <Document options> —— 大文件友好：禁后台全量预取、保留 Range 流式、64KB 分块。 */
export const PDF_OPTIONS = {
  cMapUrl: `${PDF_CDN}/cmaps/`,
  standardFontDataUrl: `${PDF_CDN}/standard_fonts/`,
  disableAutoFetch: true,
  disableStream: false,
  rangeChunkSize: 1 << 16,
} as const;

export { pdfjs };
