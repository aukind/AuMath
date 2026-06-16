'use server';

// 解题工作台（/solve/[id]）的两个 Server Action：
//   - getProgressiveHint：卡住时取一条不泄底的渐进提示（AI 端点需登录）。
//   - saveSolvingSession：一次解题落一条 solving_sessions 流水（迁移 031）。
//
// 返回均为判别联合，绝不 throw（生产脱敏约定，见 project_interaction_conventions）。
// 迁移 031 未 Run 时 saveSolvingSession 静默失败（功能 inert，不崩主流程）。

import { createClient } from '@/lib/supabase/server';
import { generateProgressiveHint, type HintLevel } from '@/lib/solve/hint';

export type HintResult =
  | { ok: true; hint: string }
  | { ok: false; error: string };

/**
 * 渐进提示：服务端读取题目完整解答用于「锚定」，仅把不泄底的提示文本回给前端。
 * level 1..3 逐级递进；studentContext 为「我卡在哪」自由文本（可选）。
 */
export async function getProgressiveHint(
  questionId: string,
  level: HintLevel,
  studentContext?: string,
): Promise<HintResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: '请先登录后再获取提示' };

  const lvl = (Math.min(3, Math.max(1, Math.round(level))) as HintLevel);

  // RLS 下读已发布/公开题；analysis/answer/solution 仅用于服务端锚定，不外泄。
  const { data: q, error } = await supabase
    .from('questions')
    .select('content, analysis, answer, solution')
    .eq('id', questionId)
    .maybeSingle();
  if (error || !q) return { ok: false, error: '题目不存在或无权访问' };

  if (!process.env.GEMINI_API_KEY) {
    return { ok: false, error: '提示服务暂未配置（GEMINI_API_KEY 未设置）' };
  }

  const hint = await generateProgressiveHint({
    content: q.content,
    analysis: q.analysis,
    answer: q.answer,
    solution: q.solution,
    level: lvl,
    studentContext: studentContext?.slice(0, 800),
  });
  if (!hint) return { ok: false, error: '提示生成失败，请稍后再试' };

  return { ok: true, hint };
}

export type SaveSessionResult =
  | { ok: true }
  | { ok: false; error: string };

export interface SolvingSessionInput {
  questionId: string;
  maxHintLevel: number;   // 0..3
  hintsUsed: number;
  durationSec: number;
  outcome: 'solved' | 'hinted' | 'stuck' | 'gave_up';
  note?: string;
}

/**
 * 落一条解题会话流水。迁移 031 未 Run 时返回 ok:false（前端忽略即可，不阻断解题）。
 */
export async function saveSolvingSession(
  input: SolvingSessionInput,
): Promise<SaveSessionResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: '请先登录' };

  const { error } = await supabase.from('solving_sessions').insert({
    user_id: user.id,
    question_id: input.questionId,
    max_hint_level: Math.min(3, Math.max(0, Math.round(input.maxHintLevel))),
    hints_used: Math.max(0, Math.round(input.hintsUsed)),
    duration_sec: Math.max(0, Math.round(input.durationSec)),
    outcome: input.outcome,
    note: input.note?.slice(0, 1000) || null,
  });
  if (error) {
    // 迁移未 Run（表不存在）或 RLS 拒绝：记一行警告，功能 inert，不影响解题。
    console.warn('[saveSolvingSession] 落库失败（已忽略）：', error.message);
    return { ok: false, error: '解题记录保存失败（可能迁移 031 未执行）' };
  }
  return { ok: true };
}
