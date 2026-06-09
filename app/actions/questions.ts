'use server';

import { revalidatePath, revalidateTag, unstable_cache } from 'next/cache';
import { createClient as createSupabaseJsClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAdminUser } from '@/lib/utils/auth';
import { isMultiAnswer } from '@/lib/questions/content';

/** 无 cookie 的匿名只读客户端，专供 unstable_cache 缓存公共数据（试卷/分类，RLS 公开可读）。
 *  unstable_cache 内不能访问 cookies/headers，故不能用 server.ts 的 createClient。
 *  公共环境变量必定存在，不会失败。 */
function createPublicClient() {
  return createSupabaseJsClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } },
  );
}
import type { QuestionWithTopics, QuestionWithNumber, PaperRow, TopicWithChildren, TopicRow, QuestionType, Difficulty, QuestionStatus, InteractiveSandboxConfig } from '@/types/database';

// ── 录题 ─────────────────────────────────────────────────────

export interface CreateQuestionInput {
  content: string;
  answer: string;
  analysis: string;
  question_type: QuestionType;
  /** 已退役：难度改为群众评分（question_difficulty_ratings）。新建题默认 3，编辑时不再改它。 */
  difficulty?: Difficulty;
  year: number | null;
  source: string | null;
  topic_ids: string[];
  status: QuestionStatus;
  interactive_sandbox?: InteractiveSandboxConfig | null;
  /** 选择题选项（每项形如 "A. ..."，标签写在字符串里，与录题入库格式一致）。非选择题留空。 */
  options?: string[] | null;
  /** 选择题子类型：单选/多选。仅选择题有意义，存入 metadata.choice_type。 */
  choice_type?: 'single' | 'multi' | null;
}

/** 把存储里的 metadata.options（数组或 {A,B,..} 对象）规整为可编辑的字符串数组。 */
function optionsToStringArray(raw: unknown): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw === 'object')
    return Object.entries(raw as Record<string, unknown>).map(([k, v]) => `${k}. ${v}`);
  return [];
}

/** 清洗待保存的选项：去首尾空白、丢弃空项。 */
function cleanOptions(options: string[] | null | undefined): string[] {
  return (options ?? []).map(s => s.trim()).filter(Boolean);
}

export async function createQuestion(
  input: CreateQuestionInput,
): Promise<{ success: boolean; error?: string; id?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: '请先登录' };

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return { success: false, error: '服务端配置错误：缺少 SUPABASE_SERVICE_ROLE_KEY' };
  }

  const asAdmin = isAdminUser(user);

  const opts = cleanOptions(input.options);
  const metadata: Record<string, unknown> = {};
  if (opts.length) {
    metadata.options = opts;
    metadata.choice_type = input.choice_type === 'multi' ? 'multi' : 'single';
  }
  const { data, error } = await admin
    .from('questions')
    .insert({
      content:             input.content,
      answer:              input.answer,
      analysis:            input.analysis,
      question_type:       input.question_type,
      difficulty:          input.difficulty ?? 3, // 已退役字段，留默认值；展示用群众评分
      year:                input.year,
      source:              input.source,
      status:              input.status,
      is_public:           asAdmin,
      created_by:          user.id,
      interactive_sandbox: input.interactive_sandbox ?? null,
      metadata,
    })
    .select('id')
    .single();

  if (error) return { success: false, error: error.message };

  if (input.topic_ids.length > 0) {
    const { error: relError } = await admin
      .from('question_topic_relations')
      .insert(input.topic_ids.map(tid => ({ question_id: data.id, topic_id: tid })));
    if (relError) return { success: false, error: relError.message };
  }

  revalidatePath('/');
  return { success: true, id: data.id };
}

// ── 查单题（编辑回显用） ──────────────────────────────────────

export interface QuestionForEdit {
  id: string;
  content: string;
  answer: string;
  analysis: string;
  question_type: QuestionType;
  difficulty: Difficulty;
  year: number | null;
  source: string | null;
  status: QuestionStatus;
  topic_ids: string[];
  interactive_sandbox: InteractiveSandboxConfig | null;
  /** 选择题选项（每项形如 "A. ..."），从 metadata.options 规整而来 */
  options: string[];
  /** 选择题子类型：单选/多选，从 metadata.choice_type 回显；缺省按答案字母数兜底 */
  choice_type: 'single' | 'multi';
}

