-- 补丁：将云端简化 schema 对齐到完整设计版本
-- 在 Supabase 控制台 → SQL Editor 中运行

-- ── 1. 创建缺失的枚举类型（若已存在则跳过）─────────────────────

DO $$ BEGIN
CREATE TYPE question_type AS ENUM ('multiple_choice','fill_in_blank','calculation','proof');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
CREATE TYPE question_status AS ENUM ('draft','published','archived');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── 2. 补全 questions 缺失的列 ────────────────────────────────

ALTER TABLE questions
ADD COLUMN IF NOT EXISTS solution      TEXT             NOT NULL DEFAULT '',
ADD COLUMN IF NOT EXISTS question_type question_type    NOT NULL DEFAULT 'calculation',
ADD COLUMN IF NOT EXISTS status        question_status  NOT NULL DEFAULT 'published',
ADD COLUMN IF NOT EXISTS updated_at    TIMESTAMPTZ      NOT NULL DEFAULT now();

-- ── 3. 补全 topics 缺失的列 ──────────────────────────────────

ALTER TABLE topics
ADD COLUMN IF NOT EXISTS slug        TEXT     NOT NULL DEFAULT '',
ADD COLUMN IF NOT EXISTS description TEXT,
ADD COLUMN IF NOT EXISTS level       SMALLINT NOT NULL DEFAULT 1,
ADD COLUMN IF NOT EXISTS order_index SMALLINT NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS updated_at  TIMESTAMPTZ NOT NULL DEFAULT now();

-- slug 不能重复，若还没有唯一约束则加上
DO $$ BEGIN
ALTER TABLE topics ADD CONSTRAINT topics_slug_unique UNIQUE (slug);
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

-- ── 4. 给现有 topics 行填上 slug（避免唯一约束冲突）───────────

UPDATE topics SET
slug  = LOWER(REGEXP_REPLACE(name, '[^a-zA-Z0-9一-龥]', '-', 'g')),
level = CASE WHEN parent_id IS NULL THEN 1 ELSE 2 END
WHERE slug = '';

-- 若 slug 还有中文字符（PostgreSQL REGEXP 不处理 Unicode 范围），用 id 兜底
UPDATE topics SET slug = 'topic-' || id WHERE slug ~ '[一-龥]' OR slug = '';

-- ── 5. 启用 RLS 公开读策略（若不存在）──────────────────────────

ALTER TABLE questions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
CREATE POLICY "questions_public_read"
  ON questions FOR SELECT USING (status = 'published');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── 6. 刷新 PostgREST schema 缓存 ────────────────────────────

NOTIFY pgrst, 'reload schema';

-- ── 验证结果 ─────────────────────────────────────────────────

SELECT column_name, data_type, udt_name
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'questions'
ORDER BY ordinal_position;
