import { revalidatePath, revalidateTag } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { isMultiAnswer } from '@/lib/questions/content';
import { classifyKnowledgePoints } from '@/lib/knowledge/classify';
import { linkQuestionsToKnowledgePoints } from '@/lib/knowledge/linker';
import { embedQuestion } from '@/app/actions/embeddings';
import type { CreateQuestionInput, QuestionForEdit } from '@/app/actions/questions';
import type { QuestionMetadata, Difficulty } from '@/types/database';
import type { Json } from '@/types/supabase';
import type { AgentCtx, ToolResult } from './types';

// ── 这一层专供 MCP 路（无 cookie，身份来自令牌）。逻辑镜像 app/actions/questions.ts，
//    但鉴权改为「显式 ctx 身份 + service-role」，不依赖浏览器会话。面板路仍走原 actions。──

function optionsToStringArray(raw: unknown): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw === 'object')
    return Object.entries(raw as Record<string, unknown>).map(([k, v]) => `${k}. ${v}`);
  return [];
}
function cleanOptions(options: string[] | null | undefined): string[] {
  return (options ?? []).map((s) => s.trim()).filter(Boolean);
}

/** 读单题完整内容（管理员读任意；普通用户仅自己录入的）。 */
export async function getQuestion(ctx: AgentCtx, id: string): Promise<ToolResult> {
  let admin;
  try { admin = createAdminClient(); } catch { return { status: 'error', error: '服务端缺少 SUPABASE_SERVICE_ROLE_KEY' }; }

  const { data, error } = await admin
    .from('questions')
    .select('id, content, answer, analysis, question_type, difficulty, year, source, status, metadata, interactive_sandbox, created_by, question_topic_relations(topic_id)')
    .eq('id', id)
    .maybeSingle();
  if (error || !data) return { status: 'error', error: '题目不存在' };
  if (!ctx.isAdmin && data.created_by !== ctx.userId) return { status: 'error', error: '无权访问该题' };

  const metadata = (data.metadata ?? {}) as QuestionMetadata;
  const q: QuestionForEdit = {
    id: data.id,
    content: data.content,
    answer: data.answer,
    analysis: data.analysis,
    question_type: data.question_type,
    difficulty: (data.difficulty ?? 3) as Difficulty,
    year: data.year ?? null,
    source: data.source ?? null,
    status: data.status,
    topic_ids: (data.question_topic_relations ?? []).map((r) => r.topic_id),
    interactive_sandbox: (data.interactive_sandbox ?? null) as QuestionForEdit['interactive_sandbox'],
    options: optionsToStringArray(metadata.options),
    choice_type: metadata.choice_type === 'multi' || isMultiAnswer(data.answer ?? '') ? 'multi' : 'single',
  };
  return { status: 'ok', data: q };
}

/** 录题（service-role，created_by/is_public 取自 ctx 身份）。 */
export async function createQuestion(ctx: AgentCtx, input: CreateQuestionInput): Promise<ToolResult> {
  let admin;
  try { admin = createAdminClient(); } catch { return { status: 'error', error: '服务端缺少 SUPABASE_SERVICE_ROLE_KEY' }; }

  const opts = cleanOptions(input.options);
  const metadata: { [key: string]: Json | undefined } = {};
  if (opts.length) {
    metadata.options = opts;
    metadata.choice_type = input.choice_type === 'multi' ? 'multi' : 'single';
  }

  const { data, error } = await admin
    .from('questions')
    .insert({
      content: input.content,
      answer: input.answer,
      analysis: input.analysis,
      question_type: input.question_type,
      difficulty: input.difficulty ?? 3,
      year: input.year,
      source: input.source,
      status: input.status,
      is_public: ctx.isAdmin,
      created_by: ctx.userId,
      interactive_sandbox: (input.interactive_sandbox ?? null) as unknown as Json,
      metadata,
    })
    .select('id')
    .single();
  if (error || !data) return { status: 'error', error: error?.message ?? '录题失败' };

  // 未手选知识点 → Gemini 自动打标兜底（尽力而为，失败不影响录题）
  if (input.topic_ids.length > 0) {
    await admin.from('question_topic_relations').insert(input.topic_ids.map((tid) => ({ question_id: data.id, topic_id: tid })));
  } else {
    try {
      const classified = await classifyKnowledgePoints([
        { id: data.id, text: `${input.content}\n\n【解析摘要】${input.analysis.slice(0, 1000)}` },
      ]);
      const points = classified.get(data.id);
      if (points?.length) {
        const { linked } = await linkQuestionsToKnowledgePoints(admin, [{ questionId: data.id, points }]);
        if (linked > 0) revalidateTag('topics', 'max');
      }
    } catch { /* 打标失败静默跳过 */ }
  }

  if (ctx.isAdmin) await embedQuestion(data.id, input.content, input.source);
  revalidatePath('/');
  return { status: 'ok', data: { id: data.id } };
}

/** 删题（不可逆，管理员删任意；普通用户仅自己的私题）。 */
export async function deleteQuestion(ctx: AgentCtx, id: string): Promise<ToolResult> {
  let admin;
  try { admin = createAdminClient(); } catch { return { status: 'error', error: '服务端缺少 SUPABASE_SERVICE_ROLE_KEY' }; }

  const { data: q } = await admin.from('questions').select('created_by, is_public').eq('id', id).maybeSingle();
  if (!ctx.isAdmin && (!q || q.is_public || q.created_by !== ctx.userId)) {
    return { status: 'error', error: '无权限删除该题目' };
  }

  await admin.from('question_topic_relations').delete().eq('question_id', id);
  await admin.from('paper_questions').delete().eq('question_id', id);
  const { error } = await admin.from('questions').delete().eq('id', id);
  if (error) return { status: 'error', error: error.message };

  revalidatePath('/');
  revalidateTag('papers', 'max');
  return { status: 'ok', data: { deleted: id } };
}
