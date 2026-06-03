'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { createQuestion } from '@/app/actions/questions';
import type { QuestionWithTopics, WorkspaceType, WorkspaceCounts, Difficulty } from '@/types/database';

// ── Toggle favorite ───────────────────────────────────────────────────────────

export async function toggleFavorite(
  questionId: string,
): Promise<{ success: boolean; favorited: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, favorited: false, error: '未登录' };

  const sb = supabase as any;
  const { data: existing } = await sb
    .from('user_favorites')
    .select('user_id')
    .eq('user_id', user.id)
    .eq('question_id', questionId)
    .maybeSingle();

  if (existing) {
    const { error } = await sb
      .from('user_favorites')
      .delete()
      .eq('user_id', user.id)
      .eq('question_id', questionId);
    if (error) return { success: false, favorited: true, error: error.message };
    return { success: true, favorited: false };
  } else {
    const { error } = await sb
      .from('user_favorites')
      .insert({ user_id: user.id, question_id: questionId });
    if (error) return { success: false, favorited: false, error: error.message };
    return { success: true, favorited: true };
  }
}

// ── Mark error ────────────────────────────────────────────────────────────────

export async function markError(
  questionId: string,
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: '未登录' };

  const sb = supabase as any;
  const { data: existing } = await sb
    .from('user_errors')
    .select('wrong_count')
    .eq('user_id', user.id)
    .eq('question_id', questionId)
    .maybeSingle();

  if (existing) {
    const { error } = await sb
      .from('user_errors')
      .update({ wrong_count: existing.wrong_count + 1, updated_at: new Date().toISOString() })
      .eq('user_id', user.id)
      .eq('question_id', questionId);
    if (error) return { success: false, error: error.message };
  } else {
    const { error } = await sb
      .from('user_errors')
      .insert({ user_id: user.id, question_id: questionId, wrong_count: 1 });
    if (error) return { success: false, error: error.message };
  }

  return { success: true };
}

// ── Remove from error book ────────────────────────────────────────────────────

export async function removeError(
  questionId: string,
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: '未登录' };

  const { error } = await (supabase as any)
    .from('user_errors')
    .delete()
    .eq('user_id', user.id)
    .eq('question_id', questionId);

  if (error) return { success: false, error: error.message };

  revalidatePath('/');
  return { success: true };
}

// ── Get errored question IDs ──────────────────────────────────────────────────

export async function getErroredQuestionIds(): Promise<string[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data } = await (supabase as any)
    .from('user_errors')
    .select('question_id')
    .eq('user_id', user.id);
  return (data ?? []).map((r: { question_id: string }) => r.question_id);
}

// ── Record view (fire-and-forget) ─────────────────────────────────────────────

export async function recordView(questionId: string): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  await (supabase as any)
    .from('user_history')
    .upsert(
      { user_id: user.id, question_id: questionId, viewed_at: new Date().toISOString() },
      { onConflict: 'user_id,question_id' },
    );
}

// ── Record attempt (self-grade) ───────────────────────────────────────────────
// 知识星图「已掌握(绿)」的唯一数据来源：做对过(correct_count>0) 且不在错题本。
// 滚动累加每用户每题一行（迁移 021）。
export async function recordAttempt(
  questionId: string,
  isCorrect: boolean,
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: '未登录' };

  const sb = supabase as any;
  const { data: existing } = await sb
    .from('user_question_attempts')
    .select('attempt_count, correct_count')
    .eq('user_id', user.id)
    .eq('question_id', questionId)
    .maybeSingle();

  const row = {
    user_id: user.id,
    question_id: questionId,
    attempt_count: (existing?.attempt_count ?? 0) + 1,
    correct_count: (existing?.correct_count ?? 0) + (isCorrect ? 1 : 0),
    last_correct: isCorrect,
    updated_at: new Date().toISOString(),
  };

  const { error } = await sb
    .from('user_question_attempts')
    .upsert(row, { onConflict: 'user_id,question_id' });
  if (error) return { success: false, error: error.message };

  revalidatePath('/explore');
  return { success: true };
}

