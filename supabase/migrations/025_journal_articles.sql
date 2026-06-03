-- ============================================================
-- 025_journal_articles.sql —— 资源大厅·期刊（高考数学研究报告：只存元数据 + 外链）
--   规避知网/维普付费墙与版权：不托管全文，仅标题/作者/期号/摘要/原站链接。
--   写入只走服务端 service_role（爬虫 admin client，绕过 RLS）；任何人可读。
--   source_key 唯一 → 爬虫 upsert 去重（同一篇只入一次）。
-- 手动在 Supabase SQL Editor 运行。幂等，可重复 Run。依赖 010_forum.sql 的 profiles + trigger_set_updated_at()。
-- ============================================================

CREATE TABLE IF NOT EXISTS public.journal_articles (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title         TEXT NOT NULL,
  authors       TEXT[] NOT NULL DEFAULT '{}',
  journal_name  TEXT,                              -- 如「数学通报」「中学数学教学参考」
  issue         TEXT,                              -- 年/期，如「2024 年第 3 期」
  abstract      TEXT,
  source_url    TEXT,                              -- 原站链接（点击跳转阅读）
  published_on  DATE,
  tags          TEXT[] NOT NULL DEFAULT '{}',
  source_key    TEXT UNIQUE,                       -- 爬虫去重键（原文 URL 或哈希）
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.journal_articles IS '高考数学研究报告元数据（外链，不托管全文）';

CREATE INDEX IF NOT EXISTS idx_journal_articles_time
  ON public.journal_articles (published_on DESC NULLS LAST, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_journal_articles_journal
  ON public.journal_articles (journal_name);

ALTER TABLE public.journal_articles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS journal_articles_public_read ON public.journal_articles;
CREATE POLICY journal_articles_public_read ON public.journal_articles
  FOR SELECT USING (TRUE);

-- 写入主要走 service_role（绕过 RLS）；给 admin 显式写策略兜底（手动整理用）。
DROP POLICY IF EXISTS journal_articles_admin_write ON public.journal_articles;
CREATE POLICY journal_articles_admin_write ON public.journal_articles
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));
