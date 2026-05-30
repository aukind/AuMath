-- ============================================================
-- 个人工作区：收藏、错题本、浏览历史
-- ============================================================

-- ── 收藏表 ──────────────────────────────────────────────────
CREATE TABLE user_favorites (
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  question_id UUID        NOT NULL REFERENCES questions(id)  ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, question_id)
);
CREATE INDEX idx_user_favorites_user ON user_favorites (user_id, created_at DESC);
ALTER TABLE user_favorites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own favorites" ON user_favorites FOR ALL USING (auth.uid() = user_id);

-- ── 错题本 ──────────────────────────────────────────────────
CREATE TABLE user_errors (
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  question_id UUID        NOT NULL REFERENCES questions(id)  ON DELETE CASCADE,
  wrong_count INT         NOT NULL DEFAULT 1,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, question_id)
);
CREATE INDEX idx_user_errors_user ON user_errors (user_id, updated_at DESC);
ALTER TABLE user_errors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own errors" ON user_errors FOR ALL USING (auth.uid() = user_id);

-- ── 浏览历史（每用户最多 20 条，触发器自动裁剪） ──────────────
CREATE TABLE user_history (
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  question_id UUID        NOT NULL REFERENCES questions(id)  ON DELETE CASCADE,
  viewed_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, question_id)
);
CREATE INDEX idx_user_history_user ON user_history (user_id, viewed_at DESC);
ALTER TABLE user_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own history" ON user_history FOR ALL USING (auth.uid() = user_id);

-- Trigger：每次 upsert 后保留该用户最新 20 条，删除旧记录
CREATE OR REPLACE FUNCTION trim_user_history()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM user_history
  WHERE  user_id = NEW.user_id
    AND  question_id NOT IN (
           SELECT question_id FROM user_history
           WHERE  user_id = NEW.user_id
           ORDER  BY viewed_at DESC
           LIMIT  20
         );
  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_trim_user_history
  AFTER INSERT OR UPDATE ON user_history
  FOR EACH ROW EXECUTE FUNCTION trim_user_history();
