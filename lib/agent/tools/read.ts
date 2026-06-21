import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { searchAll } from '@/app/actions/search';
import { semanticSearchQuestionIds } from '@/app/actions/embeddings';
import { getQuestionById } from '@/app/actions/questions';
import { listFavoriteFolders } from '@/app/actions/favorites';
import * as adminOps from '../admin-ops';
import type { AnyAgentTool, ToolResult } from '../types';

/** 截断题面，避免把整页 LaTeX 灌给模型/审计。 */
function snip(s: string | null | undefined, n = 600): string {
  const t = (s ?? '').trim();
  return t.length > n ? t.slice(0, n) + '…' : t;
}

const searchQuestions: AnyAgentTool = {
  name: 'search_questions',
  description:
    '按关键词在题库做词面搜索（题面/出处），同时返回相关论坛帖与用户。适合用户给出明确字词时。返回题目摘要列表。',
  input: z.object({ query: z.string().min(1).describe('搜索关键词，如「圆锥曲线 离心率」') }),
  scopes: ['read'],
  mutates: false,
  confirm: 'never',
  async run({ query }): Promise<ToolResult> {
    const r = await searchAll(query);
    return {
      status: 'ok',
      data: {
        questions: r.questions.slice(0, 12).map((q) => ({
          id: q.id,
          content: snip(q.content),
          source: q.source,
          year: q.year,
          type: q.question_type,
        })),
        posts: r.posts.slice(0, 5).map((p) => ({ id: p.id, title: p.title })),
      },
    };
  },
};

const semanticSearch: AnyAgentTool = {
  name: 'semantic_search_questions',
  description:
    '语义检索题库：按题意而非字面匹配，适合「找和这道题考点/方法相近的题」「描述一个情境找题」。返回最相关的题目摘要。',
  input: z.object({
    query: z.string().min(1).describe('自然语言描述的题意或考点'),
    limit: z.number().int().min(1).max(20).optional().describe('返回条数，默认 8'),
  }),
  scopes: ['read'],
  mutates: false,
  confirm: 'never',
  async run({ query, limit }): Promise<ToolResult> {
    const ids = await semanticSearchQuestionIds(query, limit ?? 8);
    if (!ids.length) return { status: 'ok', data: { questions: [] } };
    const supabase = await createClient();
    const { data } = await supabase
      .from('questions')
      .select('id, content, source, year, question_type')
      .in('id', ids);
    const byId = new Map((data ?? []).map((q) => [q.id, q]));
    const questions = ids
      .map((id) => byId.get(id))
      .filter((q): q is NonNullable<typeof q> => !!q)
      .map((q) => ({ id: q.id, content: snip(q.content), source: q.source, year: q.year, type: q.question_type }));
    return { status: 'ok', data: { questions } };
  },
};

const getQuestion: AnyAgentTool = {
  name: 'get_question',
  description:
    '取单题完整内容（题面、答案、解析、知识点、选项）。管理员可读任意题；普通用户仅能读自己录入的题。先用搜索拿到 id 再调它。',
  input: z.object({ id: z.string().uuid().describe('题目 UUID') }),
  scopes: ['read'],
  mutates: false,
  confirm: 'never',
  async run({ id }, ctx): Promise<ToolResult> {
    // MCP 路无 cookie，走令牌身份 + service-role；面板路保持原 action。
    if (ctx.surface === 'mcp') return adminOps.getQuestion(ctx, id);
    const q = await getQuestionById(id);
    if (!q) return { status: 'error', error: '题目不存在或无权访问' };
    return { status: 'ok', data: q };
  },
};

const listFolders: AnyAgentTool = {
  name: 'list_favorite_folders',
  description: '列出当前用户的收藏夹（含每夹题数与未分类数）。用于收藏相关操作前先看有哪些夹。',
  input: z.object({}),
  scopes: ['read'],
  mutates: false,
  confirm: 'never',
  async run(): Promise<ToolResult> {
    const r = await listFavoriteFolders();
    return { status: 'ok', data: r };
  },
};

export const readTools: AnyAgentTool[] = [searchQuestions, semanticSearch, getQuestion, listFolders];
