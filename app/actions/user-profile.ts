'use server';

import { createClient } from '@/lib/supabase/server';
import type { UserProfileData, PublicProfileData, ActivityFeedItem } from '@/types/dashboard';

// 拉取多少条浏览历史用于计算连续天数 / 渲染动态流
const HISTORY_LOOKBACK = 60;
const FEED_LIMIT = 8;

/**
 * 聚合当前登录用户的控制台首屏数据。
 *
 * 真实字段（来自 Supabase）：
 *   - username / joinDate  ← auth.users
 *   - totalSolved          ← user_history 总数（练习/攻克过的题目）
 *   - streakDays           ← 由 user_history.viewed_at 推算的连续学习天数
 *   - forumReputation      ← 你的回复获得的、来自他人的点赞数（forum_comment_votes）
 *   - recentActivities     ← 最近浏览的题目 + 最近发布的帖子，按时间合并
 *
 * 设计要点：题库（user_history）与论坛（forum_*）来自不同迁移，
 * 论坛表可能尚未应用。因此所有论坛查询各自 try/catch 降级为 0 / []，
 * 绝不让「论坛未落库」连累已可用的题库统计。
 *
 * 未登录或题库查询异常时返回 null / 空骨架，由页面负责重定向 / 降级。
 */
export async function getUserProfile(): Promise<UserProfileData | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const username =
    (user.user_metadata?.username as string | undefined)?.trim() ||
    user.email?.split('@')[0] ||
    '数学学习者';
  const joinDate = user.created_at ?? new Date().toISOString();

  // user_* / forum_* 表未在 Database 泛型中声明，用最小链式查询类型（见底部 FromFn）替代 any。
  const from = supabase.from as unknown as FromFn;

  try {
    const [{ count: solvedCount }, { data: historyRows }, forumReputation] = await Promise.all([
      from<HistoryRow>('user_history')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id),
      from<HistoryRow>('user_history')
        .select('question_id, viewed_at')
        .eq('user_id', user.id)
        .order('viewed_at', { ascending: false })
        .limit(HISTORY_LOOKBACK),
      // 论坛声望独立降级：表缺失/异常 → 0，不影响下方题库统计。
      computeForumReputation(from, user.id),
    ]);

    const history: HistoryRow[] = historyRows ?? [];

    const stats = {
      totalSolved: solvedCount ?? 0,
      forumReputation,
      streakDays: computeStreak(history.map((h) => h.viewed_at)),
    };

    // 题库练习动态 + 论坛发帖 + 论坛回复，合并后按时间倒序取前 N 条。
    const [solvedFeed, postFeed, replyFeed] = await Promise.all([
      buildSolvedFeed(from, history.slice(0, FEED_LIMIT)),
      buildPostFeed(from, user.id),
      buildReplyFeed(from, user.id),
    ]);
    const recentActivities = [...solvedFeed, ...postFeed, ...replyFeed]
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, FEED_LIMIT);

    return { username, joinDate, stats, recentActivities };
  } catch {
    // 题库表缺失 / 网络异常 → 返回可渲染的空骨架，触发空状态引导。
    return {
      username,
      joinDate,
      stats: { totalSolved: 0, forumReputation: 0, streakDays: 0 },
      recentActivities: [],
    };
  }
}

/**
 * 聚合任意用户的「公开主页」数据 —— 仅论坛维度，不暴露刷题量/学习习惯等隐私。
 *
 * 返回：
 *   - username / avatarUrl / role  ← profiles
 *   - stats.posts    ← 该用户发布的主题帖数
 *   - stats.replies  ← 一级回复 + 楼中楼总数
 *   - stats.likes    ← 收到的他人点赞数（= 论坛声望）
 *   - recentActivities ← 近期发帖 + 近期回复，按时间倒序
 *
 * profiles / forum_* 未应用或用户不存在时返回 null，由页面 notFound() 兜底。
 */
