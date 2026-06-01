-- ============================================================
-- 017_geometry_figures.sql —— 几何图库（TikZ 导入结果落库 + 近重复复用）
--   - geometry_figures：存 Pipeline A/B 产出的矢量结果（svg/labels/overpic/tikz/inline_svg）
--   - phash：源裁剪图 64-bit 感知哈希（以 BIGINT 存），用于近重复去重复用
--   - match_geometry_phash()：按汉明距离检索相似图，供 Server Action .rpc() 调用
-- 写入只走服务端 service_role（admin client，绕过 RLS）；登录用户可读。
-- 手动在 Supabase SQL Editor 运行。幂等，可重复 Run。
-- 依赖：auth.users（Supabase 内置）、010_forum.sql 的 public.profiles（admin 判定）。
-- ============================================================

-- 1) 主表
CREATE TABLE IF NOT EXISTS public.geometry_figures (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline      TEXT NOT NULL CHECK (pipeline IN ('A', 'B')),
  svg           TEXT,                                   -- Pipeline B 干净矢量底图
  labels        JSONB NOT NULL DEFAULT '[]'::jsonb,     -- [{text,x_percent,y_percent,confidence}]
  overpic_latex TEXT,                                   -- 导出用 overpic 代码（B）
  tikz          TEXT,                                   -- TikZ 源码（A）
  inline_svg    TEXT,                                   -- 标签已烘焙，可直接嵌题库内容
  phash         BIGINT,                                 -- 源裁剪图感知哈希（有符号 64-bit）
  created_by    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.geometry_figures        IS 'TikZ 导入产出的几何矢量图库，支持 phash 近重复复用';
COMMENT ON COLUMN public.geometry_figures.phash  IS '源裁剪图 DCT 感知哈希(64bit)，以有符号 BIGINT 存；汉明距离去重';
COMMENT ON COLUMN public.geometry_figures.inline_svg IS '标签烘焙进 <text> 的自包含 SVG，可直接由 MathRenderer 渲染';

-- 2) 索引：phash 精确命中 + 时间线
CREATE INDEX IF NOT EXISTS idx_geometry_figures_phash      ON public.geometry_figures (phash);
CREATE INDEX IF NOT EXISTS idx_geometry_figures_created_at ON public.geometry_figures (created_at DESC);

-- 3) 近重复检索：按汉明距离升序返回。
--    注意：bit_count 只接受 bit/bytea，不接受 bigint → 先把异或结果 cast 成 bit(64)。
--    负数按二进制补码取位模式，正是汉明距离所需。
CREATE OR REPLACE FUNCTION public.match_geometry_phash(query_phash BIGINT, max_distance INT DEFAULT 5)
RETURNS SETOF public.geometry_figures
LANGUAGE sql
STABLE
AS $$
  SELECT *
  FROM public.geometry_figures
  WHERE phash IS NOT NULL
    AND bit_count((phash # query_phash)::bit(64)) <= max_distance   -- '#' = 按位异或
  ORDER BY bit_count((phash # query_phash)::bit(64)) ASC
  LIMIT 10;
$$;

-- 4) RLS：登录用户可读；写入仅 service_role（admin client）绕过，另给 admin 显式写策略兜底
ALTER TABLE public.geometry_figures ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS geometry_figures_select ON public.geometry_figures;
CREATE POLICY geometry_figures_select ON public.geometry_figures
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS geometry_figures_admin_write ON public.geometry_figures;
CREATE POLICY geometry_figures_admin_write ON public.geometry_figures
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));