export async function getQuestionById(id: string): Promise<QuestionForEdit | null> {
  let supabase;
  try { supabase = createAdminClient(); } catch { return null; }

  const { data, error } = await supabase
    .from('questions')
    .select('id, content, answer, analysis, question_type, difficulty, year, source, status, metadata, interactive_sandbox, question_topic_relations(topic_id)')
    .eq('id', id)
    .maybeSingle();

  if (error || !data) return null;

  return {
    id:                  data.id,
    content:             data.content,
    answer:              data.answer,
    analysis:            (data as any).analysis ?? '',
    question_type:       (data as any).question_type ?? 'calculation',
    difficulty:          data.difficulty as Difficulty,
    year:                data.year ?? null,
    source:              data.source ?? null,
    status:              (data as any).status ?? 'published',
    topic_ids:           ((data as any).question_topic_relations ?? []).map((r: any) => r.topic_id),
    interactive_sandbox: ((data as any).interactive_sandbox ?? null) as InteractiveSandboxConfig | null,
    options:             optionsToStringArray((data as any).metadata?.options),
    choice_type:         (data as any).metadata?.choice_type === 'multi' || isMultiAnswer((data as any).answer ?? '')
                           ? 'multi' : 'single',
  };
}

// ── 更新题目 ──────────────────────────────────────────────────

export async function updateQuestion(
  id: string,
  input: CreateQuestionInput,
): Promise<{ success: boolean; error?: string }> {
  let supabase;
  try { supabase = createAdminClient(); } catch {
    return { success: false, error: '服务端配置错误：缺少 SUPABASE_SERVICE_ROLE_KEY' };
  }

  // 合并 metadata：保留既有的 tags/exam_number 等键，只覆写 options。
  const { data: existing } = await supabase
    .from('questions').select('metadata').eq('id', id).maybeSingle();
  const metadata: Record<string, unknown> = { ...((existing as any)?.metadata ?? {}) };
  const opts = cleanOptions(input.options);
  if (opts.length) {
    metadata.options = opts;
    metadata.choice_type = input.choice_type === 'multi' ? 'multi' : 'single';
  } else {
    delete metadata.options;
    delete metadata.choice_type;
  }

  // 注意：不再更新 difficulty（已退役为群众评分），保留数据库原值。
  const { error } = await supabase
    .from('questions')
    .update({
      content:             input.content,
      answer:              input.answer,
      analysis:            input.analysis,
      question_type:       input.question_type,
      year:                input.year,
      source:              input.source,
      status:              input.status,
      interactive_sandbox: input.interactive_sandbox ?? null,
      metadata,
    })
    .eq('id', id);

  if (error) return { success: false, error: error.message };

  // 先删旧关联，再写新关联
  await supabase.from('question_topic_relations').delete().eq('question_id', id);

  if (input.topic_ids.length > 0) {
    const { error: relError } = await supabase
      .from('question_topic_relations')
      .insert(input.topic_ids.map(tid => ({ question_id: id, topic_id: tid })));
    if (relError) return { success: false, error: relError.message };
  }

  revalidatePath('/');
  revalidatePath(`/admin/edit/${id}`);
  return { success: true };
}

export type SortOrder = 'difficulty_asc' | 'difficulty_desc' | 'updated_at_desc';
export type BankView  = 'public' | 'private';

export async function getQuestions(
  topicId?: string,
  sort: SortOrder = 'updated_at_desc',
  limit = 20,
  bankView: BankView = 'public',
): Promise<QuestionWithTopics[]> {
  let supabase;
  try {
    supabase = await createClient();
  } catch {
    return [];
  }

  // 私人题库：只返回当前用户自己录入的私有题目
  if (bankView === 'private') {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const { data, error } = await supabase
      .from('questions')
      .select('*, question_topic_relations(question_id, topic_id, topics(*))')
      .eq('is_public', false)
      .eq('created_by', user.id)
      .order('updated_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('[getQuestions/private]', error.message);
      return [];
    }
    return (data ?? []) as unknown as QuestionWithTopics[];
  }

  // 公共题库：先从关联表查出所有 question_id，再精确查 questions
  let matchingIds: string[] | null = null;
  if (topicId) {
    const { data: rels, error: relErr } = await supabase
      .from('question_topic_relations')
      .select('question_id')
      .eq('topic_id', topicId);
    if (relErr) {
      console.error('[getQuestions] topic relations lookup:', relErr.message);
      return [];
    }
    matchingIds = (rels ?? []).map((r: { question_id: string }) => r.question_id);
    if (matchingIds.length === 0) return [];
  }

  let query = supabase
    .from('questions')
    .select('*, question_topic_relations(question_id, topic_id, topics(*))')
    .eq('status', 'published')
    .eq('is_public', true)
    .limit(matchingIds ? 200 : limit);

  if (matchingIds) {
    query = query.in('id', matchingIds);
  }

  switch (sort) {
    // 难度排序改用群众评分均值 rating_avg（迁移 014 后存在）；nullsFirst:false 让未评分的排末尾。
    case 'difficulty_asc':
      query = query.order('rating_avg', { ascending: true, nullsFirst: false });
      break;
    case 'difficulty_desc':
      query = query.order('rating_avg', { ascending: false, nullsFirst: false });
      break;
    default:
      query = query.order('updated_at', { ascending: false });
  }

  const { data, error } = await query;

  if (error) {
    console.error('[getQuestions]', error.message);
    return [];
  }

  return (data ?? []) as unknown as QuestionWithTopics[];
}

