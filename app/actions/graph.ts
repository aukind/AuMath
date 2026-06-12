'use server';

import { unstable_cache, revalidateTag } from 'next/cache';
import { createClient as createSupabaseJsClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { isAdminUser } from '@/lib/utils/auth';
import type {
  GraphDataPayload, GraphNode, GraphLink, NodeStatus,
  TopicInspectorData, RelatedTopicRef,
} from '@/types/graph';
import type { QuestionWithTopics, QuestionMetadata } from '@/types/database';
import type { Database } from '@/types/supabase';

/** 无 cookie 匿名只读客户端，专供 unstable_cache（公共底图，RLS 公开可读）。
 *  与 questions.ts 同一约定：缓存上下文里不能访问 cookies/headers。 */
function createPublicClient() {
  return createSupabaseJsClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } },
  );
}

/** 节点上限：力导向图节点过多会卡。超限时降采样，但永远优先保留有个人状态(错题/已掌握)的题。 */
const MAX_QUESTION_NODES = 2000;

// ── 公共底图（与用户无关，可缓存） ─────────────────────────────
interface BaseTopic {
  id: string;
  name: string;
  parentId: string | null;
  level: number;
  description: string | null;
}

interface BaseGraph {
  topics: BaseTopic[];
  /** 仅 published + public 的题目，只带 id 与截断标题，绝不含 LaTeX 正文 */
  questions: { id: string; name: string }[];
  /** question_id → topic_id 归属边（跨知识点题会有多条） */
  qtLinks: GraphLink[];
  /** 知识点父子边（topics.parent_id 派生） */
  hierarchyLinks: GraphLink[];
  /** 知识点共现边（同题共考，weight=共享题数，隐式双链） */
  cooccurLinks: GraphLink[];
  /** 手动双向链接（topic_links 表；迁移 030 未跑时为空，静默降级） */
  manualLinks: GraphLink[];
}

/** 由 source / year / metadata.exam_number 拼出题目摘要，如「2024上海卷 第21题」。 */
function questionLabel(source: string | null, year: number | null, metadata: QuestionMetadata | null): string {
  const examNo = String(metadata?.exam_number ?? '').trim();
  const head = String(source ?? (year ? year : '')).trim();
  return [head, examNo].filter(Boolean).join(' ') || '题目';
}

/** 无向边规范化 key：与 topic_links 表的 source<target 约定一致。 */
const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

