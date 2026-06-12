'use server';

import { unstable_cache } from 'next/cache';
import { createClient as createSupabaseJsClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import type { GraphDataPayload, GraphNode, GraphLink, NodeStatus } from '@/types/graph';
import type { QuestionWithTopics, QuestionMetadata } from '@/types/database';

/** 无 cookie 匿名只读客户端，专供 unstable_cache（公共底图，RLS 公开可读）。
 *  与 questions.ts 同一约定：缓存上下文里不能访问 cookies/headers。 */
function createPublicClient() {
  return createSupabaseJsClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } },
  );
}

/** 节点上限：力导向图节点过多会卡。超限时降采样，但永远优先保留有个人状态(错题/已掌握)的题。 */
const MAX_QUESTION_NODES = 2000;

// ── 公共底图（与用户无关，可缓存） ─────────────────────────────
interface BaseGraph {
  topics: { id: string; name: string }[];
  /** 仅 published + public 的题目，只带 id 与截断标题，绝不含 LaTeX 正文 */
  questions: { id: string; name: string }[];
  /** question_id → topic_id 连边（跨知识点题会有多条） */
  links: GraphLink[];
}

/** 由 source / year / metadata.exam_number 拼出题目摘要，如「2024上海卷 第21题」。 */
function questionLabel(source: string | null, year: number | null, metadata: QuestionMetadata | null): string {
  const examNo = String(metadata?.exam_number ?? '').trim();
  const head = String(source ?? (year ? year : '')).trim();
  return [head, examNo].filter(Boolean).join(' ') || '题目';
}

// 底图极少变：失效靠 tag 'questions'/'topics'（各 mutation 处）或 5 分钟 TTL 兜底。
const getBaseGraphCached = unstable_cache(
  async (): Promise<BaseGraph> => {
    const sb = createPublicClient();
    const [topicsRes, relsRes, questionsRes] = await Promise.all([
      sb.from('topics').select('id, name'),
      sb.from('question_topic_relations').select('question_id, topic_id'),
      sb.from('questions').select('id, year, source, metadata').eq('status', 'published').eq('is_public', true),
    ]);

    if (topicsRes.error) console.error('[getBaseGraph/topics]', topicsRes.error.message);
    if (relsRes.error) console.error('[getBaseGraph/rels]', relsRes.error.message);
    if (questionsRes.error) console.error('[getBaseGraph/questions]', questionsRes.error.message);

    const topicRows = (topicsRes.data ?? []) as { id: string; name: string }[];
    const qRows = (questionsRes.data ?? []) as { id: string; year: number | null; source: string | null; metadata: QuestionMetadata | null }[];
    const relRows = (relsRes.data ?? []) as { question_id: string; topic_id: string }[];

    const topicIds = new Set(topicRows.map(t => t.id));
    const qIds = new Set(qRows.map(q => q.id));

    // 只保留两端都存在（题已发布、知识点存在）的连边，避免悬挂引用。
    const links: GraphLink[] = relRows
      .filter(r => qIds.has(r.question_id) && topicIds.has(r.topic_id))
      .map(r => ({ source: r.question_id, target: r.topic_id }));

    return {
      topics: topicRows,
      questions: qRows.map(q => ({ id: q.id, name: questionLabel(q.source, q.year, q.metadata) })),
      links,
    };
  },
  ['knowledge-graph-base'],
  { tags: ['questions', 'topics'], revalidate: 300 },
);

/** 等概率洗牌（Fisher–Yates），用于未做题降采样。 */
function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * 获取全站图谱，并按当前登录用户的 user_errors / user_question_attempts 计算 status。
 * 公共底图走缓存；个人染色层每次现算；超节点上限时降采样（保留全部错题/已掌握）。
 */
