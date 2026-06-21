-- ============================================================
-- 白板 Canvas（Obsidian Canvas 对标）—— 无限画布上自由摆放卡片并连线。
-- 用于画解题思路图、知识结构图、专题串讲；与手写演算 CanvasScratchpad 互补（那是手写，这是节点图）。
--
-- 单表存整张白板：nodes/edges 全量塞 JSONB（@xyflow/react 的图模型），
-- 节点类型 text(自由文本卡) / note(引用我的笔记)。前端整图防抖自动保存。
--
-- ⚠️ 本项目无 Supabase CLI/psql，需手动在 SQL Editor Run（见 project_supabase_workflow）。
--   未跑时 /canvas 静默降级（列表空、打开报错兜底），其余功能不受影响。
-- ============================================================

CREATE TABLE IF NOT EXISTS public.canvas_documents (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title       TEXT        NOT NULL DEFAULT '未命名白板',
  -- { nodes: XYFlowNode[], edges: XYFlowEdge[] }，整图全量存取。
  data        JSONB       NOT NULL DEFAULT '{"nodes":[],"edges":[]}',
  is_public   BOOLEAN     NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_canvas_documents_user ON public.canvas_documents (user_id, updated_at DESC);

-- updated_at 自动维护（复用 036 已建的触发函数 touch_user_notes_updated_at；
-- 若 036 未跑则此处独立建一个，避免依赖顺序）。
CREATE OR REPLACE FUNCTION public.touch_canvas_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_canvas_updated_at ON public.canvas_documents;
CREATE TRIGGER trg_canvas_updated_at
  BEFORE UPDATE ON public.canvas_documents
  FOR EACH ROW EXECUTE FUNCTION public.touch_canvas_updated_at();

-- ── RLS：本人全权；公开白板任何人可只读 ──
ALTER TABLE public.canvas_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own canvas full access" ON public.canvas_documents FOR ALL
  USING      (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "public canvas read" ON public.canvas_documents FOR SELECT
  USING (is_public = true);