// 底图极少变：失效靠 tag 'questions'/'topics'（各 mutation 处）或 5 分钟 TTL 兜底。
const getBaseGraphCached = unstable_cache(
  async (): Promise<BaseGraph> => {
    const sb = createPublicClient();
    const [topicsRes, relsRes, questionsRes, manualRes] = await Promise.all([
      sb.from('topics').select('id, name, parent_id, level, description'),
      sb.from('question_topic_relations').select('question_id, topic_id'),
      sb.from('questions').select('id, year, source, metadata').eq('status', 'published').eq('is_public', true),
      // 迁移 030 未跑时此查询报错 → 当空数组处理（手动双链层缺席，星图其余功能不受影响）
      sb.from('topic_links').select('source_topic_id, target_topic_id'),
    ]);

    if (topicsRes.error) console.error('[getBaseGraph/topics]', topicsRes.error.message);
    if (relsRes.error) console.error('[getBaseGraph/rels]', relsRes.error.message);
    if (questionsRes.error) console.error('[getBaseGraph/questions]', questionsRes.error.message);

    const topicRows = topicsRes.data ?? [];
    const qRows = (questionsRes.data ?? []) as { id: string; year: number | null; source: string | null; metadata: QuestionMetadata | null }[];
    const relRows = relsRes.data ?? [];

    const topicIds = new Set(topicRows.map(t => t.id));
    const qIds = new Set(qRows.map(q => q.id));

    // 只保留两端都存在（题已发布、知识点存在）的归属边，避免悬挂引用。
    const validRels = relRows.filter(r => qIds.has(r.question_id) && topicIds.has(r.topic_id));
    const qtLinks: GraphLink[] = validRels.map(r => ({ source: r.question_id, target: r.topic_id, kind: 'qt' }));

    // 层级边：父子都在表内才连。
    const hierarchyLinks: GraphLink[] = topicRows
      .filter(t => t.parent_id && topicIds.has(t.parent_id))
      .map(t => ({ source: t.parent_id!, target: t.id, kind: 'hierarchy' }));

    // 共现边：同一道题挂了多个知识点 → 这些知识点两两相连，weight 累计共享题数。
    const byQuestion = new Map<string, string[]>();
    for (const r of validRels) {
      const arr = byQuestion.get(r.question_id);
      if (arr) arr.push(r.topic_id);
      else byQuestion.set(r.question_id, [r.topic_id]);
    }
    const cooccurWeight = new Map<string, number>();
    for (const tids of byQuestion.values()) {
      for (let i = 0; i < tids.length; i++) {
        for (let j = i + 1; j < tids.length; j++) {
          const k = pairKey(tids[i], tids[j]);
          cooccurWeight.set(k, (cooccurWeight.get(k) ?? 0) + 1);
        }
      }
    }
    const cooccurLinks: GraphLink[] = [...cooccurWeight.entries()].map(([k, weight]) => {
      const [source, target] = k.split('|');
      return { source, target, kind: 'cooccur', weight };
    });

    // 手动双链：去掉与共现重复的边没必要（语义不同，前端分层渲染），只过滤悬挂引用。
    const manualLinks: GraphLink[] = (manualRes.error ? [] : manualRes.data ?? [])
      .filter(l => topicIds.has(l.source_topic_id) && topicIds.has(l.target_topic_id))
      .map(l => ({ source: l.source_topic_id, target: l.target_topic_id, kind: 'manual' }));

    return {
      topics: topicRows.map(t => ({
        id: t.id, name: t.name, parentId: t.parent_id, level: t.level, description: t.description,
      })),
      questions: qRows.map(q => ({ id: q.id, name: questionLabel(q.source, q.year, q.metadata) })),
      qtLinks,
      hierarchyLinks,
      cooccurLinks,
      manualLinks,
    };
  },
  ['knowledge-graph-base-v2'],
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

/** 当前用户的错题/已掌握集合（未登录返回空集合，全部按未做处理）。 */
async function getUserStatusSets(): Promise<{ errorSet: Set<string>; masteredSet: Set<string> }> {
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
  return { errorSet, masteredSet };
}

/**
 * 获取全站图谱，并按当前登录用户的 user_errors / user_question_attempts 计算 status。
 * 公共底图走缓存；个人染色层每次现算；超节点上限时降采样（保留全部错题/已掌握）。
 */
export async function getPersonalizedGraphData(): Promise<GraphDataPayload> {
  const base = await getBaseGraphCached();
  const { errorSet, masteredSet } = await getUserStatusSets();

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

  // 归属边只保留被保留题目的边，并据此统计每个知识点的度数（决定恒星大小）。
  const qtLinks = base.qtLinks.filter(l => keptIds.has(l.source));
  const topicDegree = new Map<string, number>();
  for (const l of qtLinks) topicDegree.set(l.target, (topicDegree.get(l.target) ?? 0) + 1);

  // 知识点之间的网状边（层级/共现/手动）全量保留——这是 Obsidian 式知识网的骨架。
  const topicTopicLinks = [...base.hierarchyLinks, ...base.cooccurLinks, ...base.manualLinks];
  const linkedTopicIds = new Set<string>();
  for (const l of topicTopicLinks) {
    linkedTopicIds.add(l.source);
    linkedTopicIds.add(l.target);
  }

  // 知识点节点：有题挂靠或参与任意知识网连边即保留（纯孤儿剔除）。
  const topicNodes: GraphNode[] = base.topics
    .filter(t => (topicDegree.get(t.id) ?? 0) > 0 || linkedTopicIds.has(t.id))
    .map(t => ({
      id: t.id,
      type: 'topic',
      name: t.name,
      level: t.level,
      degree: topicDegree.get(t.id) ?? 0,
      // 恒星按所辖题量放大，且恒大于行星。
      val: 6 + Math.log2((topicDegree.get(t.id) ?? 0) + 1) * 2.2,
    }));
  const keptTopicIds = new Set(topicNodes.map(t => t.id));

  const questionNodes: GraphNode[] = keptQuestions.map(q => ({
    id: q.id,
    type: 'question',
    name: q.name,
    val: 1.4,
    status: statusOf(q.id),
  }));

  return {
    nodes: [...topicNodes, ...questionNodes],
    links: [
      ...topicTopicLinks.filter(l => keptTopicIds.has(l.source) && keptTopicIds.has(l.target)),
      ...qtLinks.filter(l => keptTopicIds.has(l.target)),
    ],
  };
}

// ── 知识点 Inspector：Obsidian 式双向链接面板数据 ─────────────

/**
 * 选中知识点后右侧面板用：层级面包屑 + 子节点 + 双链（手动/共现）+ 反向链接题目列表。
 * 结构数据走缓存底图；题目掌握度按当前用户现算。
 */
export async function getTopicInspector(topicId: string): Promise<TopicInspectorData | null> {
  const base = await getBaseGraphCached();
  const byId = new Map(base.topics.map(t => [t.id, t]));
  const topic = byId.get(topicId);
  if (!topic) return null;

  // 面包屑：沿 parent_id 上溯到根（防御环：步数上限）。
  const ancestors: { id: string; name: string }[] = [];
  let cur = topic.parentId;
  for (let i = 0; cur && i < 12; i++) {
    const p = byId.get(cur);
    if (!p) break;
    ancestors.unshift({ id: p.id, name: p.name });
    cur = p.parentId;
  }

  const children = base.topics
    .filter(t => t.parentId === topicId)
    .map(t => ({ id: t.id, name: t.name }));

  // 双链聚合：手动优先于共现（同一对只显示一条，手动覆盖），按共享题数降序。
  const relatedMap = new Map<string, RelatedTopicRef>();
  for (const l of base.cooccurLinks) {
    const other = l.source === topicId ? l.target : l.target === topicId ? l.source : null;
    if (!other) continue;
    const t = byId.get(other);
    if (t) relatedMap.set(other, { id: other, name: t.name, via: 'cooccur', sharedCount: l.weight });
  }
  for (const l of base.manualLinks) {
    const other = l.source === topicId ? l.target : l.target === topicId ? l.source : null;
    if (!other) continue;
    const t = byId.get(other);
    if (t) relatedMap.set(other, { id: other, name: t.name, via: 'manual', sharedCount: relatedMap.get(other)?.sharedCount });
  }
  const related = [...relatedMap.values()].sort((a, b) =>
    (a.via === 'manual' ? 1 : 0) !== (b.via === 'manual' ? 1 : 0)
      ? (a.via === 'manual' ? -1 : 1)
      : (b.sharedCount ?? 0) - (a.sharedCount ?? 0));

  // 反向链接：挂在此知识点下的题目（带个人掌握度）。
  const qName = new Map(base.questions.map(q => [q.id, q.name]));
  const { errorSet, masteredSet } = await getUserStatusSets();
  const questions = base.qtLinks
    .filter(l => l.target === topicId && qName.has(l.source))
    .map(l => ({
      id: l.source,
      name: qName.get(l.source)!,
      status: (errorSet.has(l.source) ? 'error_prone' : masteredSet.has(l.source) ? 'mastered' : 'unattempted') as NodeStatus,
    }));

  let canEdit = false;
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    canEdit = isAdminUser(user);
  } catch {
    canEdit = false;
  }

  return {
    id: topic.id,
    name: topic.name,
    description: topic.description,
    level: topic.level,
    ancestors,
    children,
    related,
    questions,
    canEdit,
  };
}

