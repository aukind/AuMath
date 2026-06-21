'use server';

// AI 考点总结卡：从某知识点关联的真题解析 + 定理，一键生成结构化考点卡并落为可编辑笔记。
// 数据 grounded 于你自己的题库；生成的 [[维基链接]] 让考点卡接回知识星图。
// 入口在 TopicInspector（星图知识点面板）。无 GEMINI key / 素材不足时返回判别联合错误，不抛。

import { createClient } from '@/lib/supabase/server';
import { synthesizeTopicCard } from '@/lib/knowledge/synthesis';
import { createNote, updateNote } from '@/app/actions/notes';
import type { QuestionMetadata } from '@/types/database';

const MAX_QUESTIONS = 14;   // 喂给模型的真题样本上限（控上下文）
const CONTENT_CAP = 500;
const ANALYSIS_CAP = 900;

export type TopicSummaryResult =
  | { ok: true; noteId: string; regenerated: boolean }
  | { ok: false; error: string };

/** 由 source/year/metadata.exam_number 拼题目标签（与 graph.ts 同口径）。 */
function questionLabel(source: string | null, year: number | null, metadata: QuestionMetadata | null): string {
  const examNo = String(metadata?.exam_number ?? '').trim();
  const head = String(source ?? (year ? year : '')).trim();
  return [head, examNo].filter(Boolean).join(' ') || '题目';
}

export async function generateTopicSummary(topicId: string): Promise<TopicSummaryResult> {
  if (!topicId) return { ok: false, error: '无效的知识点' };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: '请先登录后生成（考点卡会存进你的笔记）' };

  // 知识点本体
  const { data: topic } = await supabase
    .from('topics')
    .select('name, description')
    .eq('id', topicId)
    .maybeSingle();
  if (!topic) return { ok: false, error: '知识点不存在' };

  // 关联真题（取已发布的，优先带解析的）
  const { data: rels } = await supabase
    .from('question_topic_relations')
    .select('question_id')
    .eq('topic_id', topicId)
    .limit(60);
  const qIds = (rels ?? []).map(r => r.question_id);

  let questions: { label: string; content: string; analysis: string }[] = [];
  if (qIds.length) {
    const { data: qs } = await supabase
      .from('questions')
      .select('id, source, year, metadata, content, analysis')
      .in('id', qIds)
      .eq('status', 'published')
      .limit(60);
    const rows = (qs ?? []) as { source: string | null; year: number | null; metadata: QuestionMetadata | null; content: string | null; analysis: string | null }[];
    // 带解析的排前面，更利于归纳方法/易错点
    rows.sort((a, b) => (b.analysis ? 1 : 0) - (a.analysis ? 1 : 0));
    questions = rows.slice(0, MAX_QUESTIONS).map(q => ({
      label: questionLabel(q.source, q.year, q.metadata),
      content: (q.content ?? '').slice(0, CONTENT_CAP),
      analysis: (q.analysis ?? '').slice(0, ANALYSIS_CAP),
    }));
  }

  // 关联定理名 + 子知识点名
  const [thRes, childRes] = await Promise.all([
    supabase.from('theorem_topic_relations').select('theorems(name)').eq('topic_id', topicId),
    supabase.from('topics').select('name').eq('parent_id', topicId).limit(20),
  ]);
  const theorems = (thRes.data ?? [])
    .map(r => (r as unknown as { theorems: { name: string } | null }).theorems?.name)
    .filter((n): n is string => !!n);
  const childTopics = (childRes.data ?? []).map(r => r.name);

  if (questions.length === 0 && theorems.length === 0) {
    return { ok: false, error: '该知识点暂无关联真题/定理，素材不足以生成考点卡' };
  }

  // 调 Gemini 合成
  const markdown = await synthesizeTopicCard({
    topicName: topic.name,
    description: topic.description,
    questions,
    theorems,
    childTopics,
  });
  if (!markdown) return { ok: false, error: '生成失败（可能未配置 AI 或素材过少），请稍后重试' };

  // 落为笔记：同名则更新（重新生成），否则新建；统一打 #考点卡 标签
  const title = `考点总结 · ${topic.name}`;
  const { data: existing } = await supabase
    .from('user_notes')
    .select('id')
    .eq('user_id', user.id)
    .eq('title', title)
    .maybeSingle();

  if (existing) {
    const res = await updateNote({ id: existing.id, bodyMd: markdown, tags: ['考点卡'] });
    if (!res.ok) return { ok: false, error: res.error };
    return { ok: true, noteId: existing.id, regenerated: true };
  }

  const created = await createNote({ title, bodyMd: markdown });
  if (!created.ok) return { ok: false, error: created.error };
  await updateNote({ id: created.id, tags: ['考点卡'] });
  return { ok: true, noteId: created.id, regenerated: false };
}
