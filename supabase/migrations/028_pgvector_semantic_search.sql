-- ============================================================
-- 028_pgvector_semantic_search.sql —— 题目语义检索（pgvector）
--   - questions 增 embedding vector(768)（Gemini text-embedding-004 维度）
--   - HNSW 余弦索引，支持「按题意检索」与「找相似题/变式」
--   - 两个 RPC：match_questions（语义搜索）/ find_similar_questions（近邻）
-- 依赖 001(questions)。幂等，可重复 Run。
-- 注意：按本项目 Supabase 工作流，需手动在 SQL Editor Run。
-- ============================================================

-- pgvector：向量类型 + 近邻索引（Pro 内置，无额外计费）
CREATE EXTENSION IF NOT EXISTS vector;

-- 768 维向量列（text-embedding-004）。可空：未回填的旧题为 NULL。
ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS embedding vector(768);

-- HNSW 余弦索引：在线增量、查询快、召回好。库内体量充裕。
CREATE INDEX IF NOT EXISTS idx_questions_embedding_hnsw
  ON public.questions USING hnsw (embedding vector_cosine_ops);

-- ── 语义搜索：给定查询向量，返回公开已发布题的 id + 相似度，按相似度倒序 ──
-- security invoker（默认）→ 尊重调用者 RLS。threshold 为余弦相似度下限（0~1）。
CREATE OR REPLACE FUNCTION public.match_questions(
  query_embedding vector(768),
  match_count INT DEFAULT 20,
  similarity_threshold FLOAT DEFAULT 0.2
)
RETURNS TABLE(id UUID, similarity FLOAT)
LANGUAGE sql
STABLE
AS $$
  SELECT qs.id,
         1 - (qs.embedding <=> query_embedding) AS similarity
  FROM public.questions qs
  WHERE qs.status = 'published'
    AND qs.is_public = TRUE
    AND qs.embedding IS NOT NULL
    AND 1 - (qs.embedding <=> query_embedding) >= similarity_threshold
  ORDER BY qs.embedding <=> query_embedding
  LIMIT match_count;
$$;

-- ── 找相似题/变式：取该题向量找近邻，排除自身 ──
CREATE OR REPLACE FUNCTION public.find_similar_questions(
  p_question_id UUID,
  match_count INT DEFAULT 6
)
RETURNS TABLE(id UUID, similarity FLOAT)
LANGUAGE sql
STABLE
AS $$
  WITH src AS (
    SELECT embedding FROM public.questions WHERE id = p_question_id
  )
  SELECT qs.id,
         1 - (qs.embedding <=> (SELECT embedding FROM src)) AS similarity
  FROM public.questions qs
  WHERE qs.id <> p_question_id
    AND qs.status = 'published'
    AND qs.is_public = TRUE
    AND qs.embedding IS NOT NULL
    AND (SELECT embedding FROM src) IS NOT NULL
  ORDER BY qs.embedding <=> (SELECT embedding FROM src)
  LIMIT match_count;
$$;