// ── Get mastered question IDs ─────────────────────────────────────────────────
// 做对过的题（correct_count>0）。星图染色时再与错题本做差集（错题优先级更高）。
export async function getMasteredQuestionIds(): Promise<string[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data } = await (supabase as any)
    .from('user_question_attempts')
    .select('question_id')
    .eq('user_id', user.id)
    .gt('correct_count', 0);
  return (data ?? []).map((r: { question_id: string }) => r.question_id);
}

// ── Get workspace counts ──────────────────────────────────────────────────────

export async function getWorkspaceCounts(): Promise<WorkspaceCounts> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { favorites: 0, errors: 0, history: 0 };

  const sb = supabase as any;
  const [favRes, errRes, histRes] = await Promise.all([
    sb.from('user_favorites').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
    sb.from('user_errors').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
    sb.from('user_history').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
  ]);

  return {
    favorites: favRes.count ?? 0,
    errors:    errRes.count ?? 0,
    history:   histRes.count ?? 0,
  };
}

// ── Get workspace questions ───────────────────────────────────────────────────

export async function getWorkspaceQuestions(type: WorkspaceType): Promise<QuestionWithTopics[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const sb = supabase as any;
  const table    = type === 'favorites' ? 'user_favorites' : type === 'errors' ? 'user_errors' : 'user_history';
  const orderCol = type === 'history' ? 'viewed_at' : 'created_at';

  const { data: rows } = await sb
    .from(table)
    .select('question_id')
    .eq('user_id', user.id)
    .order(orderCol, { ascending: false })
    .limit(100);

  if (!rows?.length) return [];

  const ids: string[] = rows.map((r: { question_id: string }) => r.question_id);

  const { data: questions } = await supabase
    .from('questions')
    .select('*, question_topic_relations(question_id, topic_id, topics(*))')
    .eq('status', 'published')
    .in('id', ids);

  // Preserve workspace ordering (DB IN clause doesn't guarantee order)
  const qMap = new Map(
    ((questions ?? []) as QuestionWithTopics[]).map(q => [q.id, q]),
  );
  return ids.map(id => qMap.get(id)).filter(Boolean) as QuestionWithTopics[];
}

// ── 自己录题：建一道私有题并直接归入收藏 / 错题 ─────────────────────────────────
// 复用 createQuestion（普通用户建的题自动 is_public=false、created_by=本人），
// 建好后插入对应工作区表，立即出现在「我的题库」对应分组里。

export async function createPersonalQuestion(
  target: 'favorites' | 'errors',
  input: { content: string; answer: string; analysis: string; difficulty: Difficulty },
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: '请先登录' };

  if (!input.content.trim() || !input.answer.trim()) {
    return { success: false, error: '题目内容和答案不能为空' };
  }

  const res = await createQuestion({
    content:       input.content,
    answer:        input.answer,
    analysis:      input.analysis,
    question_type: 'calculation',
    difficulty:    input.difficulty,
    year:          null,
    source:        null,
    topic_ids:     [],
    status:        'published',
  });
  if (!res.success || !res.id) return { success: false, error: res.error ?? '创建失败' };

  const sb = supabase as any;
  const row =
    target === 'favorites'
      ? { user_id: user.id, question_id: res.id }
      : { user_id: user.id, question_id: res.id, wrong_count: 1 };
  const { error } = await sb
    .from(target === 'favorites' ? 'user_favorites' : 'user_errors')
    .insert(row);
  if (error) return { success: false, error: error.message };

  revalidatePath('/');
  return { success: true };
}

// ── Get favorited question IDs ────────────────────────────────────────────────

export async function getFavoritedQuestionIds(): Promise<string[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data } = await (supabase as any)
    .from('user_favorites')
    .select('question_id')
    .eq('user_id', user.id);
  return (data ?? []).map((r: { question_id: string }) => r.question_id);
}
