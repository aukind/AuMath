-- ============================================================
-- 026_latex_documents.sql —— LaTeX 工作室·云端多文档
--   每用户私有：/studio 的多标签页 + 自动保存的存储层。源码/标题/引擎落库，
--   解决「离开工作室代码丢失」。附件(.sty/图片)不入库，仍按会话临时上传。
-- 手动在 Supabase SQL Editor 运行。幂等，可重复 Run。
--   依赖：001 迁移的 public.trigger_set_updated_at()。
-- ============================================================

CREATE TABLE IF NOT EXISTS public.latex_documents (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title       TEXT NOT NULL DEFAULT '未命名文档',
  content     TEXT NOT NULL DEFAULT '',
  engine      TEXT NOT NULL DEFAULT 'xelatex'
                CHECK (engine IN ('pdflatex', 'xelatex', 'lualatex')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.latex_documents IS 'LaTeX 工作室用户文档（每用户私有，云端多文档/标签页）';

-- 文档列表按最近修改倒序取
CREATE INDEX IF NOT EXISTS idx_latex_documents_user_time
  ON public.latex_documents (user_id, updated_at DESC);

-- updated_at 自动维护（复用 001 迁移定义的 trigger_set_updated_at）
DROP TRIGGER IF EXISTS set_latex_documents_updated_at ON public.latex_documents;
CREATE TRIGGER set_latex_documents_updated_at
  BEFORE UPDATE ON public.latex_documents
  FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();

ALTER TABLE public.latex_documents ENABLE ROW LEVEL SECURITY;

-- owner-only：每用户只能读写自己的文档
DROP POLICY IF EXISTS latex_documents_owner_all ON public.latex_documents;
CREATE POLICY latex_documents_owner_all ON public.latex_documents
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
