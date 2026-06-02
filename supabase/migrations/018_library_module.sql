-- ============================================================
-- 018_library_module.sql —— AuMath 资源大厅 (Library)
--   - library_items：官方严选 + 社区 UGC 的 PDF 资料实体
--   - library_item_reports：去重举报明细（同一用户对同一资料只计一次）
--   - RPC：原子自增浏览/下载、原子防并发举报（SECURITY DEFINER）
--   - 触发器：举报数达阈值自动转「待审核」隐藏；updated_at 自动维护
-- 写入加精（is_official=true）走服务端 service_role（admin client，绕过 RLS）。
-- 手动在 Supabase SQL Editor 运行。幂等，可重复 Run。
-- 依赖：010_forum.sql 的 public.profiles（作者关联 + admin 判定）与 trigger_set_updated_at()。
--
-- ⚠️ 需在 Supabase 后台手动完成的配置（SQL 无法代办）：
--   1) 本迁移末段已 upsert 公开 bucket `library-pdfs`（5GB 单文件上限，仅收 application/pdf）+ storage.objects RLS。
--      但 Dashboard → Storage → Settings 的「项目全局单文件上限」也要 ≥5GB（Pro 已设 10GB，OK），否则桶级限额无效。
--   2) 为该 bucket 开启 CORS，允许生产源 https://aumath.com（及本地 http://localhost:3000）跨域。
--   3) 暴露 Range 相关响应头（PDF.js 分块「秒开」依赖 HTTP Range 请求）：
--        Access-Control-Expose-Headers: Range, Content-Range, Accept-Ranges, Content-Length
--      并允许请求头 Range。否则大文件首屏会退化为整文件下载、移动端易 OOM。
--
-- 大文件（≤5GB）说明：上传走浏览器 tus-js-client 断点续传直传 Storage（用户自己的 token，受下方
--   storage.objects RLS 约束），文件字节不经 Next 服务端；服务端 finalizeLibraryUpload 只发 Range:0-7
--   复验 %PDF + 落元数据。详见 app/actions/library.ts 与 components/library/LibraryFeed.tsx。
-- ============================================================

-- 1) 主表
CREATE TABLE IF NOT EXISTS public.library_items (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title          TEXT NOT NULL,
  description    TEXT,
  pdf_url        TEXT NOT NULL,                                   -- library-pdfs 公开 URL
  cover_url      TEXT,                                            -- 官方资料专属封面，UGC 通常为 NULL
  author_id      UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  is_official    BOOLEAN NOT NULL DEFAULT FALSE,                  -- true: 官方/已加精；false: UGC
  status         TEXT NOT NULL DEFAULT 'published'
                   CHECK (status IN ('published', 'pending_review', 'hidden')),
  view_count     INTEGER NOT NULL DEFAULT 0,
  download_count INTEGER NOT NULL DEFAULT 0,
  report_count   INTEGER NOT NULL DEFAULT 0,
  tags           TEXT[] NOT NULL DEFAULT '{}',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.library_items             IS '资源大厅 PDF 资料：官方严选 + 社区 UGC';
COMMENT ON COLUMN public.library_items.is_official IS 'true=官方/已加精，进入横向严选区与蓝V；false=UGC';
COMMENT ON COLUMN public.library_items.status      IS 'published=公开流；pending_review=举报达阈值自动隐藏；hidden=人工隐藏';

-- 2) 索引：大厅 feed（按状态/官方/时间）+ 作者维度
CREATE INDEX IF NOT EXISTS idx_library_items_feed   ON public.library_items (status, is_official, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_library_items_author ON public.library_items (author_id);

-- 3) 去重举报明细：同一用户对同一资料至多一条 → report_count 无法被单人刷高
CREATE TABLE IF NOT EXISTS public.library_item_reports (
  item_id     UUID NOT NULL REFERENCES public.library_items(id) ON DELETE CASCADE,
  reporter_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (item_id, reporter_id)
);

-- 4) updated_at 自动维护（复用 010 定义的 trigger_set_updated_at）
DROP TRIGGER IF EXISTS set_library_items_updated_at ON public.library_items;
CREATE TRIGGER set_library_items_updated_at
  BEFORE UPDATE ON public.library_items
  FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();

-- 5) 状态流转触发器：举报数 >= 3 且为 UGC 且仍公开 → 自动转待审核。
--    采用 BEFORE UPDATE OF report_count 直接改 NEW.status：免递归、省一次额外 UPDATE。
CREATE OR REPLACE FUNCTION public.library_autohide() RETURNS TRIGGER
  LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.report_count >= 3 AND NEW.is_official = FALSE AND NEW.status = 'published' THEN
    NEW.status := 'pending_review';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_library_autohide ON public.library_items;
CREATE TRIGGER trg_library_autohide
  BEFORE UPDATE OF report_count ON public.library_items
  FOR EACH ROW EXECUTE FUNCTION public.library_autohide();

