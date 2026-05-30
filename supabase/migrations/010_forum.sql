-- ============================================================
-- 社区论坛模块 · 表结构 / RLS / 触发器
--   - profiles            公开用户档案（论坛展示用户名/头像所必需）
--   - forum_posts         主贴
--   - forum_comments      一级回复（楼）
--   - forum_sub_comments  二级回复（楼中楼，扁平）
--   - forum_comment_votes 点赞明细（防重复点赞）
-- 权限：访客只读；认证用户发帖/回复/点赞；作者改删自己内容；管理员置顶/加精/删帖
-- 全文件可重复执行（IF NOT EXISTS / CREATE OR REPLACE / DROP POLICY IF EXISTS）。
-- ============================================================

-- ── 0. 公开用户档案 ─────────────────────────────────────────
-- auth.users 不对 anon/authenticated 暴露，论坛要展示「谁发的帖」，
-- 必须有一张公开可读的 profiles 表，并在注册时自动建档。

CREATE TABLE IF NOT EXISTS public.profiles (
  id         UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username   TEXT        NOT NULL,
  avatar_url TEXT,
  role       TEXT        NOT NULL DEFAULT 'user',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT profiles_role_check CHECK (role IN ('admin', 'user'))
);

COMMENT ON TABLE public.profiles IS '公开用户档案，论坛展示用户名/头像/角色。id 与 auth.users 一致。';

-- 注册时自动建档：用户名取邮箱 @ 前缀，角色取 app_metadata.role（默认 user）
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, username, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_app_meta_data->>'role', 'user')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 回填存量用户
INSERT INTO public.profiles (id, username, role)
SELECT
  u.id,
  COALESCE(u.raw_user_meta_data->>'username', split_part(u.email, '@', 1)),
  COALESCE(u.raw_app_meta_data->>'role', 'user')
FROM auth.users u
ON CONFLICT (id) DO NOTHING;

-- 管理员判定（SECURITY DEFINER 绕过 RLS，供各表策略复用，避免策略递归）
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
  );
$$;

-- ── 1. 主贴 ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.forum_posts (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  title       TEXT        NOT NULL,
  content     TEXT        NOT NULL,              -- 序列化的 Lexical JSON
  author_id   UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  view_count  INTEGER     NOT NULL DEFAULT 0,
  tags        TEXT[]      NOT NULL DEFAULT '{}',
  is_pinned   BOOLEAN     NOT NULL DEFAULT FALSE,
  is_featured BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT forum_posts_title_len CHECK (char_length(title) BETWEEN 1 AND 200)
);

