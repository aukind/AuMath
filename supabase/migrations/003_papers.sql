-- ============================================================
-- 试卷表 & 题目-试卷关联表
-- ============================================================

CREATE TABLE papers (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  title      TEXT        NOT NULL,
  year       SMALLINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- question_number: 该题在原卷中的序号，用于强制排序
CREATE TABLE paper_questions (
  paper_id        UUID    NOT NULL REFERENCES papers(id)    ON DELETE CASCADE,
  question_id     UUID    NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  question_number INTEGER NOT NULL,
  PRIMARY KEY (paper_id, question_id)
);

-- 按卷按序高效检索
CREATE INDEX idx_paper_questions_order ON paper_questions (paper_id, question_number ASC);

-- ── RLS ──────────────────────────────────────────────────────

ALTER TABLE papers          ENABLE ROW LEVEL SECURITY;
ALTER TABLE paper_questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "papers_public_read"
  ON papers FOR SELECT USING (TRUE);

CREATE POLICY "paper_questions_public_read"
  ON paper_questions FOR SELECT USING (TRUE);

CREATE POLICY "papers_auth_write"
  ON papers FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);

CREATE POLICY "paper_questions_auth_write"
  ON paper_questions FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);

-- ── 自动更新时间戳 ────────────────────────────────────────────

CREATE TRIGGER set_papers_updated_at
  BEFORE UPDATE ON papers
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
