import { createAdminClient } from '@/lib/supabase/admin';
import type { Json } from '@/types/supabase';
import type { AgentCtx, AnyAgentTool, ToolResult } from './types';

/** 结果摘要：截断超长字段（避免把整页题面/解析塞进审计表）。 */
function summarize(value: unknown, max = 4000): Json {
  try {
    const s = JSON.stringify(value) ?? 'null';
    if (s.length <= max) return JSON.parse(s) as Json;
    return { _truncated: true, preview: s.slice(0, max) } as Json;
  } catch {
    return { _unserializable: true } as Json;
  }
}

/**
 * 落一条审计。尽力而为：审计写失败绝不影响工具本身的执行结果
 * （但会在服务端日志留痕，便于发现审计链路断裂）。
 */
export async function logToolCall(
  ctx: AgentCtx,
  tool: AnyAgentTool,
  input: unknown,
  result: ToolResult,
  confirmed: boolean,
): Promise<void> {
  try {
    const admin = createAdminClient();
    await admin.from('agent_audit_logs').insert({
      user_id: ctx.userId,
      surface: ctx.surface,
      tool: tool.name,
      scopes: tool.scopes,
      mutates: tool.mutates,
      confirmed,
      status: result.status,
      input: summarize(input),
      result: result.status === 'ok' ? summarize(result.data) : null,
      error: 'error' in result ? result.error : null,
    });
  } catch (e) {
    console.error('[agent-audit] 写入失败', tool.name, e);
  }
}
