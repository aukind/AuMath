'use server';

// 站内搜索：题目（公开已发布，匹配正文/出处）+ 论坛帖子（匹配标题）。
// 用 ilike 子串匹配，无需迁移即可支持中文。读路径降级。

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

export async function searchAll(query: string): Promise<SearchResult> {
  const safe = (query ?? '').replace(/[%,()]/g, ' ').trim();
  if (safe.length < 1) return { questions: [], posts: [] };

  const supabase = await createClient();
  const sb = supabase as any;

  const questionsP = (async () => {
    try {
      const { data } = await sb
        .from('questions')
        .select('*, question_topic_relations(question_id, topic_id, topics(*))')
        .eq('status', 'published')
        .eq('is_public', true)
        .or(`content.ilike.%${safe}%,source.ilike.%${safe}%`)
        .limit(LIMIT);
      return (data ?? []) as QuestionWithTopics[];
    } catch {
      return [] as QuestionWithTopics[];
    }
  })();

  const postsP = (async () => {
    try {
      const { data } = await sb
        .from('forum_posts')
        .select('id, title, created_at, author:profiles!forum_posts_author_id_fkey(username)')
        .ilike('title', `%${safe}%`)
        .order('created_at', { ascending: false })
        .limit(LIMIT);
      return (data ?? []).map((p: any): PostHit => {
        const author = Array.isArray(p.author) ? p.author[0] : p.author;
        return {
          id: p.id,
          title: p.title,
          createdAt: p.created_at,
          authorName: author?.username?.trim() || '用户',
        };
      });
    } catch {
      return [] as PostHit[];
    }
  })();

  const [questions, posts] = await Promise.all([questionsP, postsP]);
  return { questions, posts };
}
