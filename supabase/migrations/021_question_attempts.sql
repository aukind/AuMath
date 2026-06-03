-- ============================================================
-- 作答记录：知识星图「已掌握」染色的数据来源
-- 每用户每题一行的滚动汇总（非流水日志），便于直接判定 mastered。
-- mastered 口径 = correct_count > 0 且不在 user_errors（差集在应用层算）。
-- ============================================================

CREATE TABLE user_question_attempts (
  user_id       UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  question_id   UUID        NOT NULL REFERENCES questions(id)  ON DELETE CASCADE,
  attempt_count INT         NOT NULL DEFAULT 0,
  correct_count INT         NOT NULL DEFAULT 0,
  last_correct  BOOLEAN,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, question_id)
);

-- 部分索引：仅索引「做对过」的行，加速星图 mastered 集合查询
CREATE INDEX idx_uqa_user_correct ON user_question_attempts (user_id) WHERE correct_count > 0;

ALTER TABLE user_question_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own attempts" ON user_question_attempts FOR ALL USING (auth.uid() = user_id);
