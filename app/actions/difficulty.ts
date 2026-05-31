'use server';

// 众包难度评分：任何登录用户可对每题打 1–5 星，全站展示平均星级。
// 明细存 question_difficulty_ratings，questions 上由触发器维护 rating_count/rating_sum/rating_avg（迁移 014）。

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

export interface RateResult {
  ok: boolean;
  /** 评分后该题的最新平均分（保留两位） */
  avg?: number;
  /** 评分后该题的评分人数 */
  count?: number;
  /** 当前用户本次的评分 */
  myRating?: number;
  error?: string;
}

/**
 * 提交 / 修改当前用户对某题的难度评分（1–5）。需登录。
 * upsert 后回读 questions 的聚合列，返回最新平均分与人数，供前端乐观更新。
 */
export async function rateDifficulty(questionId: string, rating: number): Promise<RateResult> {
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return { ok: false, error: '评分必须是 1–5 的整数' };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: '请先登录再评分' };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any;

  const { error: upErr } = await sb
    .from('question_difficulty_ratings')
    .upsert(
      { question_id: questionId, user_id: user.id, rating, updated_at: new Date().toISOString() },
      { onConflict: 'question_id,user_id' },
    );
  if (upErr) {
    console.error('[rateDifficulty]', upErr.message);
    return { ok: false, error: '评分失败，请稍后再试' };
  }

  // 触发器已更新聚合列，回读最新值（实时反映本次评分）。
  const { data: q } = await sb
    .from('questions')
    .select('rating_count, rating_sum, rating_avg')
    .eq('id', questionId)
    .single();

  const count = (q?.rating_count as number) ?? 0;
  const avg = count > 0
    ? Number(q?.rating_avg ?? (q?.rating_sum as number) / count)
    : 0;

  revalidatePath('/');
  return { ok: true, avg, count, myRating: rating };
}

/**
 * 当前用户对所有题目的评分映射 questionId → rating（1–5）。未登录返回空。
 * 与 getFavoritedQuestionIds 同模式，供首页一次性取出、按题分发给卡片。
 */
export async function getMyDifficultyRatings(): Promise<Record<string, number>> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return {};

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('question_difficulty_ratings')
    .select('question_id, rating')
    .eq('user_id', user.id);

  if (error) {
    // 迁移 014 未跑时静默降级为空（不影响浏览）
    return {};
  }

  const map: Record<string, number> = {};
  for (const r of (data ?? []) as { question_id: string; rating: number }[]) {
    map[r.question_id] = r.rating;
  }
  return map;
}
