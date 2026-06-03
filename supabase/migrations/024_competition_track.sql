-- ============================================================
-- 024_competition_track.sql —— papers 增加 track/region/contest，竞赛与高考题库分流
--   track   : 'gaokao'(默认) 高考题库 / 'competition' 竞赛（资源大厅→竞赛）
--   region  : 'domestic' 国内 / 'international' 国外（仅竞赛）
--   contest : 赛事名，如 'AMC 12A' / 'IMO' / '全国高中数学联赛'（仅竞赛）
-- 手动在 Supabase SQL Editor 运行。幂等，可重复 Run。依赖 003_papers.sql。
--
-- 配套代码：app/actions/questions.ts 的 getPapers()(只取 track<>'competition')
--           与 getCompetitionPapers()(只取 track='competition')。
-- ============================================================

ALTER TABLE public.papers
  ADD COLUMN IF NOT EXISTS track   TEXT NOT NULL DEFAULT 'gaokao',
  ADD COLUMN IF NOT EXISTS region  TEXT,
  ADD COLUMN IF NOT EXISTS contest TEXT;

ALTER TABLE public.papers DROP CONSTRAINT IF EXISTS papers_track_check;
ALTER TABLE public.papers ADD CONSTRAINT papers_track_check
  CHECK (track IN ('gaokao', 'competition'));

ALTER TABLE public.papers DROP CONSTRAINT IF EXISTS papers_region_check;
ALTER TABLE public.papers ADD CONSTRAINT papers_region_check
  CHECK (region IS NULL OR region IN ('domestic', 'international'));

COMMENT ON COLUMN public.papers.track   IS '题库分流：gaokao=高考题库 / competition=竞赛(资源大厅)';
COMMENT ON COLUMN public.papers.region  IS '竞赛分区：domestic=国内 / international=国外';
COMMENT ON COLUMN public.papers.contest IS '赛事名（仅竞赛），如 AMC 12A / IMO / 全国高中数学联赛';

CREATE INDEX IF NOT EXISTS idx_papers_track ON public.papers (track, region, contest);

-- 把此前 python 爬虫误入「高考真题」的 AMC 卷归位到 竞赛/国外
UPDATE public.papers
   SET track = 'competition', region = 'international', contest = 'AMC 12A'
 WHERE title ILIKE '%AMC%' AND track <> 'competition';
