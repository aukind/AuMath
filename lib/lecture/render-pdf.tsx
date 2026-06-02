import 'server-only';

// 讲义 PDF 的服务端渲染 —— 把这部分从 'use server' action 里拆出来，原因：
// Next/Turbopack 禁止「会被客户端引用的 server action 模块」静态 import react-dom/server。
// 故 action 只做编排、动态 import 本模块；本模块是纯 server-only，可放心用 renderToStaticMarkup + 无头 Chromium。
//
// 流程：renderToStaticMarkup(<LectureDocument/>) → 套打印 CSS + KaTeX CSS(CDN) + 中文衬线字体(Google Fonts，
// 规避无头 Linux 缺 CJK 字体) → playwright-core 驱动 Chromium(dev 用系统 Chrome / prod 用 @sparticuz/chromium) → page.pdf()。

import LectureDocument, { type LectureQuestion } from '@/components/LectureDocument';
import { LECTURE_PRINT_STYLE } from '@/lib/lecture/print-style';

// 与 package.json 的 katex 版本保持一致；jsDelivr 镜像 npm，按确切版本取 CSS+字体，避免字形漂移。
const KATEX_VERSION = '0.17.0';

export async function renderLecturePdf(
  questions: LectureQuestion[],
  includeAnswers: boolean,
  title?: string,
): Promise<{ base64: string; filename: string }> {
  const dateLabel = new Date().toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  // 动态 import + turbopackIgnore：Next/Turbopack 禁止在 RSC 图里静态引入 react-dom/server；
  // 本模块是 server-only、只在 Node 运行，运行时从 node_modules 解析 react-dom/server 即可。
  const { renderToStaticMarkup } = await import(/* turbopackIgnore: true */ 'react-dom/server');
  const body = renderToStaticMarkup(
    <LectureDocument
      questions={questions}
      includeAnswers={includeAnswers}
      title={title}
      dateLabel={dateLabel}
    />,
  );

  const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@400;700&display=swap" />
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@${KATEX_VERSION}/dist/katex.min.css" />
<style>${LECTURE_PRINT_STYLE}</style>
</head>
<body>${body}</body>
</html>`;

  let browser: import('playwright-core').Browser | null = null;
  try {
    browser = await launchBrowser();
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle' });
    // 等 KaTeX / 中文字体真正就绪，避免出 PDF 时字体未加载导致 tofu 方块或公式错位。
    await page.evaluate(() => document.fonts.ready);

    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '18mm', right: '16mm', bottom: '18mm', left: '16mm' },
    });

    const safe = (title || dateLabel).replace(/[\\/:*?"<>|]/g, '').trim().slice(0, 40) || '讲义';
    const filename = `讲义_${safe}_${questions.length}题.pdf`;

    return { base64: Buffer.from(pdf).toString('base64'), filename };
  } finally {
    await browser?.close().catch(() => {});
  }
}

/** dev：系统 Chrome（channel）；prod：@sparticuz/chromium 自带的无头二进制。 */
async function launchBrowser() {
  // playwright-core 是 CJS：serverExternalPackages 下由 Node 在运行时 require，
  // 而 Node 的具名导出探测取不到 `chromium`，故回退到 default 再取，兼容 bundled / external 两种情形。
  const mod = (await import('playwright-core')) as Record<string, unknown> & {
    chromium?: typeof import('playwright-core').chromium;
    default?: { chromium: typeof import('playwright-core').chromium };
  };
  const playwright = mod.chromium ?? mod.default!.chromium;

  if (process.env.NODE_ENV !== 'production') {
    return playwright.launch({ channel: 'chrome', headless: true });
  }

  const chromium = (await import('@sparticuz/chromium')).default;
  chromium.setGraphicsMode = false; // PDF 不需要 GPU/WebGL，关掉更省内存
  return playwright.launch({
    args: chromium.args,
    executablePath: await chromium.executablePath(),
    headless: true,
  });
}
