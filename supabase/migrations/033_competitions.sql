-- ============================================================
-- 竞赛日历（Competition Calendar）+ 备考倒计时
--
-- 吸收数之谜「考试安排」：把各级数学竞赛/高考/模拟的考试日、报名截止、官网链接
-- 集中成一张表，/calendar 页做倒计时 + 月度日程；面向竞赛拔高人群的「陪伴感」。
-- 与现有模块零耦合（新表 + 新页，不动题库/星图）。
--
-- ⚠️ 本项目无 Supabase CLI/psql，需手动在 SQL Editor Run（见 project_supabase_workflow）。
-- ============================================================

CREATE TABLE IF NOT EXISTS public.competitions (
  id                     UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name                   TEXT        NOT NULL,          -- 全称，如「全国高中数学联赛」
  short_name             TEXT,                          -- 简称，如「高联」
  -- 层级：gaokao 高考 / province 省级 / national 国家级 / international 国际 / mock 模拟 / other
  level                  TEXT        NOT NULL DEFAULT 'other'
                           CHECK (level IN ('gaokao','province','national','international','mock','other')),
  exam_date              DATE        NOT NULL,          -- 考试日（倒计时锚点）
  registration_deadline  DATE,                          -- 报名截止（可空）
  location               TEXT,                          -- 地区 / 线上
  url                    TEXT,                          -- 官网 / 报名链接
  description            TEXT,
  is_featured            BOOLEAN     NOT NULL DEFAULT false,  -- 首屏大倒计时优先展示
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 「即将到来」按考试日升序取
CREATE INDEX IF NOT EXISTS idx_competitions_exam_date ON public.competitions (exam_date);

ALTER TABLE public.competitions ENABLE ROW LEVEL SECURITY;

-- 公共可读；写入仅管理员
CREATE POLICY "competitions public read" ON public.competitions FOR SELECT USING (true);
CREATE POLICY "competitions admin write" ON public.competitions FOR ALL
  USING      (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));
