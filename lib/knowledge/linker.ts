// 知识点落库：把「考点名字」解析成 topics 行并写 question_topic_relations。
//
// 解析策略：按 name 复用库里已有节点（椭圆/直线与圆 等是用户手搭的，绝不重建/改挂），
// 只为词表里缺失的章节/考点补建新行（章节=根节点 level 0，考点挂章节下 level+1）。
// 关联写入用 upsert ignoreDuplicates（主键 question_id+topic_id），重复调用幂等。
//
// 调用方负责 revalidateTag('topics')（星图底图 unstable_cache 的失效键）。

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/supabase';
import { KP_INDEX, KP_TAXONOMY } from '@/lib/knowledge/taxonomy';

type Admin = SupabaseClient<Database>;
type TopicLite = { id: string; name: string; level: number; parent_id: string | null };

export interface QuestionPointsPair {
  questionId: string;
  /** 词表内的考点名（linker 内部还会再过滤一次词表外名字） */
  points: string[];
}

/**
 * 为一批题目绑定知识点。返回成功写入（或已存在）的关联条数估计。
 * 任何一步失败都只影响标注，不抛错连累录题主流程。
 */
export async function linkQuestionsToKnowledgePoints(
  admin: Admin,
  pairs: QuestionPointsPair[],
): Promise<{ linked: number; error?: string }> {
  const cleaned = pairs
    .map(p => ({ questionId: p.questionId, points: p.points.filter(n => KP_INDEX.has(n)) }))
    .filter(p => p.questionId && p.points.length > 0);
  if (!cleaned.length) return { linked: 0 };

  const pointNames = [...new Set(cleaned.flatMap(p => p.points))];
  const chapterNames = [...new Set(pointNames.map(n => KP_INDEX.get(n)!.chapter.name))];

  try {
    const nameToTopic = await resolveTopics(admin, pointNames, chapterNames);

    const rows: Database['public']['Tables']['question_topic_relations']['Insert'][] = [];
    for (const p of cleaned) {
      for (const name of p.points) {
        const topic = nameToTopic.get(name);
        if (topic) rows.push({ question_id: p.questionId, topic_id: topic.id });
      }
    }
    if (!rows.length) return { linked: 0 };

    const { error } = await admin
      .from('question_topic_relations')
      .upsert(rows, { onConflict: 'question_id,topic_id', ignoreDuplicates: true });
    if (error) throw error;
    return { linked: rows.length };
  } catch (e) {
    const msg = (e as Error).message;
    console.error('[linkQuestionsToKnowledgePoints] 失败（已降级）：', msg);
    return { linked: 0, error: msg };
  }
}

/**
 * 只解析不绑题：把考点名换成 topics 行（缺失的补建），供录题表单「AI 识别」预选用。
 * 失败返回空数组。
 */
export async function ensureKnowledgePointTopics(
  admin: Admin,
  pointNames: string[],
): Promise<TopicLite[]> {
  const valid = pointNames.filter(n => KP_INDEX.has(n));
  if (!valid.length) return [];
  try {
    const chapterNames = [...new Set(valid.map(n => KP_INDEX.get(n)!.chapter.name))];
    const nameToTopic = await resolveTopics(admin, valid, chapterNames);
    return valid.map(n => nameToTopic.get(n)).filter((t): t is TopicLite => !!t);
  } catch (e) {
    console.error('[ensureKnowledgePointTopics] 失败（已降级）：', (e as Error).message);
    return [];
  }
}

/** 按名字查全量所需节点，缺失的先建章节（根）再建考点（章节子节点），返回 name → topic。 */
async function resolveTopics(
  admin: Admin,
  pointNames: string[],
  chapterNames: string[],
): Promise<Map<string, TopicLite>> {
  const allNames = [...new Set([...pointNames, ...chapterNames])];
  const found = new Map<string, TopicLite>();

  const { data: existing, error } = await admin
    .from('topics')
    .select('id, name, level, parent_id')
    .in('name', allNames)
    .order('level', { ascending: true });
  if (error) throw error;
  // 同名多行时取层级最浅的一行（更接近用户手搭的主干）
  for (const t of existing ?? []) if (!found.has(t.name)) found.set(t.name, t);

  // 补建缺失章节（根节点）。order_index 接在 005 种子（0-5）之后，按词表顺序稳定排列。
  const missingChapters = KP_TAXONOMY.filter(ch => chapterNames.includes(ch.name) && !found.has(ch.name));
  if (missingChapters.length) {
    const { data, error: insErr } = await admin
      .from('topics')
      .insert(missingChapters.map(ch => ({
        name: ch.name,
        slug: ch.slug,
        level: 0,
        parent_id: null,
        order_index: 10 + KP_TAXONOMY.findIndex(c => c.name === ch.name),
      })))
      .select('id, name, level, parent_id');
    if (insErr) throw insErr;
    for (const t of data ?? []) found.set(t.name, t);
  }

  // 补建缺失考点，挂到所属章节下
  const missingPoints = pointNames.filter(n => !found.has(n));
  if (missingPoints.length) {
    const inserts = missingPoints.flatMap(name => {
      const def = KP_INDEX.get(name)!;
      const chapter = found.get(def.chapter.name);
      if (!chapter) return []; // 章节解析失败则放弃该考点，不阻塞其余
      return [{
        name,
        slug: def.point.slug,
        level: chapter.level + 1,
        parent_id: chapter.id,
        order_index: def.chapter.points.findIndex(p => p.name === name),
      }];
    });
    if (inserts.length) {
      const { data, error: insErr } = await admin
        .from('topics')
        .insert(inserts)
        .select('id, name, level, parent_id');
      if (insErr) throw insErr;
      for (const t of data ?? []) found.set(t.name, t);
    }
  }

  return found;
}
