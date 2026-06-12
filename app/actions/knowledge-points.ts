'use server';

// 自动知识点标注的两个入口（词表/分类/落库逻辑在 lib/knowledge/*）：
//   - backfillKnowledgePoints：管理员批量给「无任何知识点关联」的存量题打标（镜像 backfillEmbeddings 的交互）。
//   - suggestKnowledgePoints：录题表单「AI 识别知识点」，返回 topics 行供前端预选（AI 端点需登录）。
//
// 标注落进 question_topic_relations 后，知识星图（/explore）的共现边、TopicInspector
// 反链题目列表、双链面板自动点亮 —— 星图侧无需任何改动。

import { revalidateTag } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAdminUser } from '@/lib/utils/auth';
import { classifyKnowledgePoints } from '@/lib/knowledge/classify';
import { linkQuestionsToKnowledgePoints, ensureKnowledgePointTopics } from '@/lib/knowledge/linker';

/** 分类输入：题面 + 解析摘要（解析里往往藏着跨章节方法，如概率题里的数列递推）。 */
function buildClassifyText(content: string, analysis?: string | null): string {
  const head = content.slice(0, 3000);
  const tail = (analysis ?? '').trim().slice(0, 1000);
  return tail ? `${head}\n\n【解析摘要】${tail}` : head;
}

/**
 * 管理员批量回填：每次取 batchSize 道尚无知识点关联的已发布题，
 * Gemini 受控词表分类 → find-or-create topics → 写 question_topic_relations。
 * 返回本批处理/成功打标数；processed=0 表示已全部回填。
 */
export async function backfillKnowledgePoints(
  batchSize = 40,
): Promise<{ success: boolean; processed: number; tagged: number; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !isAdminUser(user)) {
    return { success: false, processed: 0, tagged: 0, error: '需要管理员权限' };
  }
  if (!process.env.GEMINI_API_KEY) {
    return { success: false, processed: 0, tagged: 0, error: 'GEMINI_API_KEY 未设置' };
  }

  let admin;
  try { admin = createAdminClient(); } catch {
    return { success: false, processed: 0, tagged: 0, error: '缺少 SUPABASE_SERVICE_ROLE_KEY' };
  }

  // !left + is null = 「不存在任何知识点关联」的题（PostgREST 反连接写法），
  // 这样 limit 才作用在真正待处理的题上，不会被已打标的题占满批次。
  const { data: rows, error } = await admin
    .from('questions')
    .select('id, content, analysis, question_topic_relations!left(topic_id)')
    .eq('status', 'published')
    .filter('question_topic_relations', 'is', null)
    .limit(batchSize);
  if (error) {
    return { success: false, processed: 0, tagged: 0, error: '查询失败：' + error.message };
  }
  if (!rows?.length) return { success: true, processed: 0, tagged: 0 };

  const classified = await classifyKnowledgePoints(
    rows.map(r => ({ id: r.id, text: buildClassifyText(r.content, r.analysis) })),
  );

  const pairs = [...classified.entries()].map(([questionId, points]) => ({ questionId, points }));
  const { linked, error: linkErr } = await linkQuestionsToKnowledgePoints(admin, pairs);
  if (linked > 0) revalidateTag('topics', 'max');

  return {
    success: true,
    processed: rows.length,
    tagged: pairs.length,
    error: linkErr,
  };
}

export interface SuggestedTopic {
  id: string;
  name: string;
  parent_id: string | null;
}

/**
 * 录题表单「AI 识别知识点」：对题目文本做受控词表分类，返回（必要时新建的）topics 行。
 * 需登录（AI 端点鉴权约定）；失败返回空数组级错误信息。
 */
export async function suggestKnowledgePoints(
  content: string,
  analysis?: string,
): Promise<{ success: true; topics: SuggestedTopic[] } | { success: false; error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: '请先登录' };
  if (!content.trim()) return { success: false, error: '请先填写题目内容' };

  let admin;
  try { admin = createAdminClient(); } catch {
    return { success: false, error: '服务端配置错误：缺少 SUPABASE_SERVICE_ROLE_KEY' };
  }

  const classified = await classifyKnowledgePoints([
    { id: 'q', text: buildClassifyText(content, analysis) },
  ]);
  const points = classified.get('q') ?? [];
  if (!points.length) return { success: false, error: '未能识别出知识点，请手动选择' };

  const topics = await ensureKnowledgePointTopics(admin, points);
  if (!topics.length) return { success: false, error: '知识点解析失败，请手动选择' };

  revalidateTag('topics', 'max'); // 可能新建了 topic 节点 → 刷新表单词表与星图底图
  return { success: true, topics: topics.map(t => ({ id: t.id, name: t.name, parent_id: t.parent_id })) };
}