export async function getPublicProfile(userId: string): Promise<PublicProfileData | null> {
  if (!userId) return null;
  const supabase = await createClient();
  const from = supabase.from as unknown as FromFn;

  try {
    const { data: profiles } = await from<ProfileRow>('profiles')
      .select('id, username, avatar_url, role')
      .eq('id', userId);
    const profile = (profiles ?? [])[0];
    if (!profile) return null;

    const [{ count: postCount }, { count: commentCount }, { count: subCount }, likes, postFeed, replyFeed] =
      await Promise.all([
        from<{ id: string }>('forum_posts')
          .select('id', { count: 'exact', head: true })
          .eq('author_id', userId),
        from<{ id: string }>('forum_comments')
          .select('id', { count: 'exact', head: true })
          .eq('author_id', userId),
        from<{ id: string }>('forum_sub_comments')
          .select('id', { count: 'exact', head: true })
          .eq('author_id', userId),
        computeForumReputation(from, userId),
        buildPostFeed(from, userId),
        buildReplyFeed(from, userId),
      ]);

    const recentActivities = [...postFeed, ...replyFeed]
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, FEED_LIMIT);

    return {
      userId,
      username: profile.username?.trim() || '数学学习者',
      avatarUrl: profile.avatar_url ?? undefined,
      role: profile.role === 'admin' ? 'admin' : 'user',
      stats: {
        posts: postCount ?? 0,
        replies: (commentCount ?? 0) + (subCount ?? 0),
        likes,
      },
      recentActivities,
    };
  } catch {
    return null;
  }
}

// ── 论坛声望：你的一级回复收到的、来自他人的点赞总数 ───────────
// 自赞不计（neq user_id）。论坛表未应用或查询异常时静默返回 0。
async function computeForumReputation(from: FromFn, uid: string): Promise<number> {
  try {
    const { data: myComments } = await from<{ id: string }>('forum_comments')
      .select('id')
      .eq('author_id', uid);

    const ids = (myComments ?? []).map((c) => c.id);
    if (!ids.length) return 0;

    const { count } = await from<{ comment_id: string }>('forum_comment_votes')
      .select('comment_id', { count: 'exact', head: true })
      .in('comment_id', ids)
      .neq('user_id', uid);

    return count ?? 0;
  } catch {
    return 0;
  }
}

// ── 题库练习 → 动态流 ──────────────────────────────────────────
async function buildSolvedFeed(
  from: FromFn,
  history: HistoryRow[],
): Promise<ActivityFeedItem[]> {
  if (!history.length) return [];

  const ids = [...new Set(history.map((h) => h.question_id))];
  const { data: questions } = await from<QuestionLite>('questions')
    .select('id, content, source, question_topic_relations(topics(name))')
    .in('id', ids);

  const qMap = new Map<string, QuestionLite>(
    (questions ?? []).map((q) => [q.id, q]),
  );

  return history
    .map((h): ActivityFeedItem | null => {
      const q = qMap.get(h.question_id);
      if (!q) return null;
      const topic = q.question_topic_relations?.[0]?.topics?.name;
      return {
        id: `hist-${h.question_id}-${h.viewed_at}`,
        type: 'solved_problem',
        title: snippet(q.content) || '一道数学题',
        description: q.source ? `练习了来自《${q.source}》的题目` : '在题库中练习了这道题',
        timestamp: h.viewed_at,
        repoOrTopic: topic || '公共题库',
      };
    })
    .filter((x): x is ActivityFeedItem => x !== null);
}

// ── 论坛发帖 → 动态流 ──────────────────────────────────────────
// 论坛表未应用或查询异常时静默返回 []，不影响题库动态。
async function buildPostFeed(from: FromFn, uid: string): Promise<ActivityFeedItem[]> {
  try {
    const { data: posts } = await from<PostLite>('forum_posts')
      .select('id, title, tags, created_at')
      .eq('author_id', uid)
      .order('created_at', { ascending: false })
      .limit(FEED_LIMIT);

    return (posts ?? []).map((p): ActivityFeedItem => ({
      id: `post-${p.id}`,
      type: 'created_post',
      title: p.title,
      description: '在社区发布了新帖子',
      timestamp: p.created_at,
      repoOrTopic: p.tags?.[0] ?? '社区讨论区',
    }));
  } catch {
    return [];
  }
}

