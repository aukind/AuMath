import Anthropic from '@anthropic-ai/sdk';
import type { AgentCtx, ToolResult } from './types';
import { toolsFor, toAnthropicTools, runTool } from './registry';

const MAX_STEPS = 8;
const MODEL = process.env.AGENT_MODEL || 'claude-opus-4-8';

export type AgentEvent =
  | { type: 'text'; delta: string }
  | { type: 'tool_start'; name: string }
  | { type: 'tool_end'; name: string; status: ToolResult['status'] }
  | { type: 'done' }
  | { type: 'error'; error: string };

function systemPrompt(ctx: AgentCtx): string {
  return [
    '你是 AuMath（高阶数学题库与社区）站内的 AI 助手，帮助用户检索、录入与管理数学题目。',
    ctx.isAdmin
      ? '当前用户是管理员，你拥有最高权限工具集（含批量回填与删除）。'
      : '当前用户是普通用户，你只能做检索与可逆的录入/收藏操作。',
    '规则：',
    '- 所有数学公式用标准 LaTeX（$...$ 行内、$$...$$ 行间），保持转义规范。',
    '- 涉及站点链接一律用 https://aumath.com。',
    '- 调用工具前先想清楚参数；题目 id 必须来自搜索结果，绝不杜撰。',
    '- 当工具返回 needs_confirmation（不可逆操作待确认）时，把摘要清楚转述给用户并询问是否执行；用户明确同意后，再次调用该工具并把 confirmed 设为 true。',
    '- 工具失败时如实说明，不要假装成功。',
  ].join('\n');
}

/**
 * 运行一轮 agent 循环，按事件流式产出。
 * 每步：流式取模型文本 → 若有 tool_use 则执行工具并回灌 tool_result → 继续，直到模型不再调工具。
 */
export async function* runAgent(
  ctx: AgentCtx,
  messages: Anthropic.MessageParam[],
): AsyncGenerator<AgentEvent> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    yield { type: 'error', error: '服务端未配置 ANTHROPIC_API_KEY' };
    return;
  }

  const client = new Anthropic({ apiKey });
  const tools = toAnthropicTools(toolsFor(ctx));
  const system = systemPrompt(ctx);
  const convo = [...messages];

  try {
    for (let step = 0; step < MAX_STEPS; step++) {
      const stream = client.messages.stream({
        model: MODEL,
        max_tokens: 4096,
        system,
        messages: convo,
        tools,
      });

      for await (const ev of stream) {
        if (ev.type === 'content_block_delta' && ev.delta.type === 'text_delta') {
          yield { type: 'text', delta: ev.delta.text };
        }
      }

      const final = await stream.finalMessage();
      convo.push({ role: 'assistant', content: final.content });

      const toolUses = final.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
      );
      if (toolUses.length === 0) {
        yield { type: 'done' };
        return;
      }

      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const tu of toolUses) {
        yield { type: 'tool_start', name: tu.name };
        const result = await runTool(tu.name, tu.input, ctx);
        yield { type: 'tool_end', name: tu.name, status: result.status };

        let content: string;
        let isError = false;
        if (result.status === 'ok') content = JSON.stringify(result.data);
        else if (result.status === 'needs_confirmation') content = `[需确认] ${result.summary}`;
        else {
          content = result.error;
          isError = true;
        }
        toolResults.push({ type: 'tool_result', tool_use_id: tu.id, content, is_error: isError });
      }
      convo.push({ role: 'user', content: toolResults });
    }
    yield { type: 'text', delta: '\n\n（已达到单轮工具调用上限，如需继续请再发消息。）' };
    yield { type: 'done' };
  } catch (e) {
    yield { type: 'error', error: e instanceof Error ? e.message : 'agent 运行异常' };
  }
}
