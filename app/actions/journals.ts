'use server';

// 资源大厅·期刊：高考数学研究报告元数据读取（迁移 025 的 journal_articles）。
// 迁移安全：表不存在时（迁移未跑）查询报错 → 捕获并返回 []，前端显示占位空态，不崩。
import { createClient } from '@/lib/supabase/server';
import type { JournalArticle } from '@/components/library/JournalList';

export async function getJournalArticles(limit = 100): Promise<JournalArticle[]> {
  try {
    const supabase = await createClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any;
    const { data, error } = await sb
      .from('journal_articles')
      .select('id, title, authors, journal_name, issue, abstract, source_url, published_on, tags')
      .order('published_on', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) {
      // 迁移未跑（表缺失）等：静默降级
      return [];
    }
    return (data ?? []) as JournalArticle[];
  } catch {
    return [];
  }
}
