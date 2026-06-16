'use server';

// 题源溯源的管理员写入：设置/清除题目的 origin、切换 verified（都存进 metadata JSONB，无迁移）。
// origin=null 表示清除显式值、退回信号推断。判别联合返回，绝不 throw。

import { revalidateTag } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAdminUser } from '@/lib/utils/auth';
import type { Origin } from '@/lib/questions/provenance';
import type { QuestionMetadata } from '@/types/database';
import type { Json } from '@/types/supabase';

export type ProvenanceResult = { ok: true } | { ok: false; error: string };

export async function setQuestionProvenance(
  questionId: string,
  patch: { origin?: Origin | null; verified?: boolean },
): Promise<ProvenanceResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!isAdminUser(user)) return { ok: false, error: '需要管理员权限' };

  let admin;
  try { admin = createAdminClient(); } catch {
    return { ok: false, error: '缺少 SUPABASE_SERVICE_ROLE_KEY' };
  }

  const { data: row, error: readErr } = await admin
    .from('questions')
    .select('metadata')
    .eq('id', questionId)
    .maybeSingle();
  if (readErr || !row) return { ok: false, error: '题目不存在' };

  const metadata: QuestionMetadata = { ...((row.metadata as QuestionMetadata | null) ?? {}) };

  if ('origin' in patch) {
    if (patch.origin == null) delete metadata.origin;
    else metadata.origin = patch.origin;
  }
  if (typeof patch.verified === 'boolean') {
    if (patch.verified) metadata.verified = true;
    else delete metadata.verified;
  }

  const { error } = await admin
    .from('questions')
    .update({ metadata: metadata as unknown as Json })
    .eq('id', questionId);
  if (error) return { ok: false, error: '保存失败：' + error.message };

  revalidateTag('questions', 'max'); // 题库/星图底图（tag 'questions'）失效
  return { ok: true };
}