// ── 论坛回复 → 动态流 ──────────────────────────────────────────
// 取该用户最近的一级回复，关联帖子标题渲染「回复了《标题》」。论坛表缺失时静默 []。
async function buildReplyFeed(from: FromFn, uid: string): Promise<ActivityFeedItem[]> {
  try {
    const { data: comments } = await from<CommentLite>('forum_comments')
      .select('id, post_id, created_at')
      .eq('author_id', uid)
      .order('created_at', { ascending: false })
      .limit(FEED_LIMIT);

    const rows = comments ?? [];
    if (!rows.length) return [];

    const postIds = [...new Set(rows.map((c) => c.post_id))];
    const { data: posts } = await from<{ id: string; title: string }>('forum_posts')
      .select('id, title')
      .in('id', postIds);
    const titleMap = new Map((posts ?? []).map((p) => [p.id, p.title]));

    return rows.map((c): ActivityFeedItem => {
      const title = titleMap.get(c.post_id);
      return {
        id: `reply-${c.id}`,
        type: 'replied',
        title: title ? `《${title}》` : '一条论坛回复',
        description: '在该帖下发表了回复',
        timestamp: c.created_at,
        repoOrTopic: '社区讨论区',
      };
    });
  } catch {
    return [];
  }
}

interface QuestionLite {
  id: string;
  content: string;
  source: string | null;
  question_topic_relations?: { topics: { name: string } | null }[];
}

interface ProfileRow {
  id: string;
  username: string | null;
  avatar_url: string | null;
  role: string | null;
}

interface CommentLite {
  id: string;
  post_id: string;
  created_at: string;
}

interface PostLite {
  id: string;
  title: string;
  tags: string[] | null;
  created_at: string;
}

interface HistoryRow {
  question_id: string;
  viewed_at: string;
}

// 最小链式查询类型：表达未在 Database 泛型中声明的 user_* / forum_* 表，避免显式 any。
interface QueryResult<T> {
  data: T[] | null;
  count: number | null;
}
interface TableQuery<T> extends PromiseLike<QueryResult<T>> {
  select(columns: string, options?: { count: 'exact'; head: boolean }): TableQuery<T>;
  eq(column: string, value: string): TableQuery<T>;
  neq(column: string, value: string): TableQuery<T>;
  order(column: string, options: { ascending: boolean }): TableQuery<T>;
  limit(count: number): TableQuery<T>;
  in(column: string, values: readonly string[]): TableQuery<T>;
}
type FromFn = <T>(table: string) => TableQuery<T>;

// ── 工具：从题目正文中提取一行纯文本预览（去除 LaTeX 与 Markdown 噪声） ──
function snippet(content: string, max = 42): string {
  const plain = content
    .replace(/\$\$[\s\S]*?\$\$/g, ' ')      // 块级公式
    .replace(/\$[^$]*\$/g, ' ')             // 行内公式
    .replace(/[#>*_`~\\-]/g, ' ')           // Markdown 符号
    .replace(/\s+/g, ' ')
    .trim();
  return plain.length > max ? `${plain.slice(0, max)}…` : plain;
}

// ── 工具：由浏览时间戳推算连续学习天数 ─────────────────────────
// 以「今天」为起点向前数；若今天无记录但昨天有，则从昨天起算。
function computeStreak(isoDates: string[]): number {
  if (!isoDates.length) return 0;

  const dayKeys = new Set(
    isoDates
      .map((d) => new Date(d))
      .filter((d) => !Number.isNaN(d.getTime()))
      .map(keyOf),
  );
  if (!dayKeys.size) return 0;

  const MS_DAY = 86_400_000;
  let cursor = startOfDay(new Date());

  if (!dayKeys.has(keyOf(new Date(cursor)))) {
    cursor -= MS_DAY; // 允许连续记录延续到昨天
    if (!dayKeys.has(keyOf(new Date(cursor)))) return 0;
  }

  let streak = 0;
  while (dayKeys.has(keyOf(new Date(cursor)))) {
    streak += 1;
    cursor -= MS_DAY;
  }
  return streak;
}

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function keyOf(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}
