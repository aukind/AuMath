-- ============================================================
-- 029: 点赞单次往返 RPC + 试卷题数聚合
--   手动在 Supabase SQL Editor 运行（本项目无 DDL/CLI 权限）。幂等，可重复 Run。
--
--   1) toggle_comment_vote / toggle_post_vote
--      把原先应用层的「查重 → 写入/删除 → 查作者发通知 → 数总数」4 次串行
--      DB 往返折成 1 次 RPC。SECURITY INVOKER：投票/通知的写入仍走 RLS
--      （user_id/actor_id 必须 = auth.uid()），函数本身不提权。
--      未跑本迁移时应用层自动回退老的多查询路径（见 app/actions/forum.ts）。
--
--   2) paper_question_counts
--      试卷列表的题数徽章原先要分页扫整张 paper_questions（上千行逐行进
--      Node 数数）；改为库内 GROUP BY 一把返回。应用层同样带回退。
-- ============================================================

-- ── 1a. 评论点赞切换：返回 (最新计数, 切换后是否已赞) ─────────
CREATE OR REPLACE FUNCTION public.toggle_comment_vote(p_comment_id UUID)
RETURNS TABLE (upvotes INTEGER, upvoted BOOLEAN)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_uid     UUID := auth.uid();
  v_upvoted BOOLEAN;
  v_author  UUID;
  v_post    UUID;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION '请先登录后再点赞';
  END IF;

  DELETE FROM public.forum_comment_votes
   WHERE comment_id = p_comment_id AND user_id = v_uid;

  IF FOUND THEN
    v_upvoted := FALSE;
  ELSE
    INSERT INTO public.forum_comment_votes (comment_id, user_id)
    VALUES (p_comment_id, v_uid);
    v_upvoted := TRUE;

    -- 新点赞 → 通知被赞评论的作者（自己赞自己不通知；通知失败不影响点赞）
    SELECT c.author_id, c.post_id INTO v_author, v_post
      FROM public.forum_comments c WHERE c.id = p_comment_id;
    IF v_author IS NOT NULL AND v_author <> v_uid THEN
      BEGIN
        INSERT INTO public.notifications (recipient_id, actor_id, type, post_id)
        VALUES (v_author, v_uid, 'like', v_post);
      EXCEPTION WHEN OTHERS THEN
        NULL; -- best-effort，与应用层 notify() 同语义
      END;
    END IF;
  END IF;

  RETURN QUERY
    SELECT count(*)::INTEGER, v_upvoted
      FROM public.forum_comment_votes v
     WHERE v.comment_id = p_comment_id;
END $$;

-- ── 1b. 帖子点赞切换（同构）──────────────────────────────────
CREATE OR REPLACE FUNCTION public.toggle_post_vote(p_post_id UUID)
RETURNS TABLE (upvotes INTEGER, upvoted BOOLEAN)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_uid     UUID := auth.uid();
  v_upvoted BOOLEAN;
  v_author  UUID;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION '请先登录后再点赞';
  END IF;

  DELETE FROM public.forum_post_votes
   WHERE post_id = p_post_id AND user_id = v_uid;

  IF FOUND THEN
    v_upvoted := FALSE;
  ELSE
    INSERT INTO public.forum_post_votes (post_id, user_id)
    VALUES (p_post_id, v_uid);
    v_upvoted := TRUE;

    SELECT p.author_id INTO v_author
      FROM public.forum_posts p WHERE p.id = p_post_id;
    IF v_author IS NOT NULL AND v_author <> v_uid THEN
      BEGIN
        INSERT INTO public.notifications (recipient_id, actor_id, type, post_id)
        VALUES (v_author, v_uid, 'like', p_post_id);
      EXCEPTION WHEN OTHERS THEN
        NULL;
      END;
    END IF;
  END IF;

  RETURN QUERY
    SELECT count(*)::INTEGER, v_upvoted
      FROM public.forum_post_votes v
     WHERE v.post_id = p_post_id;
END $$;

-- 点赞 RPC 仅对登录用户开放（anon 调用在函数内也会被 auth.uid() 拦下，这里双保险）
REVOKE EXECUTE ON FUNCTION public.toggle_comment_vote(UUID) FROM anon;
REVOKE EXECUTE ON FUNCTION public.toggle_post_vote(UUID)    FROM anon;
GRANT  EXECUTE ON FUNCTION public.toggle_comment_vote(UUID) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.toggle_post_vote(UUID)    TO authenticated;

-- ── 2. 试卷题数聚合：一把 GROUP BY 返回全部 (paper_id, 题数) ──
-- SECURITY INVOKER + paper_questions 公开可读 RLS → anon（unstable_cache
-- 里的无 cookie 客户端）可直接调用。
CREATE OR REPLACE FUNCTION public.paper_question_counts()
RETURNS TABLE (paper_id UUID, question_count BIGINT)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT pq.paper_id, count(*)::BIGINT
    FROM public.paper_questions pq
   GROUP BY pq.paper_id;
$$;

GRANT EXECUTE ON FUNCTION public.paper_question_counts() TO anon, authenticated;
