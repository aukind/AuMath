-- ============================================================
-- 论坛帖子互动 · 点赞(公开计数) + 收藏(私有书签)
--   - forum_post_votes      帖子点赞明细（每人每帖一票，公开读用于计数）
--   - forum_post_favorites  帖子收藏明细（私有，仅本人可读）
-- 仿 010_forum.sql 的 forum_comment_votes：复合主键防重复 + RLS。
-- 全文件可重复执行（IF NOT EXISTS / DROP POLICY IF EXISTS）。
-- ============================================================

-- ── 1. 帖子点赞明细（每人每帖仅一票）────────────────────────
CREATE TABLE IF NOT EXISTS public.forum_post_votes (
  post_id    UUID        NOT NULL REFERENCES public.forum_posts(id) ON DELETE CASCADE,
  user_id    UUID        NOT NULL REFERENCES public.profiles(id)   ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);

-- ── 2. 帖子收藏明细（私有书签）──────────────────────────────
CREATE TABLE IF NOT EXISTS public.forum_post_favorites (
  post_id    UUID        NOT NULL REFERENCES public.forum_posts(id) ON DELETE CASCADE,
  user_id    UUID        NOT NULL REFERENCES public.profiles(id)   ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);

-- ── 索引 ─────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_forum_post_votes_post     ON public.forum_post_votes (post_id);
CREATE INDEX IF NOT EXISTS idx_forum_post_favs_user      ON public.forum_post_favorites (user_id, created_at DESC);

-- ============================================================
-- Row Level Security
-- ============================================================
ALTER TABLE public.forum_post_votes     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forum_post_favorites ENABLE ROW LEVEL SECURITY;

-- 点赞：公开读（用于计数）；本人投票 / 撤票
DROP POLICY IF EXISTS forum_post_votes_public_read ON public.forum_post_votes;
CREATE POLICY forum_post_votes_public_read ON public.forum_post_votes FOR SELECT USING (TRUE);
DROP POLICY IF EXISTS forum_post_votes_insert ON public.forum_post_votes;
CREATE POLICY forum_post_votes_insert ON public.forum_post_votes FOR INSERT
  TO authenticated WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS forum_post_votes_delete ON public.forum_post_votes;
CREATE POLICY forum_post_votes_delete ON public.forum_post_votes FOR DELETE
  TO authenticated USING (user_id = auth.uid());

-- 收藏：私有 —— 仅本人可读 / 增 / 删（绝不暴露他人收藏）
DROP POLICY IF EXISTS forum_post_favs_self_read ON public.forum_post_favorites;
CREATE POLICY forum_post_favs_self_read ON public.forum_post_favorites FOR SELECT
  TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS forum_post_favs_insert ON public.forum_post_favorites;
CREATE POLICY forum_post_favs_insert ON public.forum_post_favorites FOR INSERT
  TO authenticated WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS forum_post_favs_delete ON public.forum_post_favorites;
CREATE POLICY forum_post_favs_delete ON public.forum_post_favorites FOR DELETE
  TO authenticated USING (user_id = auth.uid());
