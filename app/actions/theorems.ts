'use server';

// 定理库 AI 回填的两个管理员入口（镜像 app/actions/knowledge-points.ts）：
//   - seedTheorems：把受控词表整批建成 theorems 行（即便还没题目引用，定理库先有内容）。
//   - backfillTheoremCitations：给「尚无定理引用」的存量题 AI 识别用到的定理 →
//     写 theorem_question_relations（引用边）+ 派生 theorem_topic_relations（归属边）。
//
// 落库后知识星图（/explore）的定理节点、定理→知识点/→题边、TheoremInspector 自动点亮。

import { revalidateTag } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAdminUser } from '@/lib/utils/auth';
import { classifyTheorems } from '@/lib/theorems/classify';
import { ensureTheorems, linkQuestionsToTheorems } from '@/lib/theorems/linker';
import { THEOREM_LIST } from '@/lib/theorems/taxonomy';

function buildClassifyText(content: string, analysis?: string | null): string {
  const head = content.slice(0, 3000);
  const tail = (analysis ?? '').trim().slice(0, 1200);
  return tail ? `${head}\n\n【解析摘要】${tail}` : head;
}

/**
 * 种子：把词表里全部定理建成 theorems 行（已存在的跳过）。返回库中定理总数。
 */
export async function seedTheorems(): Promise<{ success: boolean; total: number; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !isAdminUser(user)) return { success: false, total: 0, error: '需要管理员权限' };

  let admin;
  try { admin = createAdminClient(); } catch {
    return { success: false, total: 0, error: '缺少 SUPABASE_SERVICE_ROLE_KEY' };
  }

  const map = await ensureTheorems(admin, THEOREM_LIST.map(t => t.name));
  if (!map.size) return { success: false, total: 0, error: '建表失败（可能迁移 032 未执行）' };

  revalidateTag('topics', 'max'); // 定理是星图新节点 → 刷新底图
  return { success: true, total: map.size };
}

/**
 * 回填：每次取 batchSize 道「尚无定理引用」的已发布题，AI 识别定理 → 写引用/归属边。
 * 返回本批处理/绑定数；processed=0 表示已全部回填。
 */
export async function backfillTheoremCitations(
  batchSize = 30,
): Promise<{ success: boolean; processed: number; linked: number; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !isAdminUser(user)) {
    return { success: false, processed: 0, linked: 0, error: '需要管理员权限' };
  }
  if (!process.env.GEMINI_API_KEY) {
    return { success: false, processed: 0, linked: 0, error: 'GEMINI_API_KEY 未设置' };
  }

  let admin;
  try { admin = createAdminClient(); } catch {
    return { success: false, processed: 0, linked: 0, error: '缺少 SUPABASE_SERVICE_ROLE_KEY' };
  }

  // !left + is null = 「不存在任何定理引用」的题（PostgREST 反连接），limit 才作用在待处理题上。
  const { data: rows, error } = await admin
    .from('questions')
    .select('id, content, analysis, theorem_question_relations!left(theorem_id)')
    .eq('status', 'published')
    .filter('theorem_question_relations', 'is', null)
    .limit(batchSize);
  if (error) {
    return { success: false, processed: 0, linked: 0, error: '查询失败（可能迁移 032 未执行）：' + error.message };
  }
  if (!rows?.length) return { success: true, processed: 0, linked: 0 };

  const classified = await classifyTheorems(
    rows.map(r => ({ id: r.id, text: buildClassifyText(r.content, r.analysis) })),
  );

  const pairs = [...classified.entries()].map(([questionId, theorems]) => ({ questionId, theorems }));
  const { linked, error: linkErr } = await linkQuestionsToTheorems(admin, pairs);
  if (linked > 0) revalidateTag('topics', 'max');

  return { success: true, processed: rows.length, linked, error: linkErr };
}
