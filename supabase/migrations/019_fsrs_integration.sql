-- ============================================================
-- 019_fsrs_integration.sql —— FSRS 智能错题本（间隔重复复习）
--   - user_errors 增 FSRS 记忆参数列（存量行 DEFAULT 回填为「立即到期的 New 卡」）
--   - user_review_logs：复习流水（完整 ts-fsrs ReviewLog，供熟练度热力图 + 未来参数优化器）
--   - RPC submit_fsrs_review：原子提交（UPDATE user_errors + INSERT user_review_logs 同事务）
-- 依赖：006_user_workspace.sql 的 public.user_errors；001 的 public.questions；auth.users。
-- 手动在 Supabase SQL Editor 运行。幂等，可重复 Run。
-- 镜像 020_library_upvotes.sql 的 SECURITY DEFINER RPC 式样。
-- ============================================================

-- ── 1) user_errors 增 FSRS 列 ───────────────────────────────────
-- 全部 ADD COLUMN IF NOT EXISTS + DEFAULT：存量错题自动成为 due=now 的 New 卡，
-- 首次进入复习流即到期可练，markError 无需改动（新行靠列 DEFAULT 即合法）。
ALTER TABLE public.user_errors
  ADD COLUMN IF NOT EXISTS due            TIMESTAMPTZ      NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS stability      DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS difficulty     DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS elapsed_days   DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS scheduled_days DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reps           INTEGER          NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lapses         INTEGER          NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS state          SMALLINT         NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_review    TIMESTAMPTZ;

COMMENT ON COLUMN public.user_errors.due        IS 'FSRS 下次复习时刻（TIMESTAMPTZ 绝对时刻，查询恒按 due <= now()，时区无关）';
COMMENT ON COLUMN public.user_errors.stability  IS 'FSRS 记忆稳定性 S';
COMMENT ON COLUMN public.user_errors.difficulty IS 'FSRS 记忆难度 D(约 1–10)，与 questions.difficulty(题目绝对难度 1–5) 是两回事';
COMMENT ON COLUMN public.user_errors.state      IS 'FSRS 状态：0=New / 1=Learning / 2=Review / 3=Relearning';
COMMENT ON COLUMN public.user_errors.last_review IS 'FSRS 上次复习时刻（New 卡为空）';

-- 今日到期查询：where user_id = me and due <= now()
CREATE INDEX IF NOT EXISTS idx_user_errors_due ON public.user_errors (user_id, due);

-- ── 2) 复习流水表 ───────────────────────────────────────────────
-- 存完整 ts-fsrs ReviewLog（含已弃用的 elapsed_days/last_elapsed_days，便于后续喂优化器），
-- 外加 duration_ms（用户在该题停留/演算时长）。供日后熟练度热力图。
CREATE TABLE IF NOT EXISTS public.user_review_logs (
  id                BIGSERIAL    PRIMARY KEY,
  user_id           UUID         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  question_id       UUID         NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  rating            SMALLINT     NOT NULL,                 -- 1=Again / 2=Hard / 3=Good / 4=Easy
  state             SMALLINT     NOT NULL,                 -- 复习前状态（ReviewLog.state）
  due               TIMESTAMPTZ,                           -- ReviewLog.due（复习前的 due）
  stability         DOUBLE PRECISION,
  difficulty        DOUBLE PRECISION,
  elapsed_days      DOUBLE PRECISION,
  last_elapsed_days DOUBLE PRECISION,
  scheduled_days    DOUBLE PRECISION,
  review            TIMESTAMPTZ  NOT NULL,                 -- 本次复习发生时刻（ReviewLog.review）
  duration_ms       INTEGER      NOT NULL DEFAULT 0,       -- 停留/演算时长
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.user_review_logs IS 'FSRS 复习流水：每次评分一条，存完整 ReviewLog + 演算时长，供熟练度热力图与参数优化';

-- 热力图按 (用户, 复习时刻) 聚合
CREATE INDEX IF NOT EXISTS idx_review_logs_user_time ON public.user_review_logs (user_id, review);

-- ── 3) RLS：只放开「读自己的流水」；写入只走下方 SECURITY DEFINER RPC ──
ALTER TABLE public.user_review_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS review_logs_select_own ON public.user_review_logs;
CREATE POLICY review_logs_select_own ON public.user_review_logs
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- ── 4) 原子提交 RPC ─────────────────────────────────────────────
--    · 必须登录（auth.uid() 非空）；
--    · FSRS 推算在 Node 端（ts-fsrs）完成，本函数只负责「原子落库」：
--        新卡状态 p_card 更新到 user_errors，本次 ReviewLog p_log 插入流水；
--    · 两次写入同一事务 → 原子；用 JSONB 入参避免十几个标量参数；
--    · 返回 next_due 供前端即时反馈。
CREATE OR REPLACE FUNCTION public.submit_fsrs_review(
  p_question_id UUID,
  p_rating      SMALLINT,
  p_duration_ms INTEGER,
  p_card        JSONB,   -- ts-fsrs next().card（Date 已序列化为 ISO 字符串）
  p_log         JSONB    -- ts-fsrs next().log
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'must be authenticated to submit review';
  END IF;

  UPDATE public.user_errors SET
    due            = (p_card->>'due')::timestamptz,
    stability      = (p_card->>'stability')::float8,
    difficulty     = (p_card->>'difficulty')::float8,
    elapsed_days   = (p_card->>'elapsed_days')::float8,
    scheduled_days = (p_card->>'scheduled_days')::float8,
    reps           = (p_card->>'reps')::int,
    lapses         = (p_card->>'lapses')::int,
    state          = (p_card->>'state')::smallint,
    last_review    = NULLIF(p_card->>'last_review', '')::timestamptz,
    updated_at     = now()
  WHERE user_id = v_uid AND question_id = p_question_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'error entry not found for this user/question';
  END IF;

  INSERT INTO public.user_review_logs (
    user_id, question_id, rating, state, due, stability, difficulty,
    elapsed_days, last_elapsed_days, scheduled_days, review, duration_ms
  ) VALUES (
    v_uid,
    p_question_id,
    p_rating,
    (p_log->>'state')::smallint,
    NULLIF(p_log->>'due', '')::timestamptz,
    (p_log->>'stability')::float8,
    (p_log->>'difficulty')::float8,
    (p_log->>'elapsed_days')::float8,
    (p_log->>'last_elapsed_days')::float8,
    (p_log->>'scheduled_days')::float8,
    (p_log->>'review')::timestamptz,
    COALESCE(p_duration_ms, 0)
  );

  RETURN jsonb_build_object('next_due', p_card->>'due');
END $$;

GRANT EXECUTE ON FUNCTION public.submit_fsrs_review(UUID, SMALLINT, INTEGER, JSONB, JSONB) TO authenticated;
