-- ============================================================
-- 027_user_documents.sql —— 个人 PDF 知识库
--   每用户私有的 PDF 文档收藏：
--     · source='studio' —— LaTeX 工作室编译产物，上传到 library-pdfs 桶 ${uid}/kb/*.pdf；
--     · source='library' —— 资源大厅一键收藏（存引用：library_item_id + 标题/封面/url 快照，不复制文件）；
--     · source='upload' —— 预留：直接上传 PDF。
--   入口并入「我的题库 › 知识库」标签页，复用资源大厅沉浸式阅读器。
-- 手动在 Supabase SQL Editor 运行。幂等，可重复 Run。
-- ============================================================

CREATE TABLE IF NOT EXISTS public.user_documents (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  source          TEXT NOT NULL DEFAULT 'studio'
                    CHECK (source IN ('studio', 'library', 'upload')),
  pdf_url         TEXT NOT NULL,
  cover_url       TEXT,
  library_item_id UUID REFERENCES public.library_items(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.user_documents IS '个人 PDF 知识库（每用户私有；library 来源存引用快照，studio 来源为自有 Storage 对象）';

-- 知识库列表按收藏时间倒序取
CREATE INDEX IF NOT EXISTS idx_user_documents_user
  ON public.user_documents (user_id, created_at DESC);

-- 同一公共资料只能收藏一次（library 来源去重；studio/upload 的 library_item_id 为 NULL 不受约束）
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_documents_lib
  ON public.user_documents (user_id, library_item_id)
  WHERE library_item_id IS NOT NULL;

ALTER TABLE public.user_documents ENABLE ROW LEVEL SECURITY;

-- owner-only：每用户只能读写自己的知识库（镜像 026/006 策略）
DROP POLICY IF EXISTS user_documents_owner_all ON public.user_documents;
CREATE POLICY user_documents_owner_all ON public.user_documents
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
