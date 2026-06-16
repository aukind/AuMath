-- ============================================================
-- 定理库（Theorem Library）联动知识星图
--
-- 定理是区别于「知识点(topics)」「题目(questions)」的第三类节点：它有陈述/证明，
-- 并被题目引用。三张表：
--   theorems                    定理本体（陈述+证明+图示）
--   theorem_topic_relations     定理 → 所属知识点（星图归属边，theorem_topic）
--   theorem_question_relations  定理 → 用到它的题目（星图引用边，theorem_cite）★ 题库×定理库的桥
--
-- 数据由 app/actions/theorems.ts 的 AI 回填铺设（镜像知识点打标管线）；星图侧
-- (app/actions/graph.ts) 把定理作为新节点 + 两类新边读入，迁移未跑时静默降级为空。
--
-- ⚠️ 本项目无 Supabase CLI/psql，需手动在 SQL Editor Run（见 project_supabase_workflow）。
-- ============================================================

CREATE TABLE IF NOT EXISTS public.theorems (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL UNIQUE,        -- [[韦达定理]] 维基链接按 name 命中
  slug        TEXT        NOT NULL UNIQUE,
  statement   TEXT        NOT NULL DEFAULT '',    -- 定理陈述（LaTeX）
  proof       TEXT        NOT NULL DEFAULT '',    -- 证明（LaTeX，可空串）
  figure_url  TEXT,                               -- 可选示意图
  description TEXT,                               -- 一句话简介
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 定理 → 所属知识点（多对多）
CREATE TABLE IF NOT EXISTS public.theorem_topic_relations (
  theorem_id UUID NOT NULL REFERENCES public.theorems(id) ON DELETE CASCADE,
  topic_id   UUID NOT NULL REFERENCES public.topics(id)   ON DELETE CASCADE,
  PRIMARY KEY (theorem_id, topic_id)
);

-- 定理 → 用到它的题目（多对多）——题库与定理库的物理连接
CREATE TABLE IF NOT EXISTS public.theorem_question_relations (
  theorem_id  UUID NOT NULL REFERENCES public.theorems(id)   ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES public.questions(id)  ON DELETE CASCADE,
  PRIMARY KEY (theorem_id, question_id)
);

-- 反向查询：某知识点有哪些定理 / 某题用到哪些定理
CREATE INDEX IF NOT EXISTS idx_ttr_topic    ON public.theorem_topic_relations (topic_id);
CREATE INDEX IF NOT EXISTS idx_tqr_question ON public.theorem_question_relations (question_id);

-- ── RLS：公共可读（星图匿名底图要读）；写入仅管理员（回填实际走 service-role 绕过 RLS） ──
ALTER TABLE public.theorems                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.theorem_topic_relations    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.theorem_question_relations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "theorems public read"     ON public.theorems                   FOR SELECT USING (true);
CREATE POLICY "ttr public read"          ON public.theorem_topic_relations    FOR SELECT USING (true);
CREATE POLICY "tqr public read"          ON public.theorem_question_relations FOR SELECT USING (true);

CREATE POLICY "theorems admin write" ON public.theorems FOR ALL
  USING      (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "ttr admin write" ON public.theorem_topic_relations FOR ALL
  USING      (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "tqr admin write" ON public.theorem_question_relations FOR ALL
  USING      (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));
