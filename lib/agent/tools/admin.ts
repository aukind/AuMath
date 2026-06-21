import { z } from 'zod';
import { backfillKnowledgePoints } from '@/app/actions/knowledge-points';
import { backfillEmbeddings } from '@/app/actions/embeddings';
import type { AnyAgentTool, ToolResult } from '../types';

/**
 * 管理员专属批量管线工具。需要 'admin' scope —— 普通用户的 Claude 看不到它们。
 * 这些是「跑一批」式幂等操作（只处理尚未处理的题），可重复安全，故不要求确认。
 */

const backfillKnowledge: AnyAgentTool = {
  name: 'backfill_knowledge_points',
  description:
    '【管理员】给尚无任何知识点关联的已发布题批量补打知识点（每次一批）。返回本批处理/打标数；processed=0 表示已全部补全。可反复调用直到 processed 归零。',
  input: z.object({
    batch_size: z.number().int().min(1).max(100).optional().describe('单批题数，默认 40'),
  }),
  scopes: ['admin'],
  mutates: true,
  confirm: 'never',
  async run({ batch_size }): Promise<ToolResult> {
    const r = await backfillKnowledgePoints(batch_size ?? 40);
    if (!r.success) return { status: 'error', error: r.error ?? '回填失败' };
    return { status: 'ok', data: { processed: r.processed, tagged: r.tagged } };
  },
};

const backfillVectors: AnyAgentTool = {
  name: 'backfill_embeddings',
  description:
    '【管理员】给尚无语义向量的题批量生成 embedding（每次一批），用于语义搜索。返回本批处理/写入数；processed=0 表示已全部补全。可反复调用。',
  input: z.object({
    batch_size: z.number().int().min(1).max(100).optional().describe('单批题数，默认 50'),
  }),
  scopes: ['admin'],
  mutates: true,
  confirm: 'never',
  async run({ batch_size }): Promise<ToolResult> {
    const r = await backfillEmbeddings(batch_size ?? 50);
    if (!r.success) return { status: 'error', error: r.error ?? '回填失败' };
    return { status: 'ok', data: { processed: r.processed, embedded: r.embedded } };
  },
};

export const adminTools: AnyAgentTool[] = [backfillKnowledge, backfillVectors];
