import 'server-only';

// 讲义 PDF 的服务端渲染。
//
// 关键修复：不再用 react-dom/server（renderToStaticMarkup）——它在 Vercel 无头函数里解析不到 react-dom，
// 报「Cannot find package 'react-dom'」。改为用 unified 管线（lib/lecture/md-to-html）把每道题的题干/选项/
// 解析渲染成 HTML 字符串，再手工拼成讲义文档。这条管线就是 MathRenderer SSR 已跑通的同一套，确定可用。
//
// 流程：buildBody()（mdToHtml 出公式 HTML）→ 套打印 CSS + KaTeX CSS(CDN) + 中文衬线字体(Google Fonts，
// 规避无头 Linux 缺 CJK 字体) → playwright-core 驱动 Chromium(dev 用系统 Chrome / prod 用 @sparticuz/chromium) → page.pdf()。

import {
  normalizeOptions,
  isBlankOption,
  stripInlineOptionTail,
  withAnswerBlank,
} from '@/lib/questions/content';
import { mdToHtml } from '@/lib/lecture/md-to-html';
import { LECTURE_PRINT_STYLE } from '@/lib/lecture/print-style';
import type { Difficulty } from '@/types/database';
import type { LectureQuestion } from '@/lib/lecture/types';

// 与 package.json 的 katex 版本保持一致；jsDelivr 镜像 npm，按确切版本取 CSS+字体，避免字形漂移。
const KATEX_VERSION = '0.17.0';

const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  1: '基础',
  2: '进阶',
  3: '中等',
  4: '拔高',
  5: '竞赛',
};

/** 仅用于纯文本字段（标题、来源、知识点名）的 HTML 转义；题目正文走 mdToHtml 自带的 sanitize。 */
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** 把 mdToHtml 的输出包进 .prose（对齐原 MathRenderer 的外层结构，让 print-style 的 .prose 规则生效）。 */
function prose(content: string): string {
  return `<div class="prose">${mdToHtml(content)}</div>`;
}

function buildBody(
  questions: LectureQuestion[],
  includeAnswers: boolean,
  title: string | undefined,
  dateLabel: string,
): string {
  const header =
    `<header class="lec-header">` +
    `<h1>${esc(title || '数学讲义')}</h1>` +
    `<p>共 ${questions.length} 道题 &nbsp;·&nbsp; ${esc(dateLabel)}${includeAnswers ? ' · 含答案解析' : ''}</p>` +
    `</header>`;

  const items = questions
    .map((q, index) => {
      // 与 QuestionCard 完全一致的选项/题干处理（共用 content.ts）。
      const options = normalizeOptions(q.options);
      const visible = options.filter(o => !isBlankOption(o));
      const isChoice = options.length >= 2;
      const stem = isChoice ? withAnswerBlank(stripInlineOptionTail(q.content, true)) : q.content;
      const solution = [q.answer, q.analysis || q.solution].filter(Boolean).join('\n\n---\n\n');

      const meta =
        `<div class="lec-meta">` +
        `<span class="lec-num">第 ${index + 1} 题</span>` +
        (q.topicName ? `<span>${esc(q.topicName)}</span>` : '') +
        (q.source ? `<span>${esc(q.source)}</span>` : '') +
        (q.year ? `<span>${q.year} 年</span>` : '') +
        `<span>${DIFFICULTY_LABELS[q.difficulty]}</span>` +
        `</div>`;

      const stemHtml = `<div class="lec-stem">${prose(stem)}</div>`;

      // 选项网格 —— 「PDF 选项丢失」的修复点：空壳选项（图形选项题）被 isBlankOption 过滤后不渲染空网格。
      const optsHtml =
        visible.length > 0
          ? `<div class="lec-options ${visible.length <= 2 ? 'lec-options-1' : 'lec-options-2'}">` +
            visible.map(opt => `<div class="lec-opt">${prose(opt)}</div>`).join('') +
            `</div>`
          : '';

      // 教师版：题后附答案/解析；练习卷：留空白解答区。
      const tail = includeAnswers
        ? solution
          ? `<div class="lec-answer"><div class="lec-answer-label">答案与解析</div>${prose(solution)}</div>`
          : ''
        : `<div class="lec-blank"></div>`;

      return `<section class="lec-q">${meta}${stemHtml}${optsHtml}${tail}</section>`;
    })
    .join('');

  return `<div class="lecture">${header}${items}</div>`;
}

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

  const body = buildBody(questions, includeAnswers, title, dateLabel);

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
