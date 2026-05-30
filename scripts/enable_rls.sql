-- ============================================================
-- RLS 策略升级脚本
-- 在 Supabase 控制台 → SQL Editor 中运行
-- ============================================================

-- ── 1. topics 表 ─────────────────────────────────────────────

ALTER TABLE topics ENABLE ROW LEVEL SECURITY;

-- 删除旧策略（幂等）
DROP POLICY IF EXISTS "topics_public_read"       ON topics;
DROP POLICY IF EXISTS "topics_auth_write"        ON topics;
DROP POLICY IF EXISTS "topics_auth_insert"       ON topics;
DROP POLICY IF EXISTS "topics_auth_update"       ON topics;
DROP POLICY IF EXISTS "topics_auth_delete"       ON topics;

-- 所有人可读
CREATE POLICY "topics_public_read"
  ON topics FOR SELECT
  USING (true);

-- 仅已登录用户可写
CREATE POLICY "topics_auth_insert"
  ON topics FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "topics_auth_update"
  ON topics FOR UPDATE
  TO authenticated
  USING (true) WITH CHECK (true);

CREATE POLICY "topics_auth_delete"
  ON topics FOR DELETE
  TO authenticated
  USING (true);

-- ── 2. questions 表 ──────────────────────────────────────────

ALTER TABLE questions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "questions_public_read"    ON questions;
DROP POLICY IF EXISTS "questions_auth_write"     ON questions;
DROP POLICY IF EXISTS "questions_auth_insert"    ON questions;
DROP POLICY IF EXISTS "questions_auth_update"    ON questions;
DROP POLICY IF EXISTS "questions_auth_delete"    ON questions;

-- 公开读（仅 published 状态）
CREATE POLICY "questions_public_read"
  ON questions FOR SELECT
  USING (status = 'published');

-- 已登录用户可读所有状态（含草稿）
CREATE POLICY "questions_admin_read_all"
  ON questions FOR SELECT
  TO authenticated
  USING (true);

-- 仅已登录用户可写
CREATE POLICY "questions_auth_insert"
  ON questions FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "questions_auth_update"
  ON questions FOR UPDATE
  TO authenticated
  USING (true) WITH CHECK (true);

CREATE POLICY "questions_auth_delete"
  ON questions FOR DELETE
  TO authenticated
  USING (true);

-- ── 3. question_topic_relations 表 ───────────────────────────

ALTER TABLE question_topic_relations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "question_topic_relations_public_read"  ON question_topic_relations;
DROP POLICY IF EXISTS "question_topic_relations_auth_write"   ON question_topic_relations;
DROP POLICY IF EXISTS "qtr_auth_insert"                       ON question_topic_relations;
DROP POLICY IF EXISTS "qtr_auth_delete"                       ON question_topic_relations;

CREATE POLICY "qtr_public_read"
  ON question_topic_relations FOR SELECT
  USING (true);

CREATE POLICY "qtr_auth_insert"
  ON question_topic_relations FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "qtr_auth_delete"
  ON question_topic_relations FOR DELETE
  TO authenticated
  USING (true);

-- ── 4. 刷新 PostgREST schema 缓存 ────────────────────────────

NOTIFY pgrst, 'reload schema';

-- ── 验证结果 ─────────────────────────────────────────────────

SELECT
  schemaname,
  tablename,
  policyname,
  roles,
  cmd,
  qual
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('topics', 'questions', 'question_topic_relations')
ORDER BY tablename, cmd;
