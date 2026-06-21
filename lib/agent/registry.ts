import { z } from 'zod';
import type Anthropic from '@anthropic-ai/sdk';
import type { AgentCtx, AnyAgentTool, ToolResult } from './types';
import { canUseTool, needsConfirmation } from './permissions';
import { logToolCall } from './audit';
import { readTools } from './tools/read';
import { writeTools } from './tools/write';
import { adminTools } from './tools/admin';
import { dangerousTools, describeDelete } from './tools/dangerous';

export const allTools: AnyAgentTool[] = [
  ...readTools,
  ...writeTools,
  ...adminTools,
  ...dangerousTools,
];

const byName = new Map<string, AnyAgentTool>(allTools.map((t) => [t.name, t]));

/** 当前身份可见的工具子集（普通用户连危险工具定义都拿不到）。 */
export function toolsFor(ctx: AgentCtx): AnyAgentTool[] {
  return allTools.filter((t) => canUseTool(ctx, t));
}

/** 转 Anthropic tool 定义；不可逆工具注入 confirmed 字段，让模型知道可二次确认放行。 */
export function toAnthropicTools(tools: AnyAgentTool[]): Anthropic.Tool[] {
  return tools.map((t) => {
    const schema = z.toJSONSchema(t.input) as Record<string, unknown>;
    if (t.confirm === 'irreversible') {
      const props = (schema.properties ?? {}) as Record<string, unknown>;
      props.confirmed = {
        type: 'boolean',
        description: '用户已明确确认执行该不可逆操作时设为 true；否则留空，工具会先返回待确认摘要。',
      };
      schema.properties = props;
    }
    return {
      name: t.name,
      description: t.description,
      input_schema: { type: 'object', ...schema } as Anthropic.Tool.InputSchema,
    };
  });
}

/**
 * 执行一个工具，串起：权限校验 → 入参校验 → 不可逆确认闸 → 执行 → 审计。
 * 永不 throw：任何失败都落成判别联合的 ToolResult 并写审计。
 */
export async function runTool(
  name: string,
  rawInput: unknown,
  ctx: AgentCtx,
): Promise<ToolResult> {
  const tool = byName.get(name);
  if (!tool) return { status: 'error', error: `未知工具：${name}` };

  // 1. 权限：不可见即拒绝（理论上不会发生，因为只下发可见工具，但纵深防御）
  if (!canUseTool(ctx, tool)) {
    const result: ToolResult = { status: 'denied', error: '当前身份无权调用该工具' };
    await logToolCall(ctx, tool, rawInput, result, false);
    return result;
  }

  const obj = (rawInput ?? {}) as Record<string, unknown>;
  const confirmed = obj.confirmed === true;

  // 2. 入参校验（zod 会顺带剥掉 confirmed 等多余键）
  const parsed = tool.input.safeParse(rawInput);
  if (!parsed.success) {
    const result: ToolResult = {
      status: 'error',
      error: '入参不合法：' + parsed.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join('; '),
    };
    await logToolCall(ctx, tool, rawInput, result, confirmed);
    return result;
  }

  // 3. 不可逆确认闸
  if (needsConfirmation(ctx, tool, confirmed)) {
    let summary = `即将执行不可逆操作「${tool.name}」。`;
    if (tool.name === 'delete_question' && typeof obj.id === 'string') {
      summary = await describeDelete(obj.id);
    }
    const result: ToolResult = { status: 'needs_confirmation', summary };
    await logToolCall(ctx, tool, rawInput, result, false);
    return result;
  }

  // 4. 执行 + 审计
  let result: ToolResult;
  try {
    result = await tool.run(parsed.data, ctx);
  } catch (e) {
    result = { status: 'error', error: e instanceof Error ? e.message : '工具执行异常' };
  }
  await logToolCall(ctx, tool, parsed.data, result, confirmed);
  return result;
}
