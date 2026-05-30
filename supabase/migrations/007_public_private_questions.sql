-- ============================================================
-- 个人私域题库支持：为 questions 和 papers 添加归属字段
-- ============================================================

-- ── questions 表 ─────────────────────────────────────────────
ALTER TABLE questions
  ADD COLUMN IF NOT EXISTS is_public  BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS created_by UUID    REFERENCES auth.users(id) ON DELETE SET NULL;

-- ── papers 表 ────────────────────────────────────────────────
ALTER TABLE papers
  ADD COLUMN IF NOT EXISTS is_public  BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS created_by UUID    REFERENCES auth.users(id) ON DELETE SET NULL;

-- ── 性能索引 ─────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_questions_is_public  ON questions (is_public);
CREATE INDEX IF NOT EXISTS idx_questions_created_by ON questions (created_by) WHERE created_by IS NOT NULL;

-- ── 设置管理员角色（将下方 email 替换为实际管理员邮箱后运行）──
-- UPDATE auth.users
--   SET app_metadata = jsonb_set(COALESCE(app_metadata, '{}'), '{role}', '"admin"')
--   WHERE email = 'YOUR_ADMIN_EMAIL_HERE';