-- 6) 原子自增浏览数（SECURITY DEFINER，允许访客计数而无需 UPDATE 权限）
CREATE OR REPLACE FUNCTION public.increment_library_view(p_id UUID)
RETURNS VOID
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  UPDATE public.library_items SET view_count = view_count + 1 WHERE id = p_id;
$$;

-- 7) 原子自增下载数
CREATE OR REPLACE FUNCTION public.increment_library_download(p_id UUID)
RETURNS VOID
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  UPDATE public.library_items SET download_count = download_count + 1 WHERE id = p_id;
$$;

-- 8) 原子防并发/越权举报：
--    · 必须登录（auth.uid() 非空）；
--    · insert ... on conflict do nothing 实现「同人只计一次」；
--    · 仅当确有新行插入时才 report_count + 1（绝不客户端读后 +1）；
--    · 自增触发 trg_library_autohide，达阈值则同一事务内已翻 pending_review；
--    · 返回最新 report_count 与 status，供前端即时反馈。
CREATE OR REPLACE FUNCTION public.report_library_item(p_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid    UUID := auth.uid();
  v_rows   INTEGER;
  v_count  INTEGER;
  v_status TEXT;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'must be authenticated to report';
  END IF;

  INSERT INTO public.library_item_reports (item_id, reporter_id)
  VALUES (p_id, v_uid)
  ON CONFLICT (item_id, reporter_id) DO NOTHING;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows > 0 THEN
    UPDATE public.library_items SET report_count = report_count + 1 WHERE id = p_id;
  END IF;

  SELECT report_count, status INTO v_count, v_status
  FROM public.library_items WHERE id = p_id;

  RETURN jsonb_build_object(
    'report_count', COALESCE(v_count, 0),
    'status',       COALESCE(v_status, 'published')
  );
END $$;

GRANT EXECUTE ON FUNCTION public.increment_library_view(UUID)     TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_library_download(UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.report_library_item(UUID)        TO authenticated;

-- 9) RLS
ALTER TABLE public.library_items        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.library_item_reports ENABLE ROW LEVEL SECURITY;

-- 公开只见 published；作者见自己（含被隐藏的）；admin 全见
DROP POLICY IF EXISTS library_select_public ON public.library_items;
CREATE POLICY library_select_public ON public.library_items
  FOR SELECT
  USING (
    status = 'published'
    OR author_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- 上传：登录用户，强制本人 + UGC + 已发布（加精只能服务端 service_role 改）
DROP POLICY IF EXISTS library_insert_own ON public.library_items;
CREATE POLICY library_insert_own ON public.library_items
  FOR INSERT TO authenticated
  WITH CHECK (author_id = auth.uid() AND is_official = FALSE AND status = 'published');

-- 改：作者改自己 / admin 全权
DROP POLICY IF EXISTS library_update_owner_or_admin ON public.library_items;
CREATE POLICY library_update_owner_or_admin ON public.library_items
  FOR UPDATE TO authenticated
  USING (author_id = auth.uid() OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (author_id = auth.uid() OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- 删：作者删自己 / admin 全权
DROP POLICY IF EXISTS library_delete_owner_or_admin ON public.library_items;
CREATE POLICY library_delete_owner_or_admin ON public.library_items
  FOR DELETE TO authenticated
  USING (author_id = auth.uid() OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- 举报明细：仅经 SECURITY DEFINER RPC 写入（无需 INSERT 策略）；admin 可读做审计
DROP POLICY IF EXISTS library_reports_admin_read ON public.library_item_reports;
CREATE POLICY library_reports_admin_read ON public.library_item_reports
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- ============================================================
-- 10) Storage：bucket + storage.objects RLS（支撑 tus 浏览器直传 ≤5GB）
--    tus 续传需 bucket 预先存在；用户用自己 token 直传，故必须给 storage.objects 配 RLS。
-- ============================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('library-pdfs', 'library-pdfs', TRUE, 5368709120, ARRAY['application/pdf'])  -- 5GB = 5*1024^3
ON CONFLICT (id) DO UPDATE
  SET public = TRUE,
      file_size_limit = 5368709120,
      allowed_mime_types = ARRAY['application/pdf'];

-- 上传：登录用户只能写到「自己 uid 前缀」的目录（objectName 形如 {uid}/{uuid}.pdf）
DROP POLICY IF EXISTS library_pdfs_insert_own ON storage.objects;
CREATE POLICY library_pdfs_insert_own ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'library-pdfs'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- 读：公开桶，公开可读（PDF.js Range 取数）
DROP POLICY IF EXISTS library_pdfs_public_read ON storage.objects;
CREATE POLICY library_pdfs_public_read ON storage.objects
  FOR SELECT
  USING (bucket_id = 'library-pdfs');

-- 删：本人目录 / admin（finalize 校验失败删对象、用户撤稿、管理清理）
DROP POLICY IF EXISTS library_pdfs_delete_own ON storage.objects;
CREATE POLICY library_pdfs_delete_own ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'library-pdfs'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    )
  );
