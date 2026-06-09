'use server';

// 站内搜索：题目（公开已发布，匹配正文/出处）+ 论坛帖子（匹配标题）。
//
// 优先走 pg_trgm 排序 RPC（search_question_ids / search_post_ids，见迁移 013）：
// GIN 三元组索引加速 + similarity() 相关性排序。RPC 不存在（迁移未跑）或异常时，
// 自动回退到 ilike 子串查询，保证迁移前后都可用。

/* eslint-disable @typescript-eslint/no-explicit-any */

import { createClient } from '@/lib/supabase/server';
import type { QuestionWithTopics } from '@/types/database';
import { semanticSearchQuestionIds } from '@/app/actions/embeddings';

export interface PostHit {
  id: string;
  title: string;
  createdAt: string;
  authorName: string;
}

export interface UserHit {
  userId: string;
  username: string;
  userNo: number | null;
  avatarUrl?: string;
}

export interface SearchResult {
  questions: QuestionWithTopics[];
  posts: PostHit[];
  users: UserHit[];
}

const LIMIT = 20;
const QUESTION_SELECT = '*, question_topic_relations(question_id, topic_id, topics(*))';
const POST_SELECT = 'id, title, created_at, author:profiles!forum_posts_author_id_fkey(username)';

/** 按给定 id 顺序重排水合结果（RPC 已按相关性排序，保持该顺序）。 */
function reorder<T extends { id: string }>(rows: T[], ids: string[]): T[] {
  const map = new Map(rows.map((r) => [r.id, r]));
  return ids.map((id) => map.get(id)).filter((x): x is T => !!x);
}

/**
 * Reciprocal Rank Fusion：把词面（trgm）与语义（pgvector）两路有序 id 融合成一路。
 * 同时命中两路的题排前；任一路为空时退化为另一路的原序。k=60 为通用经验值。
 */
function fuseRanks(lists: string[][], k = 60): string[] {
  const score = new Map<string, number>();
  for (const list of lists) {
    list.forEach((id, rank) => {
      score.set(id, (score.get(id) ?? 0) + 1 / (k + rank));
    });
  }
  return [...score.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
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
  if (safe.length < 1) return { questions: [], posts: [], users: [] };

  const supabase = await createClient();
  const sb = supabase as any;

  const [questions, posts, users] = await Promise.all([
    searchQuestions(sb, safe),
    searchPosts(sb, safe),
    searchUsers(sb, safe),
  ]);
  return { questions, posts, users };
}

// 按 UID（纯数字精确匹配）或用户名（子串）找人。
// user_no 列未迁移 / 表异常时静默降级为 []，不连累题目与帖子结果。
async function searchUsers(sb: any, q: string): Promise<UserHit[]> {
  try {
    let rows: any[] = [];
    // 纯数字优先按 UID 精确命中
    if (/^\d+$/.test(q)) {
      const { data } = await sb
        .from('profiles')
        .select('id, username, avatar_url, user_no')
        .eq('user_no', Number(q))
        .limit(LIMIT);
      rows = data ?? [];
    }
    // 用户名子串匹配（数字 UID 无命中时也回退到此，便于按用户名找人）
    if (!rows.length) {
      const { data } = await sb
        .from('profiles')
        .select('id, username, avatar_url, user_no')
        .ilike('username', `%${q}%`)
        .limit(LIMIT);
      rows = data ?? [];
    }
    return rows.map((p): UserHit => ({
      userId: p.id,
      username: p.username?.trim() || '数学学习者',
      userNo: p.user_no ?? null,
      avatarUrl: p.avatar_url ?? undefined,
    }));
  } catch {
    return [];
  }
}

async function searchQuestions(sb: any, q: string): Promise<QuestionWithTopics[]> {
  try {
    // 混合检索：词面（trgm）与语义（pgvector）并行，RRF 融合排序。
    // 语义路任一环节失败（无 key/迁移 028 未跑）返回空数组，自动退化为纯 trgm。
    const [idRows, semIds] = await Promise.all([
      sb.rpc('search_question_ids', { q, lim: LIMIT }).then((r: any) => {
        if (r.error) throw r.error;
        return (r.data ?? []).map((x: any) => x.id as string);
      }),
      semanticSearchQuestionIds(q, LIMIT),
    ]);
    const ids = fuseRanks([idRows, semIds]).slice(0, LIMIT);
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