function buildTopicTree(flat: TopicRow[]): TopicWithChildren[] {
  const map = new Map<string, TopicWithChildren>();
  for (const t of flat) map.set(t.id, { ...t, children: [] });

  const roots: TopicWithChildren[] = [];
  for (const node of map.values()) {
    if (node.parent_id && map.has(node.parent_id)) {
      map.get(node.parent_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  const sortNodes = (nodes: TopicWithChildren[]) => {
    nodes.sort((a, b) => ((a as any).sort_order ?? a.order_index) - ((b as any).sort_order ?? b.order_index));
    nodes.forEach(n => sortNodes(n.children));
  };
  sortNodes(roots);

  return roots;
}

// 题目分类树 —— 与用户无关、极少变。用 unstable_cache 缓存，避免每次导航/切卷都重查数据库。
// 失效：tag 'topics'（见各 mutation 处）或 1 小时 TTL 兜底。
const getTopicsCached = unstable_cache(
  async (): Promise<TopicWithChildren[]> => {
    const { data, error } = await createPublicClient()
      .from('topics')
      .select('*')
      .order('order_index', { ascending: true });
    if (error) {
      console.error('[getQuestionTopics]', error.message);
      return [];
    }
    return buildTopicTree((data ?? []) as TopicRow[]);
  },
  ['question-topics'],
  { tags: ['topics'], revalidate: 3600 },
);

export async function getQuestionTopics(): Promise<TopicWithChildren[]> {
  return getTopicsCached();
}

// ── 试卷查询 ──────────────────────────────────────────────────

// 试卷列表（含每卷题数徽章）—— 与用户无关。题数需要翻页扫描整张 paper_questions（可能上千行），
// 是切卷「转圈圈」的主要成本，故用 unstable_cache 缓存；失效靠 tag 'papers' 或 1 小时 TTL。
const getAllPapersCached = unstable_cache(
  async (): Promise<PaperRow[]> => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = createPublicClient() as any;

  // track/region/contest 由 migration 024 引入；select '*' 在迁移前后都不报错（缺列即缺字段）。
  type PaperRaw = { id: string; title: string; year: number | null; type: 'real' | 'mock'; grade: string | null; track?: 'gaokao' | 'competition'; region?: string | null; contest?: string | null; created_at: string; updated_at: string };
  type PqRaw = { paper_id: string };

  // 分页拉全 paper_questions —— Supabase 默认 range 0-999，行数破千后会被悄悄截断，
  // 导致部分试卷在 countMap 里缺失、PaperList 不显示题数徽章。
  async function fetchAllPaperQuestionIds(): Promise<PqRaw[]> {
    const PAGE = 1000;
    const all: PqRaw[] = [];
    for (let offset = 0; ; offset += PAGE) {
      const { data, error } = await sb
        .from('paper_questions')
        .select('paper_id')
        .range(offset, offset + PAGE - 1) as { data: PqRaw[] | null; error: { message: string } | null };
      if (error) {
        console.error('[getPapers] paper_questions page', offset, error.message);
        break;
      }
      if (!data || data.length === 0) break;
      all.push(...data);
      if (data.length < PAGE) break;
    }
    return all;
  }

  const [papersResult, pqRows] = await Promise.all([
    sb.from('papers')
      .select('*')
      .order('year', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false }) as Promise<{ data: PaperRaw[] | null; error: { message: string } | null }>,
    fetchAllPaperQuestionIds(),
  ]);

  if (papersResult.error) {
    console.error('[getPapers]', papersResult.error.message);
    return [];
  }

  const countMap = new Map<string, number>();
  for (const pq of pqRows) {
    countMap.set(pq.paper_id, (countMap.get(pq.paper_id) ?? 0) + 1);
  }

  return (papersResult.data ?? []).map(p => ({
    ...p,
    total_questions: countMap.get(p.id) ?? 0,
  })) as PaperRow[];
  },
  ['papers-list'],
  { tags: ['papers'], revalidate: 3600 },
);

/** 高考题库：仅高考卷（排除竞赛）。migration 024 前所有卷 track 为 undefined → 全部按高考显示。 */
export async function getPapers(): Promise<PaperRow[]> {
  const all = await getAllPapersCached();
  return all.filter(p => p.track !== 'competition');
}

/** 资源大厅·竞赛：仅竞赛卷（track='competition'）。migration 024 前返回空。 */
export async function getCompetitionPapers(): Promise<PaperRow[]> {
  const all = await getAllPapersCached();
  return all.filter(p => p.track === 'competition');
}

export interface PaperQuestionsResult {
  paper: PaperRow | null;
  questions: QuestionWithNumber[];
}

// ── 删除题目 ──────────────────────────────────────────────────

export async function deleteQuestion(
  id: string,
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: '未授权' };

  let admin;
  try { admin = createAdminClient(); } catch {
    return { success: false, error: '服务端配置错误' };
  }

  // 权限校验：管理员可删任意题；普通用户只能删自己的私有题
  const { data: q } = await admin.from('questions').select('created_by, is_public').eq('id', id).maybeSingle();
  if (!isAdminUser(user)) {
    if (!q || q.is_public || q.created_by !== user.id) {
      return { success: false, error: '无权限删除该题目' };
    }
  }

  await admin.from('question_topic_relations').delete().eq('question_id', id);
  await (admin as any).from('paper_questions').delete().eq('question_id', id);
  const { error } = await admin.from('questions').delete().eq('id', id);
  if (error) return { success: false, error: error.message };

  revalidatePath('/');
  revalidateTag('papers', 'max'); // 删题可能级联减少某卷题数 → 刷新试卷列表缓存（'max' 为 Next16 即时失效写法）
  return { success: true };
}

