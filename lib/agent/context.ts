import { createClient as createSupabaseJsClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { isAdminUser } from '@/lib/utils/auth';
import type { Database } from '@/types/supabase';
import type { AgentCtx } from './types';

/**
 * 站内面板：从 cookie 会话解析 agent 上下文。未登录返回 null。
 * autopilot 仅在请求显式开启且确为管理员时生效。
 */
export async function resolvePanelContext(autopilot: boolean): Promise<AgentCtx | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const isAdmin = isAdminUser(user);
  return { userId: user.id, isAdmin, autopilot: autopilot && isAdmin, surface: 'panel' };
}

/**
 * MCP：从 Authorization: Bearer <supabase-access-token> 解析上下文。
 * 用携带该 token 的客户端验明身份，token 无效返回 null。
 * MCP 默认开自动驾驶（CLI 场景无交互确认面板），但仍受 dangerous scope 与审计约束。
 */
export async function resolveMcpContext(authHeader: string | null): Promise<AgentCtx | null> {
  const token = authHeader?.replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;

  const client = createSupabaseJsClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } },
  );
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user) return null;

  const isAdmin = isAdminUser(user);
  return { userId: user.id, isAdmin, autopilot: isAdmin, surface: 'mcp' };
}
