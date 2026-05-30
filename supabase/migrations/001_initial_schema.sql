-- ============================================================
-- 数学高阶题库 · 初始数据库结构
-- ============================================================

-- ── 枚举类型 ─────────────────────────────────────────────────

CREATE TYPE question_type AS ENUM (
  'multiple_choice',  -- 选择题
  'fill_in_blank',    -- 填空题
  'calculation',      -- 计算/解答题
  'proof'             -- 证明题
);

CREATE TYPE question_status AS ENUM (
  'draft',      -- 草稿（不对外展示）
  'published',  -- 已发布
  'archived'    -- 已归档（历史版本）
);

-- ── 知识点目录表（邻接表，支持无限级分类） ───────────────────

CREATE TABLE topics (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL,
  slug        TEXT        NOT NULL,           -- URL 友好标识，如 "conic-sections"
  description TEXT,
  parent_id   UUID        REFERENCES topics(id) ON DELETE SET NULL,
  level       SMALLINT    NOT NULL DEFAULT 0, -- 0=根节点，1=一级，以此类推
  order_index SMALLINT    NOT NULL DEFAULT 0, -- 同级排序
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT topics_slug_unique UNIQUE (slug),
  CONSTRAINT topics_level_check CHECK (level >= 0 AND level <= 10)
);

COMMENT ON TABLE  topics             IS '知识点目录，使用邻接表实现树状层级。可通过递归CTE遍历整棵树。';
COMMENT ON COLUMN topics.level       IS '节点深度，0=根（如"高中数学"），1=一级专题，2=二级考点。';
COMMENT ON COLUMN topics.order_index IS '同一父节点下的兄弟节点排序权重，值越小越靠前。';

-- ── 题库表 ───────────────────────────────────────────────────

CREATE TABLE questions (
  id            UUID             PRIMARY KEY DEFAULT gen_random_uuid(),

  -- 题目核心内容（Markdown + LaTeX，使用 $...$ 行内公式，$$...$$ 块级公式）
  content       TEXT             NOT NULL,
  answer        TEXT             NOT NULL,    -- 标准答案（可含 LaTeX）
  solution      TEXT             NOT NULL,    -- 详细解析步骤

  -- 分类属性
  question_type question_type    NOT NULL DEFAULT 'calculation',
  difficulty    SMALLINT         NOT NULL DEFAULT 3,  -- 1(易)~5(极难)
  year          SMALLINT,                             -- 出题年份，如 2023
  source        TEXT,                                 -- 来源，如"全国甲卷"、"北京卷"

  -- 状态管理
  status        question_status  NOT NULL DEFAULT 'draft',

  -- ── JSONB 扩展字段 ──────────────────────────────────────
  --
  -- variations: 变式题数组，每条变式与原题同构但改变参数/条件/问法。
  -- 结构示例：
  -- [
  --   {
  --     "id":         "本地唯一ID（UUID字符串）",
  --     "content":    "变式题目（Markdown+LaTeX）",
  --     "answer":     "变式答案",
  --     "solution":   "变式解析（可选）",
  --     "difficulty": 4,
  --     "hint":       "解题提示（可选）"
  --   }
  -- ]
  variations    JSONB            NOT NULL DEFAULT '[]'::JSONB,

  -- metadata: 预留扩展字段，存储非结构化的补充信息。
  -- 结构示例：
  -- {
  --   "exam_number":        "第12题",
  --   "score":              12,
  --   "time_limit_minutes": 15,
  --   "tags":               ["韦达定理", "判别式"],
  --   "common_mistakes":    ["忽略椭圆焦点限制"],
  --   "related_theorems":   ["韦达定理", "均值不等式"]
  -- }
  metadata      JSONB            NOT NULL DEFAULT '{}'::JSONB,

  created_at    TIMESTAMPTZ      NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ      NOT NULL DEFAULT now(),

  CONSTRAINT questions_difficulty_check CHECK (difficulty BETWEEN 1 AND 5),
  CONSTRAINT questions_year_check       CHECK (year IS NULL OR (year >= 1977 AND year <= 2100)),
  CONSTRAINT questions_variations_check CHECK (jsonb_typeof(variations) = 'array')
);

COMMENT ON TABLE  questions            IS '核心题库，题目内容使用 Markdown + LaTeX 格式。';
COMMENT ON COLUMN questions.content    IS '题目正文。行内公式用 $...$，块级公式用 $$...$$。';
COMMENT ON COLUMN questions.variations IS 'JSONB数组，每个元素是一道变式题，结构见字段注释。';
COMMENT ON COLUMN questions.metadata   IS 'JSONB对象，预留扩展信息，如分值、标签、易错点等。';

-- ── 题目-知识点 多对多关联表 ─────────────────────────────────