// ── 拖拽归类：更新题目的知识点 ──────────────────────────────────

export async function updateQuestionCategory(
  questionId: string,
  topicId: string,
  categoryName: string,
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: '未授权' };

  let admin;
  try { admin = createAdminClient(); } catch {
    return { success: false, error: '服务端配置错误' };
  }

  // 权限校验：管理员可改任意题；普通用户只能改自己的私有题
  const { data: existing } = await admin.from('questions').select('created_by, is_public, metadata').eq('id', questionId).maybeSingle();
  if (!isAdminUser(user)) {
    if (!existing || existing.is_public || existing.created_by !== user.id) {
      return { success: false, error: '无权限修改该题目' };
    }
  }

  const metadata = { ...(existing?.metadata as Record<string, unknown> ?? {}), tags: [categoryName] };
  await admin.from('questions').update({ metadata }).eq('id', questionId);

  const { error: delErr } = await admin
    .from('question_topic_relations')
    .delete()
    .eq('question_id', questionId);
  if (delErr) {
    console.error('[updateQuestionCategory] delete:', delErr.message);
    return { success: false, error: `删除旧关联失败：${delErr.message}` };
  }

  const { error: insErr } = await admin
    .from('question_topic_relations')
    .insert({ question_id: questionId, topic_id: topicId });
  if (insErr) {
    console.error('[updateQuestionCategory] insert:', insErr.message);
    return { success: false, error: `写入分类失败：${insErr.message}` };
  }

  revalidatePath('/');
  return { success: true };
}

export async function getQuestionsByPaperId(paperId: string): Promise<PaperQuestionsResult> {
  let supabase;
  try {
    supabase = await createClient();
  } catch {
    return { paper: null, questions: [] };
  }

  const [{ data: paper, error: paperErr }, { data: rows, error: rowsErr }] = await Promise.all([
    supabase
      .from('papers')
      .select('id, title, year, type, grade, created_at, updated_at')
      .eq('id', paperId)
      .maybeSingle(),
    // paper_questions → questions，严格按 question_number ASC 排序
    supabase
      .from('paper_questions')
      .select(`
        question_number,
        questions (
          *,
          question_topic_relations (question_id, topic_id, topics(*))
        )
      `)
      .eq('paper_id', paperId)
      .order('question_number', { ascending: true }),
  ]);

  if (paperErr) {
    console.error('[getQuestionsByPaperId] paper lookup', paperErr.message);
    return { paper: null, questions: [] };
  }

  if (rowsErr) {
    console.error('[getQuestionsByPaperId] questions lookup', rowsErr.message);
    return { paper: paper as PaperRow | null, questions: [] };
  }

  const questions: QuestionWithNumber[] = (rows ?? [])
    .filter((row: any) => row.questions)
    .map((row: any) => ({
      ...(row.questions as QuestionWithTopics),
      question_number: row.question_number as number,
    }));

  return { paper: paper as PaperRow | null, questions };
}
