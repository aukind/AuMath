'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import type { QuestionWithTopics, TopicWithChildren, TopicRow, QuestionType, Difficulty, QuestionStatus } from '@/types/database';

// ── 录题 ─────────────────────────────────────────────────────

export interface CreateQuestionInput {
  content: string;
  answer: string;
  analysis: string;
  question_type: QuestionType;
  difficulty: Difficulty;
  year: number | null;
  source: string | null;
  topic_ids: string[];
  status: QuestionStatus;
}

export async function createQuestion(
  input: CreateQuestionInput,
): Promise<{ success: boolean; error?: string; id?: string }> {
  let supabase;
  try {
    supabase = createAdminClient();
  } catch {
    return { success: false, error: '服务端配置错误：缺少 SUPABASE_SERVICE_ROLE_KEY' };
  }

  const { data, error } = await supabase
    .from('questions')
    .insert({
      content:       input.content,
      answer:        input.answer,
      analysis:      input.analysis,
      question_type: input.question_type,
      difficulty:    input.difficulty,
      year:          input.year,
      source:        input.source,
      status:        input.status,
    })
    .select('id')
    .single();

  if (error) return { success: false, error: error.message };

  if (input.topic_ids.length > 0) {
    const { error: relError } = await supabase
      .from('question_topic_relations')
      .insert(input.topic_ids.map(tid => ({ question_id: data.id, topic_id: tid })));
    if (relError) return { success: false, error: relError.message };
  }

  revalidatePath('/');
  return { success: true, id: data.id };
}

// ── 查单题（编辑回显用） ──────────────────────────────────────

export interface QuestionForEdit {
  id: string;
  content: string;
  answer: string;
  analysis: string;
  question_type: QuestionType;
  difficulty: Difficulty;
  year: number | null;
  source: string | null;
  status: QuestionStatus;
  topic_ids: string[];
}

export async function getQuestionById(id: string): Promise<QuestionForEdit | null> {
  let supabase;
  try { supabase = createAdminClient(); } catch { return null; }

  const { data, error } = await supabase
    .from('questions')
    .select('id, content, answer, analysis, question_type, difficulty, year, source, status, question_topic_relations(topic_id)')
    .eq('id', id)
    .single();

  if (error || !data) return null;

  return {
    id:            data.id,
    content:       data.content,
    answer:        data.answer,
    analysis:      (data as any).analysis ?? '',
    question_type: (data as any).question_type ?? 'calculation',
    difficulty:    data.difficulty as Difficulty,
    year:          data.year ?? null,
    source:        data.source ?? null,
    status:        (data as any).status ?? 'published',
    topic_ids:     ((data as any).question_topic_relations ?? []).map((r: any) => r.topic_id),
  };
}

// ── 更新题目 ──────────────────────────────────────────────────

export async function updateQuestion(
  id: string,
  input: CreateQuestionInput,
): Promise<{ success: boolean; error?: string }> {
  let supabase;
  try { supabase = createAdminClient(); } catch {
    return { success: false, error: '服务端配置错误：缺少 SUPABASE_SERVICE_ROLE_KEY' };
  }

  const { error } = await supabase
    .from('questions')
    .update({
      content:       input.content,
      answer:        input.answer,
      analysis:      input.analysis,
      question_type: input.question_type,
      difficulty:    input.difficulty,
      year:          input.year,
      source:        input.source,
      status:        input.status,
    })
    .eq('id', id);

  if (error) return { success: false, error: error.message };

  // 先删旧关联，再写新关联
  await supabase.from('question_topic_relations').delete().eq('question_id', id);

  if (input.topic_ids.length > 0) {
    const { error: relError } = await supabase
      .from('question_topic_relations')
      .insert(input.topic_ids.map(tid => ({ question_id: id, topic_id: tid })));
    if (relError) return { success: false, error: relError.message };
  }

  revalidatePath('/');
  revalidatePath(`/admin/edit/${id}`);
  return { success: true };
}

export type SortOrder = 'difficulty_asc' | 'difficulty_desc' | 'updated_at_desc';

export async function getQuestions(
  topicId?: string,
  sort: SortOrder = 'updated_at_desc',
  limit = 20,
): Promise<QuestionWithTopics[]> {
  let supabase;
  try {
    supabase = await createClient();
  } catch {
    return [];
  }

  // 使用 !inner 让 topicId 过滤作用于父行（question），而非仅过滤嵌套行
  const select = topicId
    ? `*, question_topic_relations!inner(question_id, topic_id, topics(*))`
    : `*, question_topic_relations(question_id, topic_id, topics(*))`;

  let query = supabase
    .from('questions')
    .select(select)
    .eq('status', 'published')
    .limit(limit);

  if (topicId) {
    query = query.eq('question_topic_relations.topic_id', topicId);
  }

  switch (sort) {
    case 'difficulty_asc':
      query = query.order('difficulty', { ascending: true });
      break;
    case 'difficulty_desc':
      query = query.order('difficulty', { ascending: false });
      break;
    default:
      query = query.order('updated_at', { ascending: false });
  }

  const { data, error } = await query;

  if (error) {
    console.error('[getQuestions]', error.message);
    return [];
  }

  return (data ?? []) as unknown as QuestionWithTopics[];
}

function buildTopicTree(flat: TopicRow[]): TopicWithChildren[] {
  const map = new Map<string, TopicWithChildren>();
  for (const t of flat) map.set(t.id, { ...t, children: [] });

  const roots: TopicWithChildren[] = [];
  for (const node of map.values()) {
    if (node.parent_id && map.has(node.parent_id)) {
      map.get(node.parent_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  const sortNodes = (nodes: TopicWithChildren[]) => {
    nodes.sort((a, b) => ((a as any).sort_order ?? a.order_index) - ((b as any).sort_order ?? b.order_index));
    nodes.forEach(n => sortNodes(n.children));
  };
  sortNodes(roots);

  return roots;
}

export async function getQuestionTopics(): Promise<TopicWithChildren[]> {
  let supabase;
  try {
    supabase = await createClient();
  } catch {
    return [];
  }

  const { data, error } = await supabase
    .from('topics')
    .select('*')
    .order('sort_order', { ascending: true });

  if (error) {
    console.error('[getQuestionTopics]', error.message);
    return [];
  }

  return buildTopicTree((data ?? []) as TopicRow[]);
}
