'use server';

// 讲义 PDF 生成的入口 Server Action（客户端调用）。
// 本文件只做编排：实际的「unified 渲染 HTML + 无头 Chromium 出 PDF」在 server-only 的 lib/lecture/render-pdf 里，
// 且**动态 import**，把重型的 playwright-core / @sparticuz/chromium 推迟到真正生成时再加载（页面初次渲染不付出代价）。
// 注：旧实现曾用 react-dom/server，在 Vercel 无头函数里因 react-dom 未被 trace 进 node_modules 而崩；已改用 unified 管线。

import type { LectureQuestion } from '@/lib/lecture/types';

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
