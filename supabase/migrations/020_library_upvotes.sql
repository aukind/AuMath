-- ============================================================
-- 020_library_upvotes.sql —— 资源大厅点赞（Upvote）
--   - library_items.upvote_count：冗余计数列（feed 直读，免 join 聚合）
--   - library_item_upvotes：去重点赞明细（同一用户对同一资料只计一次）
--   - RPC toggle_library_upvote：原子 点/取消（SECURITY DEFINER，DB 层计数，杜绝客户端读后 ±1）
-- 依赖：018_library_module.sql 的 public.library_items；auth.users。
-- 手动在 Supabase SQL Editor 运行。幂等，可重复 Run。
-- 镜像 018 的 report_library_item RPC 与 library_item_reports 表式样。
-- ============================================================

-- 1) 计数列（冗余，feed 直读）
ALTER TABLE public.library_items
  ADD COLUMN IF NOT EXISTS upvote_count INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.library_items.upvote_count IS '点赞数（由 toggle_library_upvote 原子维护，明细见 library_item_upvotes）';

-- 2) 去重点赞明细：复合主键 → 同一用户对同一资料至多一条
CREATE TABLE IF NOT EXISTS public.library_item_upvotes (
  item_id    UUID NOT NULL REFERENCES public.library_items(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (item_id, user_id)
);

-- 反查「我赞过哪些」用（item_id 已被 PK 前缀覆盖）
CREATE INDEX IF NOT EXISTS idx_library_upvotes_user ON public.library_item_upvotes (user_id);

-- 3) 原子 点/取消：
--    · 必须登录（auth.uid() 非空）；
--    · insert ... on conflict do nothing：有新行 → 点赞，upvote_count + 1；
--    · 否则视为已赞 → delete 该行，upvote_count - 1（GREATEST 防负）；
--    · 计数始终在 DB 端推导（绝不客户端读后 ±1）；
--    · 返回最新 upvote_count 与 upvoted，供前端即时反馈。
CREATE OR REPLACE FUNCTION public.toggle_library_upvote(p_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid     UUID := auth.uid();
  v_rows    INTEGER;
  v_upvoted BOOLEAN;
  v_count   INTEGER;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'must be authenticated to upvote';
  END IF;

  INSERT INTO public.library_item_upvotes (item_id, user_id)
  VALUES (p_id, v_uid)
  ON CONFLICT (item_id, user_id) DO NOTHING;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows > 0 THEN
    -- 新增点赞
    UPDATE public.library_items
      SET upvote_count = upvote_count + 1
      WHERE id = p_id
      RETURNING upvote_count INTO v_count;
    v_upvoted := TRUE;
  ELSE
    -- 已赞 → 取消
    DELETE FROM public.library_item_upvotes WHERE item_id = p_id AND user_id = v_uid;
    UPDATE public.library_items
      SET upvote_count = GREATEST(upvote_count - 1, 0)
      WHERE id = p_id
      RETURNING upvote_count INTO v_count;
    v_upvoted := FALSE;
  END IF;

  RETURN jsonb_build_object(
    'upvote_count', COALESCE(v_count, 0),
    'upvoted',      v_upvoted
  );
END $$;

GRANT EXECUTE ON FUNCTION public.toggle_library_upvote(UUID) TO authenticated;

-- 4) RLS：明细写入只走上面的 SECURITY DEFINER RPC（无需 INSERT/DELETE 策略）；
--    仅放开「读自己的赞」，供 getMyLibraryUpvotes 初始填充实心态。
ALTER TABLE public.library_item_upvotes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS library_upvotes_select_own ON public.library_item_upvotes;
CREATE POLICY library_upvotes_select_own ON public.library_item_upvotes
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());
