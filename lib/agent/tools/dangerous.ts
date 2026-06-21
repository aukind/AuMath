import { z } from 'zod';
import { deleteQuestion, getQuestionById } from '@/app/actions/questions';
import * as adminOps from '../admin-ops';
import type { AnyAgentTool, ToolResult } from '../types';

/**
 * 不可逆操作。需 'dangerous' scope（仅管理员）。confirm='irreversible'：
 * 非自动驾驶时，registry 会先拦下来要求确认（见 runTool）。
 */
const deleteQuestionTool: AnyAgentTool = {
  name: 'delete_question',
  description:
    '【危险·不可逆】永久删除一道题及其知识点/试卷关联。删除前请先用 get_question 核对是哪道题。非自动驾驶模式下会要求确认。',
  input: z.object({ id: z.string().uuid().describe('要删除的题目 UUID') }),
  scopes: ['dangerous'],
  mutates: true,
  confirm: 'irreversible',
  async run({ id }, ctx): Promise<ToolResult> {
    // MCP 路无 cookie，走令牌身份 + service-role；面板路保持原 action。
    if (ctx.surface === 'mcp') return adminOps.deleteQuestion(ctx, id);
    const r = await deleteQuestion(id);
    if (!r.success) return { status: 'error', error: r.error ?? '删除失败' };
    return { status: 'ok', data: { deleted: id } };
  },
};

/** 生成「待确认」摘要：把要删的题面回给 Claude 转述给用户。 */
export async function describeDelete(id: string): Promise<string> {
  const q = await getQuestionById(id);
  if (!q) return `题目 ${id}（未找到，可能已删除）`;
  const head = q.content.replace(/\s+/g, ' ').trim().slice(0, 80);
  return `删除题目「${head}…」（${q.source ?? '无出处'}，id=${id}），此操作不可恢复。`;
}

export const dangerousTools: AnyAgentTool[] = [deleteQuestionTool];
