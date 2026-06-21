import { z } from 'zod';
import { createQuestion, type CreateQuestionInput } from '@/app/actions/questions';
import { suggestKnowledgePoints } from '@/app/actions/knowledge-points';
import { toggleFavorite } from '@/app/actions/user-workspace';
import { createFavoriteFolder, moveFavoritesToFolder } from '@/app/actions/favorites';
import type { AnyAgentTool, ToolResult } from '../types';

const createQuestionTool: AnyAgentTool = {
  name: 'create_question',
  description:
    '录入一道新题到题库。会自动做知识点标注与（管理员公开题）语义向量索引。' +
    '可逆（可随后删除/归档），故无需二次确认。LaTeX 用标准写法（$...$ 行内、$$...$$ 行间）。',
  input: z.object({
    content: z.string().min(1).describe('题面，含 LaTeX'),
    answer: z.string().describe('答案'),
    analysis: z.string().describe('解析过程'),
    question_type: z
      .enum(['multiple_choice', 'fill_in_blank', 'calculation', 'proof'])
      .describe('题型'),
    year: z.number().int().nullable().optional().describe('年份，无则 null'),
    source: z.string().nullable().optional().describe('出处，如「2024 全国甲卷」'),
    status: z.enum(['draft', 'published', 'archived']).optional().describe('默认 draft'),
    options: z.array(z.string()).nullable().optional().describe('选择题选项，每项形如「A. ...」'),
    choice_type: z.enum(['single', 'multi']).nullable().optional().describe('选择题单选/多选'),
  }),
  scopes: ['write'],
  mutates: true,
  confirm: 'never',
  async run(input): Promise<ToolResult> {
    const payload: CreateQuestionInput = {
      content: input.content,
      answer: input.answer,
      analysis: input.analysis,
      question_type: input.question_type,
      year: input.year ?? null,
      source: input.source ?? null,
      topic_ids: [], // 留空 → action 内 Gemini 自动打标
      status: input.status ?? 'draft',
      options: input.options ?? null,
      choice_type: input.choice_type ?? null,
    };
    const r = await createQuestion(payload);
    if (!r.success) return { status: 'error', error: r.error ?? '录题失败' };
    return { status: 'ok', data: { id: r.id } };
  },
};

const suggestKnowledge: AnyAgentTool = {
  name: 'suggest_knowledge_points',
  description:
    '对一段题面文本做受控词表知识点识别，返回建议的知识点（topics）。用于录题前预判考点或核对标注。可能新建知识点节点，但不修改任何题目，安全。',
  input: z.object({
    content: z.string().min(1).describe('题面文本'),
    analysis: z.string().optional().describe('解析（可选，有助于识别跨章节方法）'),
  }),
  scopes: ['write'],
  mutates: true,
  confirm: 'never',
  async run({ content, analysis }): Promise<ToolResult> {
    const r = await suggestKnowledgePoints(content, analysis);
    if (!r.success) return { status: 'error', error: r.error };
    return { status: 'ok', data: { topics: r.topics } };
  },
};

const favoriteQuestion: AnyAgentTool = {
  name: 'toggle_favorite',
  description: '收藏 / 取消收藏一道题（开关式）。返回操作后的收藏状态。',
  input: z.object({ question_id: z.string().uuid().describe('题目 UUID') }),
  scopes: ['write'],
  mutates: true,
  confirm: 'never',
  async run({ question_id }): Promise<ToolResult> {
    const r = await toggleFavorite(question_id);
    if (!r.success) return { status: 'error', error: r.error ?? '操作失败' };
    return { status: 'ok', data: { favorited: r.favorited } };
  },
};

const newFolder: AnyAgentTool = {
  name: 'create_favorite_folder',
  description: '新建一个收藏夹。返回新夹的 id 与名称。',
  input: z.object({ name: z.string().min(1).describe('收藏夹名称') }),
  scopes: ['write'],
  mutates: true,
  confirm: 'never',
  async run({ name }): Promise<ToolResult> {
    const r = await createFavoriteFolder(name);
    if (!r.ok) return { status: 'error', error: r.error ?? '创建失败' };
    return { status: 'ok', data: r.folder };
  },
};

const moveFavorites: AnyAgentTool = {
  name: 'move_favorites_to_folder',
  description: '把若干已收藏的题移动到某个收藏夹（folder_id 传 null = 移回未分类）。',
  input: z.object({
    question_ids: z.array(z.string().uuid()).min(1).describe('要移动的题目 id 列表'),
    folder_id: z.string().uuid().nullable().describe('目标收藏夹 id，null 表示未分类'),
  }),
  scopes: ['write'],
  mutates: true,
  confirm: 'never',
  async run({ question_ids, folder_id }): Promise<ToolResult> {
    const r = await moveFavoritesToFolder(question_ids, folder_id);
    if (!r.ok) return { status: 'error', error: r.error ?? '移动失败' };
    return { status: 'ok', data: { moved: question_ids.length } };
  },
};

export const writeTools: AnyAgentTool[] = [
  createQuestionTool,
  suggestKnowledge,
  favoriteQuestion,
  newFolder,
  moveFavorites,
];
