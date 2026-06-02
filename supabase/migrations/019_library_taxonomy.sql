-- ============================================================
-- 019_library_taxonomy.sql —— 资源大厅 分类(类型) + 分级(学段)
--   给 library_items 加两维：resource_type（教材/讲义/…）、edu_stage（初中/高中/…）。
--   供 /library 检索筛选 + 上传表单使用。手动在 SQL Editor 运行，幂等可重复 Run。
--   依赖 018_library_module.sql。
-- ============================================================

ALTER TABLE public.library_items
  ADD COLUMN IF NOT EXISTS resource_type TEXT NOT NULL DEFAULT '其他',
  ADD COLUMN IF NOT EXISTS edu_stage     TEXT NOT NULL DEFAULT '其他';

-- 白名单约束（与 types/library.ts 的 RESOURCE_TYPES / EDU_STAGES 严格对应）
ALTER TABLE public.library_items DROP CONSTRAINT IF EXISTS library_items_resource_type_check;
ALTER TABLE public.library_items ADD CONSTRAINT library_items_resource_type_check
  CHECK (resource_type IN ('教材','讲义','试卷真题','笔记','答案解析','其他'));

ALTER TABLE public.library_items DROP CONSTRAINT IF EXISTS library_items_edu_stage_check;
ALTER TABLE public.library_items ADD CONSTRAINT library_items_edu_stage_check
  CHECK (edu_stage IN ('初中','高中','大学','竞赛','考研','其他'));

COMMENT ON COLUMN public.library_items.resource_type IS '资料类型：教材/讲义/试卷真题/笔记/答案解析/其他';
COMMENT ON COLUMN public.library_items.edu_stage     IS '学段分级：初中/高中/大学/竞赛/考研/其他';

-- 分类筛选索引
CREATE INDEX IF NOT EXISTS idx_library_items_taxonomy
  ON public.library_items (edu_stage, resource_type, created_at DESC);
