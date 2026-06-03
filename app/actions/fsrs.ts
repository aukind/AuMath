'use server';

// FSRS 智能错题本 Server Actions
//   - getTodayDueQuestions：今日到期错题队列（user_errors.due <= now()）
//   - getTodayDueCount：今日到期数（入口徽标）
//   - submitReviewAction：ts-fsrs 推算下次复习 + 原子落库（RPC submit_fsrs_review）
// 见 supabase/migrations/019_fsrs_integration.sql。
import { revalidatePath } from 'next/cache';
import {
  fsrs,
  generatorParameters,
  createEmptyCard,
  type Card,
  type Grade,
  type State,
} from 'ts-fsrs';
import { createClient } from '@/lib/supabase/server';
import type { QuestionWithTopics } from '@/types/database';
import type { ReviewActionPayload, ReviewResult } from '@/types/fsrs';

/* eslint-disable @typescript-eslint/no-explicit-any */

// 模块级单例调度器（FSRS 标准权重）。
//   enable_short_term=false：(re)learning steps 不生效 → 间隔按「天」粒度，
//     契合「每天推送到期错题」模型（Again 不会几分钟后又冒出来打断本场清空）。
//   enable_fuzz=true：到期日加少量抖动，避免大量卡片在同一天聚簇。
const scheduler = fsrs(
  generatorParameters({ enable_fuzz: true, enable_short_term: false }),
);

// user_errors 上的 FSRS 列（与迁移 019 对应）
interface UserErrorFSRSRow {
  due: string;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  reps: number;
  lapses: number;
  state: number;
  last_review: string | null;
}

const QUESTION_SELECT =
  '*, question_topic_relations(question_id, topic_id, topics(*))';

// ── 今日到期错题队列 ───────────────────────────────────────────────────────
// 边缘案例#1（时区）：due 是 TIMESTAMPTZ 绝对时刻，恒以 due <= now() 判定，
// 与浏览器时区无关；按 due 升序（最该复习的排前面）。
export async function getTodayDueQuestions(): Promise<QuestionWithTopics[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const sb = supabase as any;
  const nowIso = new Date().toISOString();

  const { data: rows } = await sb
    .from('user_errors')
    .select('question_id')
    .eq('user_id', user.id)
    .lte('due', nowIso)
    .order('due', { ascending: true })
    .limit(100);

  if (!rows?.length) return [];

  const ids: string[] = rows.map((r: { question_id: string }) => r.question_id);

  const { data: questions } = await supabase
    .from('questions')
    .select(QUESTION_SELECT)
    .eq('status', 'published')
    .in('id', ids);

  // 保持 due 升序（IN 查询不保证顺序），沿用 getWorkspaceQuestions 的重排法
  const qMap = new Map(
    ((questions ?? []) as QuestionWithTopics[]).map((q) => [q.id, q]),
  );
  return ids.map((id) => qMap.get(id)).filter(Boolean) as QuestionWithTopics[];
}

// ── 今日到期数（入口徽标用）──────────────────────────────────────────────────
export async function getTodayDueCount(): Promise<number> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return 0;

  const { count } = await (supabase as any)
    .from('user_errors')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .lte('due', new Date().toISOString());

  return count ?? 0;
}

// ── 提交复习评价 ───────────────────────────────────────────────────────────
// 读当前 FSRS 状态 → ts-fsrs.next() 推算新卡 + ReviewLog → RPC 原子落库。
export async function submitReviewAction(
  payload: ReviewActionPayload,
): Promise<ReviewResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, nextDue: '' };

  const sb = supabase as any;

  // 1) 读当前记忆状态
  const { data: row, error: readErr } = await sb
    .from('user_errors')
    .select(
      'due, stability, difficulty, elapsed_days, scheduled_days, reps, lapses, state, last_review',
    )
    .eq('user_id', user.id)
    .eq('question_id', payload.questionId)
    .maybeSingle();

  if (readErr || !row) {
    console.error('[submitReviewAction] read', readErr?.message ?? 'not found');
    return { success: false, nextDue: '' };
  }

  const r = row as UserErrorFSRSRow;
  const now = new Date();

  // 2) 组装 ts-fsrs Card：以 createEmptyCard 兜底必填字段（如 5.x 的 learning_steps），
  //    再覆盖 DB 里的记忆参数；New 卡时这些值与空卡一致。
  const card: Card = {
    ...createEmptyCard(now),
    due: new Date(r.due),
    stability: r.stability,
    difficulty: r.difficulty,
    elapsed_days: r.elapsed_days,
    scheduled_days: r.scheduled_days,
    reps: r.reps,
    lapses: r.lapses,
    state: r.state as State,
    last_review: r.last_review ? new Date(r.last_review) : undefined,
  };

  // 3) 推算（rating 1–4 即 ts-fsrs Grade，已排除 Manual=0）
  const { card: next, log } = scheduler.next(
    card,
    now,
    payload.rating as Grade,
  );

  // 4) 序列化（Date → ISO；last_review 空转空串供 NULLIF 还原 null）
  const p_card = {
    due: next.due.toISOString(),
    stability: next.stability,
    difficulty: next.difficulty,
    elapsed_days: next.elapsed_days,
    scheduled_days: next.scheduled_days,
    reps: next.reps,
    lapses: next.lapses,
    state: next.state,
    last_review: next.last_review ? next.last_review.toISOString() : '',
  };
  const p_log = {
    state: log.state,
    due: log.due.toISOString(),
    stability: log.stability,
    difficulty: log.difficulty,
    elapsed_days: log.elapsed_days,
    last_elapsed_days: log.last_elapsed_days,
    scheduled_days: log.scheduled_days,
    review: log.review.toISOString(),
  };

  // 5) 原子落库（UPDATE user_errors + INSERT user_review_logs 同事务）
  const { error: rpcErr } = await sb.rpc('submit_fsrs_review', {
    p_question_id: payload.questionId,
    p_rating: payload.rating,
    p_duration_ms: Math.max(0, Math.round(payload.durationMs)),
    p_card,
    p_log,
  });

  if (rpcErr) {
    console.error('[submitReviewAction] rpc', rpcErr.message);
    return { success: false, nextDue: '' };
  }

  // 刷新首页错题区的「今日复习 (N)」徽标
  revalidatePath('/');
  return { success: true, nextDue: p_card.due };
}
