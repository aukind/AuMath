import { createMcpHandler, withMcpAuth } from 'mcp-handler';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import { z } from 'zod';
import { allTools, runTool } from '@/lib/agent/registry';
import { resolveMcpContext } from '@/lib/agent/context';
import { grantedScopes } from '@/lib/agent/permissions';
import type { AgentCtx, AgentTool } from '@/lib/agent/types';

export const runtime = 'nodejs';
export const maxDuration = 300;

/** 把工具的 z.object 入参取出 raw shape；不可逆工具补 confirmed 字段。 */
function shapeOf(tool: AgentTool): z.ZodRawShape {
  const base = (tool.input as z.ZodObject<z.ZodRawShape>).shape ?? {};
  if (tool.confirm === 'irreversible') {
    return { ...base, confirmed: z.boolean().optional() };
  }
  return base;
}

/** 从 MCP 鉴权信息还原 agent 上下文（surface=mcp，管理员默认自动驾驶）。 */
function ctxFromAuth(authInfo: AuthInfo | undefined): AgentCtx | null {
  const extra = authInfo?.extra as { userId?: string; isAdmin?: boolean } | undefined;
  if (!extra?.userId) return null;
  return { userId: extra.userId, isAdmin: !!extra.isAdmin, autopilot: !!extra.isAdmin, surface: 'mcp' };
}

const baseHandler = createMcpHandler(
  (server) => {
    for (const tool of allTools) {
      server.registerTool(
        tool.name,
        {
          description: tool.description,
          inputSchema: shapeOf(tool),
          annotations: { readOnlyHint: !tool.mutates, destructiveHint: tool.confirm === 'irreversible' },
        },
        async (args: Record<string, unknown>, extra) => {
          const ctx = ctxFromAuth(extra.authInfo);
          if (!ctx) {
            return { isError: true, content: [{ type: 'text', text: '鉴权失败' }] };
          }
          const result = await runTool(tool.name, args, ctx);
          const text =
            result.status === 'ok'
              ? JSON.stringify(result.data)
              : result.status === 'needs_confirmation'
                ? `[需确认] ${result.summary}`
                : result.error;
          return { isError: result.status === 'error' || result.status === 'denied', content: [{ type: 'text', text }] };
        },
      );
    }
  },
  {},
  { basePath: '/api/mcp' },
);

/**
 * Bearer = Supabase access token。校验通过后把 userId/isAdmin 塞进 AuthInfo.extra，
 * 供各工具回调还原上下文。token 无效则 required:true 直接拒绝。
 */
const handler = withMcpAuth(
  baseHandler,
  async (_req, bearerToken): Promise<AuthInfo | undefined> => {
    const ctx = await resolveMcpContext(bearerToken ? `Bearer ${bearerToken}` : null);
    if (!ctx) return undefined;
    return {
      token: bearerToken!,
      clientId: ctx.userId,
      scopes: grantedScopes(ctx),
      extra: { userId: ctx.userId, isAdmin: ctx.isAdmin },
    };
  },
  { required: true },
);

export { handler as GET, handler as POST, handler as DELETE };
