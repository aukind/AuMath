-- 004: Add type and grade fields to papers table
--
-- type: 'real' (高考真题) | 'mock' (模拟题), default 'real' for all existing rows
-- grade: 'high_school_1' | 'high_school_2' | 'high_school_3', only for mock papers

ALTER TABLE papers
  ADD COLUMN IF NOT EXISTS type  TEXT NOT NULL DEFAULT 'real',
  ADD COLUMN IF NOT EXISTS grade TEXT;

ALTER TABLE papers
  ADD CONSTRAINT papers_type_check
    CHECK (type IN ('real', 'mock')),
  ADD CONSTRAINT papers_grade_check
    CHECK (grade IS NULL OR grade IN ('high_school_1', 'high_school_2', 'high_school_3'));

CREATE INDEX IF NOT EXISTS idx_papers_type       ON papers (type);
CREATE INDEX IF NOT EXISTS idx_papers_type_grade ON papers (type, grade);
