'use server';

// 题目语义检索（pgvector）的服务端动作。
//
//   - embedText：调 Gemini text-embedding-004 生成 768 维向量（成本算在 Gemini，非 Supabase 增值项）。
//   - embedQuestion：为单题写入 embedding（录题/改题后调用，尽力而为、失败不致命）。
//   - backfillEmbeddings：管理员批量为存量题补向量（限并发）。
//   - semanticSearchQuestionIds / findSimilarQuestionIds：检索与「相似题」。
//
// 设计原则：迁移 028 未跑 / 无 GEMINI_API_KEY / 调用异常时，全部静默降级为空或 no-op，
// 绝不连累现有 trgm 搜索与录题主流程（沿用 search.ts 的 try/catch 降级风格）。

import { GoogleGenAI } from '@google/genai';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { isAdminUser } from '@/lib/utils/auth';

// gemini-embedding-001：当前 GA 的嵌入模型（text-embedding-004 在该 API 版本已 404）。
// 默认 3072 维，这里用 outputDimensionality=768 对齐 questions.embedding vector(768)。
const EMBED_MODEL = 'gemini-embedding-001';
const EMBED_DIMS = 768;
const EMBED_TIMEOUT_MS = 20_000;

/** 入库文本：正文 + 出处，截断到模型可接受长度。保留公式语义即可，不做激进清洗。 */
function buildEmbeddingInput(content: string, source?: string | null): string {
  const text = [content, source ?? ''].filter(Boolean).join('\n').trim();
  return text.slice(0, 8000);
}

/**
 * 生成一段文本的 768 维向量。
 * @param taskType RETRIEVAL_DOCUMENT（入库）| RETRIEVAL_QUERY（检索），影响向量空间对齐，提升召回。
 * 失败返回 null（无 key / 超时 / 异常）。
 */
export async function embedText(
  text: string,
  taskType: 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY' = 'RETRIEVAL_DOCUMENT',
): Promise<number[] | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || !text.trim()) return null;
  try {
    const ai = new GoogleGenAI({ apiKey, httpOptions: { timeout: EMBED_TIMEOUT_MS } });
    const res = await ai.models.embedContent({
      model: EMBED_MODEL,
      contents: text,
      config: { taskType, outputDimensionality: EMBED_DIMS },
    });
    const values = res.embeddings?.[0]?.values;
    return Array.isArray(values) && values.length ? values : null;
  } catch (e) {
    console.warn('[embedText] 生成失败（已降级）：', (e as Error).message);
    return null;
  }
}

/**
 * 为单题写入 embedding。录题/改题后调用，尽力而为：
 * 无 key / 迁移未跑（embedding 列不存在）/ 异常时静默 no-op，不影响主流程。
 */
export async function embedQuestion(
  questionId: string,
  content: string,
  source?: string | null,
): Promise<void> {
  const vec = await embedText(buildEmbeddingInput(content, source), 'RETRIEVAL_DOCUMENT');
  if (!vec) return;
  try {
    const admin = createAdminClient();
    await admin.from('questions').update({ embedding: vec }).eq('id', questionId);
  } catch (e) {
    console.warn('[embedQuestion] 写入失败（已降级）：', (e as Error).message);
  }
}

/**
 * 管理员批量回填存量题向量。每次处理 batchSize 条 embedding 为空的公开题，
 * 限并发避免触发 Gemini 限流。返回本批处理与成功数；为空表示已全部回填。
 */
export async function backfillEmbeddings(
  batchSize = 50,
): Promise<{ success: boolean; processed: number; embedded: number; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !isAdminUser(user)) {
    return { success: false, processed: 0, embedded: 0, error: '需要管理员权限' };
  }
  if (!process.env.GEMINI_API_KEY) {
    return { success: false, processed: 0, embedded: 0, error: 'GEMINI_API_KEY 未设置' };
  }

  let admin;
  try { admin = createAdminClient(); } catch {
    return { success: false, processed: 0, embedded: 0, error: '缺少 SUPABASE_SERVICE_ROLE_KEY' };
  }

  let rows: { id: string; content: string; source: string | null }[];
  try {
    const { data, error } = await admin
      .from('questions')
      .select('id, content, source')
      .is('embedding', null)
      .eq('status', 'published')
      .eq('is_public', true)
      .limit(batchSize);
    if (error) throw error;
    rows = data ?? [];
  } catch (e) {
    // 迁移 028 未跑时 embedding 列不存在 → 明确提示
    return { success: false, processed: 0, embedded: 0, error: '查询失败（迁移 028 是否已 Run？）：' + (e as Error).message };
  }

  if (!rows.length) return { success: true, processed: 0, embedded: 0 };

  // 限并发 5，逐批生成 + 写入
  let embedded = 0;
  const CONCURRENCY = 5;
  for (let i = 0; i < rows.length; i += CONCURRENCY) {
    const slice = rows.slice(i, i + CONCURRENCY);
    await Promise.all(slice.map(async (r) => {
      const vec = await embedText(buildEmbeddingInput(r.content, r.source), 'RETRIEVAL_DOCUMENT');
      if (!vec) return;
      const { error } = await admin.from('questions').update({ embedding: vec }).eq('id', r.id);
      if (!error) embedded++;
    }));
  }

  return { success: true, processed: rows.length, embedded };
}

/**
 * 语义搜索：把查询文本向量化后调 match_questions RPC，返回按相似度排序的题 id。
 * 任何失败（无向量 / 迁移未跑 / RPC 缺失）返回空数组，由上层回退到 trgm。
 */
export async function semanticSearchQuestionIds(query: string, limit = 20): Promise<string[]> {
  const vec = await embedText(query, 'RETRIEVAL_QUERY');
  if (!vec) return [];
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc('match_questions', {
      query_embedding: vec,
      match_count: limit,
      similarity_threshold: 0.2,
    });
    if (error) throw error;
    return (data ?? []).map((r) => r.id);
  } catch {
    return [];
  }
}

/**
 * 找相似题/变式：调 find_similar_questions RPC，返回近邻题 id（不含自身）。
 * 失败返回空数组。
 */
export async function findSimilarQuestionIds(questionId: string, limit = 6): Promise<string[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc('find_similar_questions', {
      p_question_id: questionId,
      match_count: limit,
    });
    if (error) throw error;
    return (data ?? []).map((r) => r.id);
  } catch {
    return [];
  }
}

export interface SimilarQuestion {
  id: string;
  content: string;
  source: string | null;
}

/**
 * 「相似题」面板用：先取近邻 id，再水合轻量字段（正文 + 出处），保持相似度顺序。
 * 迁移未跑 / 无向量 / 异常时返回空数组（UI 据此提示「暂无」）。
 */
export async function getSimilarQuestions(questionId: string, limit = 6): Promise<SimilarQuestion[]> {
  const ids = await findSimilarQuestionIds(questionId, limit);
  if (!ids.length) return [];
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from('questions')
      .select('id, content, source')
      .in('id', ids);
    const map = new Map((data ?? []).map((r) => [r.id, r]));
    return ids.map((id) => map.get(id)).filter((x): x is SimilarQuestion => !!x);
  } catch {
    return [];
  }
}
