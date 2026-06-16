// 定理落库：把「定理名字」解析成 theorems 行，并写 theorem_question_relations（引用边）
// + 派生 theorem_topic_relations（归属边）。镜像 lib/knowledge/linker.ts。
//
// 归属边的派生策略：定理挂到「引用它的题目所挂的知识点」上——比手填精准，
// 且让定理节点自然落在它真正服务的知识点星团旁。
// 关联写入用 upsert ignoreDuplicates（复合主键），重复调用幂等。
//
// 调用方负责 revalidateTag('topics')（星图底图 unstable_cache 失效键）。

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/supabase';
import { THEOREM_INDEX } from '@/lib/theorems/taxonomy';

type Admin = SupabaseClient<Database>;
type TheoremLite = { id: string; name: string };

export interface QuestionTheoremsPair {
  questionId: string;
  theorems: string[];
}

/**
 * 按名字查/建 theorems 行（缺失的从词表补建 name+slug+statement+description）。返回 name → 行。
 * 失败返回空 Map。
 */
export async function ensureTheorems(admin: Admin, names: string[]): Promise<Map<string, TheoremLite>> {
  const valid = [...new Set(names.filter(n => THEOREM_INDEX.has(n)))];
  const found = new Map<string, TheoremLite>();
  if (!valid.length) return found;

  try {
    const { data: existing, error } = await admin
      .from('theorems')
      .select('id, name')
      .in('name', valid);
    if (error) throw error;
    for (const t of existing ?? []) found.set(t.name, t);

    const missing = valid.filter(n => !found.has(n));
    if (missing.length) {
      const inserts = missing.map(n => {
        const def = THEOREM_INDEX.get(n)!;
        return { name: def.name, slug: def.slug, statement: def.statement, description: def.description ?? null };
      });
      const { data, error: insErr } = await admin
        .from('theorems')
        .insert(inserts)
        .select('id, name');
      if (insErr) throw insErr;
      for (const t of data ?? []) found.set(t.name, t);
    }
  } catch (e) {
    console.error('[ensureTheorems] 失败（已降级）：', (e as Error).message);
  }
  return found;
}

/**
 * 为一批题目绑定定理：写引用边（定理→题），并据题目的知识点派生归属边（定理→知识点）。
 * 返回写入的引用边条数估计。任何一步失败都只影响标注，不抛错。
 */
export async function linkQuestionsToTheorems(
  admin: Admin,
  pairs: QuestionTheoremsPair[],
): Promise<{ linked: number; error?: string }> {
  const cleaned = pairs
    .map(p => ({ questionId: p.questionId, theorems: p.theorems.filter(n => THEOREM_INDEX.has(n)) }))
    .filter(p => p.questionId && p.theorems.length > 0);
  if (!cleaned.length) return { linked: 0 };

  try {
    const allNames = [...new Set(cleaned.flatMap(p => p.theorems))];
    const nameToTheorem = await ensureTheorems(admin, allNames);
    if (!nameToTheorem.size) return { linked: 0 };

    // ① 引用边：定理 → 题
    const tqRows: Database['public']['Tables']['theorem_question_relations']['Insert'][] = [];
    for (const p of cleaned) {
      for (const name of p.theorems) {
        const th = nameToTheorem.get(name);
        if (th) tqRows.push({ theorem_id: th.id, question_id: p.questionId });
      }
    }
    if (!tqRows.length) return { linked: 0 };

    const { error: tqErr } = await admin
      .from('theorem_question_relations')
      .upsert(tqRows, { onConflict: 'theorem_id,question_id', ignoreDuplicates: true });
    if (tqErr) throw tqErr;

    // ② 归属边：定理 → 知识点（由「引用它的题目所挂知识点」派生）
    const questionIds = [...new Set(cleaned.map(p => p.questionId))];
    const { data: qtRows } = await admin
      .from('question_topic_relations')
      .select('question_id, topic_id')
      .in('question_id', questionIds);

    if (qtRows?.length) {
      const topicsByQuestion = new Map<string, string[]>();
      for (const r of qtRows) {
        const arr = topicsByQuestion.get(r.question_id);
        if (arr) arr.push(r.topic_id);
        else topicsByQuestion.set(r.question_id, [r.topic_id]);
      }
      const ttSet = new Set<string>();
      const ttRows: Database['public']['Tables']['theorem_topic_relations']['Insert'][] = [];
      for (const p of cleaned) {
        const topicIds = topicsByQuestion.get(p.questionId) ?? [];
        for (const name of p.theorems) {
          const th = nameToTheorem.get(name);
          if (!th) continue;
          for (const topicId of topicIds) {
            const key = `${th.id}|${topicId}`;
            if (ttSet.has(key)) continue;
            ttSet.add(key);
            ttRows.push({ theorem_id: th.id, topic_id: topicId });
          }
        }
      }
      if (ttRows.length) {
        await admin
          .from('theorem_topic_relations')
          .upsert(ttRows, { onConflict: 'theorem_id,topic_id', ignoreDuplicates: true });
      }
    }

    return { linked: tqRows.length };
  } catch (e) {
    const msg = (e as Error).message;
    console.error('[linkQuestionsToTheorems] 失败（已降级）：', msg);
    return { linked: 0, error: msg };
  }
}
