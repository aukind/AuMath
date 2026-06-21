'use server';

// 智能复盘数据层：把错题(user_errors，含 FSRS 参数) + 复习流水(user_review_logs) + 知识点关联
// 聚合成「弱点雷达 + 学习热力图 + 关键指标」。另含 AI 复盘叙述（Gemini，按需）。
// 全部读侧聚合；表/迁移缺失一律降级为空，不抛。

import { createClient } from '@/lib/supabase/server';
import { GoogleGenAI } from '@google/genai';
import { cnDate, todayCn, buildHeatmapWeeks, computeStreak, type HeatCell } from '@/lib/review/heatmap';

export interface WeakTopic { id: string; name: string; errorCount: number; dueCount: number }
export interface RadarAxis { name: string; value: number } // 0..1，越大越弱

export interface ReviewAnalytics {
  stats: { totalErrors: number; dueNow: number; reviewedTotal: number; streak: number; last7: number };
  weakTopics: WeakTopic[];
  radar: RadarAxis[];
  heatmap: (HeatCell | null)[][];
  hasData: boolean;
}

const HEATMAP_WEEKS = 16;

export async function getReviewAnalytics(): Promise<ReviewAnalytics | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const since = new Date(Date.now() - 130 * 86400000).toISOString();
  const nowMs = Date.now();

  const [errRes, logsRes, logCountRes, topicsRes] = await Promise.all([
    supabase.from('user_errors').select('question_id, due, state').eq('user_id', user.id),
    supabase.from('user_review_logs').select('review').eq('user_id', user.id).gte('review', since),
    supabase.from('user_review_logs').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
    supabase.from('topics').select('id, name, parent_id'),
  ]);

  const errors = (errRes.data ?? []) as { question_id: string; due: string; state: number }[];
  const logs = (logsRes.data ?? []) as { review: string }[];

  // ── 关键指标 ──
  const dueNow = errors.filter(e => new Date(e.due).getTime() <= nowMs).length;
  const countByDate = new Map<string, number>();
  for (const l of logs) {
    const d = cnDate(l.review);
    countByDate.set(d, (countByDate.get(d) ?? 0) + 1);
  }
  const today = todayCn();
  const streak = computeStreak(new Set(countByDate.keys()), today);
  let last7 = 0;
  for (let i = 0; i < 7; i++) {
    const [y, m, d] = today.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d) - i * 86400000);
    const ds = `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
    last7 += countByDate.get(ds) ?? 0;
  }
  const { grid } = buildHeatmapWeeks(countByDate, today, HEATMAP_WEEKS);

  // ── 弱点：错题按知识点聚合 ──
  const errIds = errors.map(e => e.question_id);
  const dueByQ = new Map(errors.map(e => [e.question_id, new Date(e.due).getTime() <= nowMs]));
  const weakTopics: WeakTopic[] = [];
  const radar: RadarAxis[] = [];

  if (errIds.length) {
    // 错题 → 知识点（分批避免 in() 过长）
    const relRows: { question_id: string; topic_id: string }[] = [];
    for (let i = 0; i < errIds.length; i += 200) {
      const { data } = await supabase
        .from('question_topic_relations')
        .select('question_id, topic_id')
        .in('question_id', errIds.slice(i, i + 200));
      relRows.push(...(data ?? []));
    }

    const topicMap = new Map((topicsRes.data ?? []).map(t => [t.id, { name: t.name, parent_id: t.parent_id as string | null }]));
    const errorByTopic = new Map<string, number>();
    const dueByTopic = new Map<string, number>();
    for (const r of relRows) {
      if (!topicMap.has(r.topic_id)) continue;
      errorByTopic.set(r.topic_id, (errorByTopic.get(r.topic_id) ?? 0) + 1);
      if (dueByQ.get(r.question_id)) dueByTopic.set(r.topic_id, (dueByTopic.get(r.topic_id) ?? 0) + 1);
    }

    for (const [id, errorCount] of [...errorByTopic.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)) {
      weakTopics.push({ id, name: topicMap.get(id)!.name, errorCount, dueCount: dueByTopic.get(id) ?? 0 });
    }

    // 雷达：错题数上溯到根章节后聚合
    const rootError = new Map<string, number>();
    const rootOf = (id: string): string => {
      let cur = id, guard = 0;
      while (guard++ < 12) {
        const t = topicMap.get(cur);
        if (!t || !t.parent_id || !topicMap.has(t.parent_id)) return cur;
        cur = t.parent_id;
      }
      return cur;
    };
    for (const [id, c] of errorByTopic) {
      const root = rootOf(id);
      rootError.set(root, (rootError.get(root) ?? 0) + c);
    }
    const rootsSorted = [...rootError.entries()].sort((a, b) => b[1] - a[1]).slice(0, 7);
    const max = rootsSorted[0]?.[1] ?? 1;
    for (const [id, c] of rootsSorted) {
      radar.push({ name: topicMap.get(id)?.name ?? '其它', value: max ? c / max : 0 });
    }
  }

  return {
    stats: { totalErrors: errors.length, dueNow, reviewedTotal: logCountRes.count ?? 0, streak, last7 },
    weakTopics,
    radar,
    heatmap: grid,
    hasData: errors.length > 0 || logs.length > 0,
  };
}

// ── AI 复盘叙述（按需，Gemini） ──────────────────────────────
export type NarrativeResult = { ok: true; markdown: string } | { ok: false; error: string };

export async function getReviewNarrative(): Promise<NarrativeResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return { ok: false, error: '未配置 AI' };

  const a = await getReviewAnalytics();
  if (!a) return { ok: false, error: '请先登录' };
  if (a.weakTopics.length === 0) return { ok: false, error: '错题样本不足，先积累一些错题再来复盘' };

  const weakLine = a.weakTopics.map(w => `${w.name}（错${w.errorCount}题${w.dueCount ? `，${w.dueCount}题待复习` : ''}）`).join('；');
  const prompt = `这是一名高考数学学习者的错题分布与复习情况，请据此写一段简短(150-250字)、具体、有温度的「学习复盘」。\n\n薄弱知识点（按错题数降序）：${weakLine}\n累计错题：${a.stats.totalErrors}；待复习：${a.stats.dueNow}；连续打卡：${a.stats.streak}天；近7天复习：${a.stats.last7}次。\n\n要求：①点出最该优先突破的1-2个知识点及可能的薄弱原因（结合高考数学常见易错）；②给出本周具体可执行的行动建议；③用 [[知识点名]] 维基链接包裹提到的知识点名（须与上方完全一致）；④鼓励但不空洞。输出纯文本/Markdown，不要标题。`;

  try {
    const client = new GoogleGenAI({ apiKey, httpOptions: { timeout: 60_000 } });
    const res = await client.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: { maxOutputTokens: 1024, thinkingConfig: { thinkingBudget: 0 } },
    });
    const text = (res.text ?? '').replace(/^```(?:markdown)?\s*|\s*```$/g, '').trim();
    return text.length > 20 ? { ok: true, markdown: text } : { ok: false, error: '生成失败，请重试' };
  } catch (e) {
    console.warn('[getReviewNarrative]', (e as Error).message);
    return { ok: false, error: '生成失败，请稍后重试' };
  }
}
