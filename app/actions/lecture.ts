'use server';

// 讲义 PDF 生成的入口 Server Action（客户端调用）。
// 本文件只做编排：实际的「unified 渲染 HTML + 无头 Chromium 出 PDF」在 server-only 的 lib/lecture/render-pdf 里，
// 且**动态 import**，把重型的 playwright-core / @sparticuz/chromium 推迟到真正生成时再加载（页面初次渲染不付出代价）。
// 注：旧实现曾用 react-dom/server，在 Vercel 无头函数里因 react-dom 未被 trace 进 node_modules 而崩；已改用 unified 管线。

import type { LectureQuestion } from '@/lib/lecture/types';
import { createClient } from '@/lib/supabase/server';

export type GenerateLectureResult =
  | { ok: true; base64: string; filename: string }
  | { ok: false; error: string };

/** 单次讲义题量上限：正常一张卷 ~22 题，留足教师汇编余量；防止匿名超大 payload 拖垮无头 Chromium。 */
const MAX_LECTURE_QUESTIONS = 100;

export async function generateLecturePdf(
  questions: LectureQuestion[],
  includeAnswers: boolean,
  title?: string,
): Promise<GenerateLectureResult> {
  // 鉴权：每次调用都会在服务端启动无头 Chromium（Vercel 按 CPU 计费），必须限制为登录用户。
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: '请先登录后再生成讲义' };

  if (!questions || questions.length === 0) {
    return { ok: false, error: '未选择任何题目' };
  }
  if (questions.length > MAX_LECTURE_QUESTIONS) {
    return { ok: false, error: `单次最多生成 ${MAX_LECTURE_QUESTIONS} 题，请分批导出` };
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