CREATE TABLE question_topic_relations (
  question_id UUID        NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  topic_id    UUID        NOT NULL REFERENCES topics(id)    ON DELETE CASCADE,
  is_primary  BOOLEAN     NOT NULL DEFAULT FALSE,  -- 是否为该题的主要考查知识点
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  PRIMARY KEY (question_id, topic_id)
);

COMMENT ON TABLE  question_topic_relations            IS '题目与知识点的多对多关联。一道题可关联多个知识点，is_primary=true表示核心考点。';
COMMENT ON COLUMN question_topic_relations.is_primary IS '主要知识点标记，每道题建议只有一个 is_primary=true 的关联。';

-- ── 索引 ─────────────────────────────────────────────────────

-- topics 树遍历
CREATE INDEX idx_topics_parent_id   ON topics (parent_id);
CREATE INDEX idx_topics_level       ON topics (level);

-- questions 常用筛选维度
CREATE INDEX idx_questions_difficulty ON questions (difficulty);
CREATE INDEX idx_questions_year       ON questions (year);
CREATE INDEX idx_questions_source     ON questions (source);
CREATE INDEX idx_questions_status     ON questions (status);
CREATE INDEX idx_questions_type       ON questions (question_type);

-- JSONB GIN 索引（支持 @>、?、? | 等运算符查询）
CREATE INDEX idx_questions_variations_gin ON questions USING GIN (variations);
CREATE INDEX idx_questions_metadata_gin   ON questions USING GIN (metadata);

-- 关联表反向查找（通过 topic_id 找题目）
CREATE INDEX idx_qtr_topic_id ON question_topic_relations (topic_id);

-- ── updated_at 自动更新触发器 ─────────────────────────────────

CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_topics_updated_at
  BEFORE UPDATE ON topics
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_questions_updated_at
  BEFORE UPDATE ON questions
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ── Row Level Security ────────────────────────────────────────
-- 策略：所有人可读（公开题库），写操作需认证（管理员操作）

ALTER TABLE topics                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE questions                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE question_topic_relations  ENABLE ROW LEVEL SECURITY;

-- 公开读
CREATE POLICY "topics_public_read"
  ON topics FOR SELECT USING (TRUE);

CREATE POLICY "questions_public_read"
  ON questions FOR SELECT USING (status = 'published');

CREATE POLICY "question_topic_relations_public_read"
  ON question_topic_relations FOR SELECT USING (TRUE);

-- 认证用户写（后续可替换为更细粒度的角色控制）
CREATE POLICY "topics_auth_write"
  ON topics FOR ALL
  TO authenticated
  USING (TRUE) WITH CHECK (TRUE);

CREATE POLICY "questions_auth_write"
  ON questions FOR ALL
  TO authenticated
  USING (TRUE) WITH CHECK (TRUE);

CREATE POLICY "question_topic_relations_auth_write"
  ON question_topic_relations FOR ALL
  TO authenticated
  USING (TRUE) WITH CHECK (TRUE);

-- ── 初始化种子数据（知识点目录示例） ─────────────────────────

INSERT INTO topics (id, name, slug, level, order_index) VALUES
  ('00000000-0000-0000-0000-000000000001', '高中数学',   'high-school-math',  0, 0),
  ('00000000-0000-0000-0000-000000000002', '解析几何',   'analytic-geometry',  1, 0),
  ('00000000-0000-0000-0000-000000000003', '导数与微积分','derivatives',        1, 1),
  ('00000000-0000-0000-0000-000000000004', '数列',       'sequences',          1, 2),
  ('00000000-0000-0000-0000-000000000005', '圆锥曲线',   'conic-sections',     2, 0),
  ('00000000-0000-0000-0000-000000000006', '直线与圆',   'line-and-circle',    2, 1),
  ('00000000-0000-0000-0000-000000000007', '椭圆',       'ellipse',            3, 0),
  ('00000000-0000-0000-0000-000000000008', '双曲线',     'hyperbola',          3, 1),
  ('00000000-0000-0000-0000-000000000009', '抛物线',     'parabola',           3, 2)
ON CONFLICT DO NOTHING;

UPDATE topics SET parent_id = '00000000-0000-0000-0000-000000000001'
  WHERE id IN (
    '00000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000003',
    '00000000-0000-0000-0000-000000000004'
  );

UPDATE topics SET parent_id = '00000000-0000-0000-0000-000000000002'
  WHERE id IN (
    '00000000-0000-0000-0000-000000000005',
    '00000000-0000-0000-0000-000000000006'
  );

UPDATE topics SET parent_id = '00000000-0000-0000-0000-000000000005'
  WHERE id IN (
    '00000000-0000-0000-0000-000000000007',
    '00000000-0000-0000-0000-000000000008',
    '00000000-0000-0000-0000-000000000009'
  );
