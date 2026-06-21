-- ============================================================
-- Claude Agent 审计日志：站内 AI 面板与 MCP server 共用同一张表。
--   每次工具调用（读/写/危险）都落一条，是事后回溯「Claude 改了什么」、
--   排查 prompt injection、做撤销的唯一抓手。即便管理员开了自动驾驶
--   （irreversible 也不弹确认），这条记录仍然照常写。
--
-- 写入路径走 service-role（lib/agent/audit.ts），故 RLS 默认全拒，
-- 仅放开「本人可读自己的审计流水」，管理员经 service-role 读全量。
-- ============================================================

CREATE TABLE agent_audit_logs (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  surface     TEXT        NOT NULL DEFAULT 'panel',  -- 'panel' | 'mcp'
  tool        TEXT        NOT NULL,                  -- 工具名，如 delete_question
  scopes      TEXT[]      NOT NULL DEFAULT '{}',     -- 该工具要求的能力域
  mutates     BOOLEAN     NOT NULL DEFAULT false,    -- 是否写操作
  confirmed   BOOLEAN     NOT NULL DEFAULT false,    -- 不可逆操作是否经过确认/自动驾驶放行
  status      TEXT        NOT NULL,                  -- 'ok' | 'error' | 'denied' | 'needs_confirmation'
  input       JSONB       NOT NULL DEFAULT '{}'::jsonb,
  result      JSONB,                                 -- 结果摘要（截断，避免存整页题面）
  error       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_agent_audit_user ON agent_audit_logs (user_id, created_at DESC);
CREATE INDEX idx_agent_audit_tool ON agent_audit_logs (tool, created_at DESC);

ALTER TABLE agent_audit_logs ENABLE ROW LEVEL SECURITY;
-- 本人可读自己的流水（service-role 写入不受 RLS 限制）
CREATE POLICY "read own audit" ON agent_audit_logs FOR SELECT USING (auth.uid() = user_id);
