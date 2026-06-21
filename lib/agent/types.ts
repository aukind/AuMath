import type { z } from 'zod';

/**
 * 能力域：工具按需要的 scope 声明自己，用户身份解析出被授予的 scope，
 * 二者求交集决定放行。详见 lib/agent/permissions.ts。
 */
export type Scope =
  | 'read'       // 搜题、读题、读图谱、读收藏（公开/本人可见范围）
  | 'write'      // 录题、打标、收藏（可逆写）
  | 'moderate'   // 改/删任意用户内容（暂留作扩展）
  | 'admin'      // 批量回填、跑管线、改全局配置
  | 'dangerous'; // 删除、批量改写等不可逆操作

/** 不可逆操作的确认策略。 */
export type ConfirmPolicy =
  | 'never'         // 读 + 可逆写：直接执行
  | 'irreversible'; // 删除/批量：需 confirmed=true，或管理员自动驾驶放行

/** 工具运行上下文：由请求身份解析而来，工具内部据此再走各自 action 的权限校验。 */
export interface AgentCtx {
  userId: string;
  isAdmin: boolean;
  /** 仅管理员可开：irreversible 操作降级为「只记审计、不要求确认」。 */
  autopilot: boolean;
  /** 调用来源，写入审计。 */
  surface: 'panel' | 'mcp';
}

/** 工具执行结果：判别联合，永不 throw（脱敏，对齐 project_interaction_conventions）。 */
export type ToolResult =
  | { status: 'ok'; data: unknown }
  | { status: 'error'; error: string }
  | { status: 'denied'; error: string }
  // 不可逆操作未确认：把待执行动作摘要回给 Claude，由其转述用户确认
  | { status: 'needs_confirmation'; summary: string };

export interface AgentTool<S extends z.ZodTypeAny = z.ZodTypeAny> {
  name: string;
  /** 给 Claude 看：写清「什么时候用、会产生什么副作用」。 */
  description: string;
  input: S;
  scopes: Scope[];
  mutates: boolean;
  confirm: ConfirmPolicy;
  run: (input: z.infer<S>, ctx: AgentCtx) => Promise<ToolResult>;
}

/** 异构集合用：擦除入参泛型，避免逆变把不同 schema 的工具排斥在数组之外。 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyAgentTool = AgentTool<z.ZodType<any>>;

/** 定义工具：保留入参 schema 的类型推断（run 形参即 z.infer<S>），同时统一收口为 AnyAgentTool。 */
export function defineTool<S extends z.ZodTypeAny>(t: AgentTool<S>): AnyAgentTool {
  return t as AnyAgentTool;
}
