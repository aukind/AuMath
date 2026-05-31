-- ============================================================
-- 011_follows.sql —— 用户关注关系
--   - user_follows  关注边：follower_id 关注 following_id
-- 依赖 010_forum.sql 的 public.profiles 与 public.is_admin()。
-- 幂等，可重复 Run。
-- ============================================================

CREATE TABLE IF NOT EXISTS public.user_follows (
  follower_id  UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  following_id UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (follower_id, following_id),
  CONSTRAINT user_follows_no_self CHECK (follower_id <> following_id)
);

COMMENT ON TABLE public.user_follows IS '用户关注关系：(follower_id) 关注 (following_id)。';

-- 「我关注了谁」「谁关注了我」两向查询各建索引
CREATE INDEX IF NOT EXISTS idx_user_follows_follower  ON public.user_follows (follower_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_follows_following ON public.user_follows (following_id, created_at DESC);

-- ── RLS ──
ALTER TABLE public.user_follows ENABLE ROW LEVEL SECURITY;

-- 公开读：用于展示关注/粉丝数与列表
DROP POLICY IF EXISTS user_follows_public_read ON public.user_follows;
CREATE POLICY user_follows_public_read ON public.user_follows FOR SELECT USING (TRUE);

-- 仅能以自己身份关注他人
DROP POLICY IF EXISTS user_follows_insert ON public.user_follows;
CREATE POLICY user_follows_insert ON public.user_follows FOR INSERT
  TO authenticated WITH CHECK (follower_id = auth.uid());

-- 仅能取消自己发出的关注
DROP POLICY IF EXISTS user_follows_delete ON public.user_follows;
CREATE POLICY user_follows_delete ON public.user_follows FOR DELETE
  TO authenticated USING (follower_id = auth.uid());
