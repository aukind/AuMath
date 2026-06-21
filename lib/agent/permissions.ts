import type { AgentCtx, AnyAgentTool, Scope } from './types';

/**
 * 角色 → 被授予的能力域。
 * 管理员拿全集（含 dangerous）——这是「管理员用 Claude 拥有最高权限」的落点。
 * 普通用户只有读 + 可逆写，连危险工具的定义都不会下发给他们的 Claude。
 */
const SCOPES_BY_ROLE: Record<'user' | 'admin', Scope[]> = {
  user: ['read', 'write'],
  admin: ['read', 'write', 'moderate', 'admin', 'dangerous'],
};

export function grantedScopes(ctx: AgentCtx): Scope[] {
  return SCOPES_BY_ROLE[ctx.isAdmin ? 'admin' : 'user'];
}

/** 该身份是否被允许调用此工具（工具所需 scope ⊆ 被授予 scope）。 */
export function canUseTool(ctx: AgentCtx, tool: AnyAgentTool): boolean {
  const granted = new Set(grantedScopes(ctx));
  return tool.scopes.every((s) => granted.has(s));
}

/**
 * 不可逆操作是否仍需要本次调用显式确认。
 *   · confirm !== 'irreversible'：永不需要。
 *   · 管理员 + 自动驾驶：放行（只记审计）。
 *   · 否则：需要 input.confirmed === true。
 */
export function needsConfirmation(
  ctx: AgentCtx,
  tool: AnyAgentTool,
  confirmed: boolean,
): boolean {
  if (tool.confirm !== 'irreversible') return false;
  if (ctx.isAdmin && ctx.autopilot) return false;
  return !confirmed;
}
