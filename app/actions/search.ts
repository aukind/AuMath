'use server';

// 站内搜索：题目（公开已发布，匹配正文/出处）+ 论坛帖子（匹配标题）。
//
// 优先走 pg_trgm 排序 RPC（search_question_ids / search_post_ids，见迁移 013）：
// GIN 三元组索引加速 + similarity() 相关性排序。RPC 不存在（迁移未跑）或异常时，
// 自动回退到 ilike 子串查询，保证迁移前后都可用。

/* eslint-disable @typescript-eslint/no-explicit-any */

import { createClient } from '@/lib/supabase/server';
import type { QuestionWithTopics } from '@/types/database';

export interface PostHit {
  id: string;
  title: string;
  createdAt: string;
  authorName: string;
}

export interface SearchResult {
  questions: QuestionWithTopics[];
  posts: PostHit[];
}

const LIMIT = 20;
const QUESTION_SELECT = '*, question_topic_relations(question_id, topic_id, topics(*))';
const POST_SELECT = 'id, title, created_at, author:profiles!forum_posts_author_id_fkey(username)';

/** 按给定 id 顺序重排水合结果（RPC 已按相关性排序，保持该顺序）。 */
function reorder<T extends { id: string }>(rows: T[], ids: string[]): T[] {
  const map = new Map(rows.map((r) => [r.id, r]));
  return ids.map((id) => map.get(id)).filter((x): x is T => !!x);
}

function toPostHit(p: any): PostHit {
  const author = Array.isArray(p.author) ? p.author[0] : p.author;
  return {
    id: p.id,
    title: p.title,
    createdAt: p.created_at,
    authorName: author?.username?.trim() || '用户',
  };
}

export async function searchAll(query: string): Promise<SearchResult> {
  const safe = (query ?? '').replace(/[%,()]/g, ' ').trim();
  if (safe.length < 1) return { questions: [], posts: [] };

  const supabase = await createClient();
  const sb = supabase as any;

  const [questions, posts] = await Promise.all([
    searchQuestions(sb, safe),
    searchPosts(sb, safe),
  ]);
  return { questions, posts };
}

async function searchQuestions(sb: any, q: string): Promise<QuestionWithTopics[]> {
  try {
    // 优先：trgm 排序 RPC（仅返回有序 id）
    const { data: idRows, error } = await sb.rpc('search_question_ids', { q, lim: LIMIT });
    if (error) throw error;
    const ids = (idRows ?? []).map((r: any) => r.id as string);
    if (!ids.length) return [];
    const { data } = await sb.from('questions').select(QUESTION_SELECT).in('id', ids);
    return reorder<QuestionWithTopics>((data ?? []) as QuestionWithTopics[], ids);
  } catch {
    // 降级：ilike 子串（迁移未跑 / RPC 缺失）
    try {
      const { data } = await sb
        .from('questions')
        .select(QUESTION_SELECT)
        .eq('status', 'published')
        .eq('is_public', true)
        .or(`content.ilike.%${q}%,source.ilike.%${q}%`)
        .limit(LIMIT);
      return (data ?? []) as QuestionWithTopics[];
    } catch {
      return [];
    }
  }
}

async function searchPosts(sb: any, q: string): Promise<PostHit[]> {
  try {
    const { data: idRows, error } = await sb.rpc('search_post_ids', { q, lim: LIMIT });
    if (error) throw error;
    const ids = (idRows ?? []).map((r: any) => r.id as string);
    if (!ids.length) return [];
    const { data } = await sb.from('forum_posts').select(POST_SELECT).in('id', ids);
    return reorder<{ id: string }>((data ?? []) as { id: string }[], ids).map(toPostHit);
  } catch {
    try {
      const { data } = await sb
        .from('forum_posts')
        .select(POST_SELECT)
        .ilike('title', `%${q}%`)
        .order('created_at', { ascending: false })
        .limit(LIMIT);
      return (data ?? []).map(toPostHit);
    } catch {
      return [];
    }
  }
}
