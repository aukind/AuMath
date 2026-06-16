-- ============================================================
-- 解题工作台（Solving Canvas）：解题会话流水 + 渐进提示用量
--
-- 一次「打开题目 → 演算 → 自评结果」记一行（append 流水，非滚动汇总）。
-- 与每题汇总 user_question_attempts（迁移 021）互补，定位类比 FSRS 的
-- user_review_logs（迁移 019）：前者答「这题你掌握没」，本表答「你这一次怎么解的」。
--
-- 沉淀用途：
--   ① 卡点复盘：hints_used>0 或 outcome∈(stuck,gave_up) 的题 → 二期知识点热力
--   ② 解题时长分布、独立解出率（outcome=solved 占比）
--   ③ 二期：scratch_url 存演算 PNG；outcome=solved 回写 user_question_attempts/FSRS
--
-- ⚠️ 本项目无 Supabase CLI/psql，需手动在 SQL Editor Run（见 project_supabase_workflow）。
-- ============================================================

CREATE TABLE IF NOT EXISTS public.solving_sessions (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  question_id    UUID        NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,

  -- 渐进提示：max_hint_level=本次最高揭示到第几级（0=没看提示，1..3）；
  -- hints_used=提示请求次数（可 > max_hint_level，例如反复看同一级）。
  max_hint_level SMALLINT    NOT NULL DEFAULT 0 CHECK (max_hint_level BETWEEN 0 AND 3),
  hints_used     SMALLINT    NOT NULL DEFAULT 0 CHECK (hints_used >= 0),

  duration_sec   INT         NOT NULL DEFAULT 0 CHECK (duration_sec >= 0),

  -- 自评结果：solved=独立做出 / hinted=靠提示做出 / stuck=卡住未解 / gave_up=直接看答案
  outcome        TEXT        NOT NULL DEFAULT 'stuck'
                   CHECK (outcome IN ('solved','hinted','stuck','gave_up')),

  note           TEXT,
  scratch_url    TEXT,       -- 二期：演算快照 PNG（暂留空）

  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 「我的解题历史」：按用户 + 时间倒序翻页
CREATE INDEX IF NOT EXISTS idx_solving_sessions_user_time
  ON public.solving_sessions (user_id, created_at DESC);

-- 「某题被卡」聚合（二期卡点热力）：只索引真正卡住/求助的会话
CREATE INDEX IF NOT EXISTS idx_solving_sessions_stuck
  ON public.solving_sessions (question_id)
  WHERE hints_used > 0 OR outcome IN ('stuck','gave_up');

ALTER TABLE public.solving_sessions ENABLE ROW LEVEL SECURITY;

-- 仅本人可读写自己的解题流水
CREATE POLICY "own solving sessions" ON public.solving_sessions
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
