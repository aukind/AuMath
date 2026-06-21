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
 * MCP：从 Authorization: Bearer <token> 解析上下文。两种令牌：
 *   1. 静态管理员令牌（MCP_ADMIN_TOKEN）——专给本地 Claude（Claude Code/桌面端，跑会员）
 *      接入用，配一次永久有效、不过期。需同时配 MCP_ADMIN_USER_ID（管理员的 auth.users UUID，
 *      录题 created_by/审计外键要用真实用户 id）。
 *   2. Supabase access token——网页登录态派生，会过期。
 * token 无效返回 null。MCP 默认开自动驾驶（CLI 无交互确认面板），但仍受 dangerous scope 与审计约束。
 */
export async function resolveMcpContext(authHeader: string | null): Promise<AgentCtx | null> {
  const token = authHeader?.replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;

  // 1. 静态管理员令牌（常量时间比较，避免计时侧信道）
  //    env 值 trim：Vercel 粘贴常带首尾空格/换行，不 trim 会因长度不符而误判失败。
  const adminToken = process.env.MCP_ADMIN_TOKEN?.trim();
  const adminUserId = process.env.MCP_ADMIN_USER_ID?.trim();
  if (adminToken && adminUserId && token.length === adminToken.length) {
    let diff = 0;
    for (let i = 0; i < token.length; i++) diff |= token.charCodeAt(i) ^ adminToken.charCodeAt(i);
    if (diff === 0) {
      return { userId: adminUserId, isAdmin: true, autopilot: true, surface: 'mcp' };
    }
  }

  // 2. Supabase access token
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
