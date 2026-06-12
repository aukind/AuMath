'use server';

// 每日一题：以东八区日期为种子，确定性地从「公开且已发布」的题目中选一道。
// 同一天所有人看到同一题，次日自动更换。无题/异常 → null。

import { createClient } from '@/lib/supabase/server';
import type { QuestionWithTopics } from '@/types/database';

/** 东八区当天日期 YYYY-MM-DD，作为选题种子。 */
function cnDateSeed(): string {
  return new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
}

function hashToIndex(seed: string, mod: number): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return mod > 0 ? h % mod : 0;
}

export async function getDailyQuestion(): Promise<{ question: QuestionWithTopics | null; date: string }> {
  const date = cnDateSeed();
  const supabase = await createClient();
  try {
    const { count } = await supabase
      .from('questions')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'published')
      .eq('is_public', true);

    const total = count ?? 0;
    if (!total) return { question: null, date };

    const idx = hashToIndex(date, total);
    const { data } = await supabase
      .from('questions')
      .select('*, question_topic_relations(question_id, topic_id, topics(*))')
      .eq('status', 'published')
      .eq('is_public', true)
      .order('created_at', { ascending: true })
      .range(idx, idx);

    return { question: ((data ?? []) as unknown as QuestionWithTopics[])[0] ?? null, date };
  } catch {
    return { question: null, date };
  }
}