-- ── 2. 一级回复（楼）─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.forum_comments (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id    UUID        NOT NULL REFERENCES public.forum_posts(id) ON DELETE CASCADE,
  content    TEXT        NOT NULL,
  author_id  UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── 3. 二级回复（楼中楼，扁平挂在一级回复下）────────────────
CREATE TABLE IF NOT EXISTS public.forum_sub_comments (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id        UUID        NOT NULL REFERENCES public.forum_comments(id) ON DELETE CASCADE,
  reply_to_user_id UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
  content          TEXT        NOT NULL,
  author_id        UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── 4. 点赞明细（每人每楼仅一票）────────────────────────────
CREATE TABLE IF NOT EXISTS public.forum_comment_votes (
  comment_id UUID        NOT NULL REFERENCES public.forum_comments(id) ON DELETE CASCADE,
  user_id    UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (comment_id, user_id)
);

-- ── 索引 ─────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_forum_posts_created     ON public.forum_posts (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_forum_posts_tags_gin    ON public.forum_posts USING GIN (tags);
CREATE INDEX IF NOT EXISTS idx_forum_comments_post     ON public.forum_comments (post_id, created_at);
CREATE INDEX IF NOT EXISTS idx_forum_subs_parent       ON public.forum_sub_comments (parent_id, created_at);
CREATE INDEX IF NOT EXISTS idx_forum_votes_comment     ON public.forum_comment_votes (comment_id);

-- ── updated_at 触发器（复用 001 迁移定义的 trigger_set_updated_at）──
DROP TRIGGER IF EXISTS set_profiles_updated_at ON public.profiles;
CREATE TRIGGER set_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

DROP TRIGGER IF EXISTS set_forum_posts_updated_at ON public.forum_posts;
CREATE TRIGGER set_forum_posts_updated_at
  BEFORE UPDATE ON public.forum_posts
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ── 浏览数自增 RPC（SECURITY DEFINER，允许访客计数而无需 UPDATE 权限）──
CREATE OR REPLACE FUNCTION public.increment_post_view(p_post_id UUID)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.forum_posts SET view_count = view_count + 1 WHERE id = p_post_id;
$$;

-- ============================================================
-- Row Level Security
-- ============================================================
ALTER TABLE public.profiles            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forum_posts         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forum_comments      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forum_sub_comments  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forum_comment_votes ENABLE ROW LEVEL SECURITY;

-- profiles：公开读；本人改自己档案
DROP POLICY IF EXISTS profiles_public_read ON public.profiles;
CREATE POLICY profiles_public_read ON public.profiles FOR SELECT USING (TRUE);
DROP POLICY IF EXISTS profiles_self_update ON public.profiles;
CREATE POLICY profiles_self_update ON public.profiles FOR UPDATE
  TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());

-- forum_posts：公开读；登录发帖（必须是本人）；作者或管理员改删
DROP POLICY IF EXISTS forum_posts_public_read ON public.forum_posts;
CREATE POLICY forum_posts_public_read ON public.forum_posts FOR SELECT USING (TRUE);
DROP POLICY IF EXISTS forum_posts_insert ON public.forum_posts;
CREATE POLICY forum_posts_insert ON public.forum_posts FOR INSERT
  TO authenticated WITH CHECK (author_id = auth.uid());
DROP POLICY IF EXISTS forum_posts_update ON public.forum_posts;
CREATE POLICY forum_posts_update ON public.forum_posts FOR UPDATE
  TO authenticated USING (author_id = auth.uid() OR public.is_admin())
  WITH CHECK (author_id = auth.uid() OR public.is_admin());
DROP POLICY IF EXISTS forum_posts_delete ON public.forum_posts;
CREATE POLICY forum_posts_delete ON public.forum_posts FOR DELETE
  TO authenticated USING (author_id = auth.uid() OR public.is_admin());

-- forum_comments：公开读；登录回复（本人）；作者或管理员删
DROP POLICY IF EXISTS forum_comments_public_read ON public.forum_comments;
CREATE POLICY forum_comments_public_read ON public.forum_comments FOR SELECT USING (TRUE);
DROP POLICY IF EXISTS forum_comments_insert ON public.forum_comments;
CREATE POLICY forum_comments_insert ON public.forum_comments FOR INSERT
  TO authenticated WITH CHECK (author_id = auth.uid());
DROP POLICY IF EXISTS forum_comments_delete ON public.forum_comments;
CREATE POLICY forum_comments_delete ON public.forum_comments FOR DELETE
  TO authenticated USING (author_id = auth.uid() OR public.is_admin());

-- forum_sub_comments：公开读；登录回复（本人）；作者或管理员删
DROP POLICY IF EXISTS forum_subs_public_read ON public.forum_sub_comments;
CREATE POLICY forum_subs_public_read ON public.forum_sub_comments FOR SELECT USING (TRUE);
DROP POLICY IF EXISTS forum_subs_insert ON public.forum_sub_comments;
CREATE POLICY forum_subs_insert ON public.forum_sub_comments FOR INSERT
  TO authenticated WITH CHECK (author_id = auth.uid());
DROP POLICY IF EXISTS forum_subs_delete ON public.forum_sub_comments;
CREATE POLICY forum_subs_delete ON public.forum_sub_comments FOR DELETE
  TO authenticated USING (author_id = auth.uid() OR public.is_admin());

-- forum_comment_votes：公开读（用于计数）；本人投票/撤票
DROP POLICY IF EXISTS forum_votes_public_read ON public.forum_comment_votes;
CREATE POLICY forum_votes_public_read ON public.forum_comment_votes FOR SELECT USING (TRUE);
DROP POLICY IF EXISTS forum_votes_insert ON public.forum_comment_votes;
CREATE POLICY forum_votes_insert ON public.forum_comment_votes FOR INSERT
  TO authenticated WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS forum_votes_delete ON public.forum_comment_votes;
CREATE POLICY forum_votes_delete ON public.forum_comment_votes FOR DELETE
  TO authenticated USING (user_id = auth.uid());

-- ── 种子：一条欢迎帖，作者取首个管理员（无则首个用户）──────────
DO $$
DECLARE
  seed_author UUID;
BEGIN
  SELECT id INTO seed_author FROM public.profiles
    ORDER BY (role = 'admin') DESC, created_at ASC LIMIT 1;

  IF seed_author IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.forum_posts) THEN
    INSERT INTO public.forum_posts (title, content, author_id, tags, is_pinned, view_count)
    VALUES (
      '欢迎来到 AuMath 社区讨论区',
      '{"root":{"type":"root","version":1,"direction":"ltr","format":"","indent":0,"children":[{"type":"paragraph","version":1,"children":[{"type":"text","version":1,"format":0,"text":"在这里交流解题思路、分享变式，支持 $LaTeX$ 公式输入。"}]}]}}',
      seed_author,
      ARRAY['公告', '每日一题'],
      TRUE,
      0
    );
  END IF;
END $$;
