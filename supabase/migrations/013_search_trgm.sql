-- ============================================================
-- 013_search_trgm.sql —— 全站搜索升级为 pg_trgm 三元组索引
--   - 让题目正文/出处、帖子标题的模糊/子串匹配走 GIN 索引（提速）
--   - 两个排序 RPC 用 similarity() 给相关性排序，仅返回有序 id，应用再水合
-- 依赖 001(questions) / 010(forum_posts)。幂等，可重复 Run。
-- ============================================================

-- pg_trgm：三元组相似度 + 加速 ILIKE/LIKE '%...%'
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- GIN 三元组索引
CREATE INDEX IF NOT EXISTS idx_questions_content_trgm ON public.questions USING gin (content gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_questions_source_trgm  ON public.questions USING gin (source  gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_forum_posts_title_trgm ON public.forum_posts USING gin (title gin_trgm_ops);

-- 题目搜索：公开已发布，正文/出处子串或三元组相似匹配，按相关性倒序，仅返回 id。
-- security invoker（默认）→ 尊重调用者 RLS。
CREATE OR REPLACE FUNCTION public.search_question_ids(q TEXT, lim INT DEFAULT 20)
RETURNS TABLE(id UUID)
LANGUAGE sql
STABLE
AS $$
  SELECT qs.id
  FROM public.questions qs
  WHERE qs.status = 'published'
    AND qs.is_public = TRUE
    AND (
      qs.content ILIKE '%' || q || '%'
      OR COALESCE(qs.source, '') ILIKE '%' || q || '%'
      OR qs.content % q
      OR COALESCE(qs.source, '') % q
    )
  ORDER BY GREATEST(similarity(qs.content, q), similarity(COALESCE(qs.source, ''), q)) DESC
  LIMIT lim;
$$;

-- 帖子搜索：标题子串或三元组相似匹配，按相关性倒序，仅返回 id。
CREATE OR REPLACE FUNCTION public.search_post_ids(q TEXT, lim INT DEFAULT 20)
RETURNS TABLE(id UUID)
LANGUAGE sql
STABLE
AS $$
  SELECT p.id
  FROM public.forum_posts p
  WHERE p.title ILIKE '%' || q || '%'
     OR p.title % q
  ORDER BY similarity(p.title, q) DESC
  LIMIT lim;
$$;
