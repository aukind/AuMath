'use server';

// 讲义 PDF 生成的入口 Server Action（客户端调用）。
// 本文件只做编排：实际的 renderToStaticMarkup + 无头 Chromium 渲染在 server-only 的 lib/lecture/render-pdf 里，
// 且**动态 import**，以绕开 Next/Turbopack「server action 模块不得静态引入 react-dom/server」的限制。

import type { LectureQuestion } from '@/components/LectureDocument';

export type GenerateLectureResult =
  | { ok: true; base64: string; filename: string }
  | { ok: false; error: string };

export async function generateLecturePdf(
  questions: LectureQuestion[],
  includeAnswers: boolean,
  title?: string,
): Promise<GenerateLectureResult> {
  if (!questions || questions.length === 0) {
    return { ok: false, error: '未选择任何题目' };
  }
  try {
    const { renderLecturePdf } = await import('@/lib/lecture/render-pdf');
    const { base64, filename } = await renderLecturePdf(questions, includeAnswers, title);
    return { ok: true, base64, filename };
  } catch (err) {
    console.error('[generateLecturePdf]', err);
    return { ok: false, error: err instanceof Error ? err.message : 'PDF 生成失败' };
  }
}