export async function getPersonalizedGraphData(): Promise<GraphDataPayload> {
  const base = await getBaseGraphCached();

  // ── 个人覆盖层（不缓存） ──
  const errorSet = new Set<string>();
  const masteredSet = new Set<string>();
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const [errRes, masRes] = await Promise.all([
        supabase.from('user_errors').select('question_id').eq('user_id', user.id),
        supabase.from('user_question_attempts').select('question_id').eq('user_id', user.id).gt('correct_count', 0),
      ]);
      for (const r of errRes.data ?? []) errorSet.add(r.question_id);
      for (const r of masRes.data ?? []) masteredSet.add(r.question_id);
    }
  } catch {
    // 未登录或鉴权失败：全部按未做处理，仍可看全站星图。
  }

  const statusOf = (id: string): NodeStatus =>
    errorSet.has(id) ? 'error_prone' : masteredSet.has(id) ? 'mastered' : 'unattempted';

  // ── 节点上限：保留全部有个人状态的题，未做题随机抽样补足 ──
  let keptQuestions = base.questions;
  if (base.questions.length > MAX_QUESTION_NODES) {
    const relevant = base.questions.filter(q => statusOf(q.id) !== 'unattempted');
    const rest = base.questions.filter(q => statusOf(q.id) === 'unattempted');
    const budget = Math.max(0, MAX_QUESTION_NODES - relevant.length);
    keptQuestions = relevant.concat(shuffle(rest).slice(0, budget));
  }
  const keptIds = new Set(keptQuestions.map(q => q.id));

  // 连边只保留被保留题目的边，并据此统计每个知识点的度数（决定恒星大小、剔除孤立恒星）。
  const links: GraphLink[] = base.links.filter(l => keptIds.has(l.source));
  const topicDegree = new Map<string, number>();
  for (const l of links) topicDegree.set(l.target, (topicDegree.get(l.target) ?? 0) + 1);

  const topicNodes: GraphNode[] = base.topics
    .filter(t => (topicDegree.get(t.id) ?? 0) > 0)
    .map(t => ({
      id: t.id,
      type: 'topic',
      name: t.name,
      // 恒星按所辖题量放大，且恒大于行星。
      val: 6 + Math.log2((topicDegree.get(t.id) ?? 0) + 1) * 2.2,
    }));

  const questionNodes: GraphNode[] = keptQuestions.map(q => ({
    id: q.id,
    type: 'question',
    name: q.name,
    val: 1.4,
    status: statusOf(q.id),
  }));

  return { nodes: [...topicNodes, ...questionNodes], links };
}

/**
 * 点击节点后抽屉用：按 ID 查单题完整详情 + 当前用户的收藏/错题/评分状态，
 * 供 QuestionCard 直接渲染（此时才取 LaTeX 正文）。
 */
export async function getQuestionForGraph(id: string): Promise<{
  question: QuestionWithTopics;
  isLoggedIn: boolean;
  favorited: boolean;
  errored: boolean;
  myRating: number | null;
} | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: q, error } = await supabase
    .from('questions')
    .select('*, question_topic_relations(question_id, topic_id, topics(*))')
    .eq('id', id)
    .maybeSingle();
  if (error || !q) return null;

  let favorited = false;
  let errored = false;
  let myRating: number | null = null;

  if (user) {
    const [favRes, errRes, ratRes] = await Promise.all([
      supabase.from('user_favorites').select('question_id').eq('user_id', user.id).eq('question_id', id).maybeSingle(),
      supabase.from('user_errors').select('question_id').eq('user_id', user.id).eq('question_id', id).maybeSingle(),
      supabase.from('question_difficulty_ratings').select('rating').eq('user_id', user.id).eq('question_id', id).maybeSingle(),
    ]);
    favorited = !!favRes.data;
    errored = !!errRes.data;
    myRating = ratRes.data?.rating ?? null;
  }

  return {
    question: q as unknown as QuestionWithTopics,
    isLoggedIn: !!user,
    favorited,
    errored,
    myRating,
  };
}