// ── 手动双链增删（admin only，RLS 双保险） ────────────────────

type LinkMutationResult = { ok: true } | { ok: false; error: string };

export async function addTopicLink(a: string, b: string): Promise<LinkMutationResult> {
  if (!a || !b || a === b) return { ok: false, error: '无效的知识点组合' };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!isAdminUser(user)) return { ok: false, error: '仅管理员可编辑双链' };

  const [source, target] = a < b ? [a, b] : [b, a];
  const { error } = await supabase
    .from('topic_links')
    .upsert({ source_topic_id: source, target_topic_id: target, created_by: user!.id });
  if (error) {
    console.error('[addTopicLink]', error.message);
    return { ok: false, error: '保存失败，请确认迁移 030 已执行' };
  }
  revalidateTag('topics', 'max');
  return { ok: true };
}

export async function removeTopicLink(a: string, b: string): Promise<LinkMutationResult> {
  if (!a || !b || a === b) return { ok: false, error: '无效的知识点组合' };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!isAdminUser(user)) return { ok: false, error: '仅管理员可编辑双链' };

  const [source, target] = a < b ? [a, b] : [b, a];
  const { error } = await supabase
    .from('topic_links')
    .delete()
    .eq('source_topic_id', source)
    .eq('target_topic_id', target);
  if (error) {
    console.error('[removeTopicLink]', error.message);
    return { ok: false, error: '删除失败' };
  }
  revalidateTag('topics', 'max');
  return { ok: true };
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
