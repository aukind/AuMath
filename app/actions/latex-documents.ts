'use server';

// LaTeX 工作室·云端多文档 CRUD（迁移 026 的 latex_documents）。
// 每用户私有：RLS 已按 user_id=auth.uid() 隔离，这里仍显式带 user 守卫与 .eq('user_id') 双保险。
// 迁移安全：表不存在（026 未跑）时查询报错 → 捕获降级（列表返回 []、详情返回 null），前端不崩。

import { createClient } from '@/lib/supabase/server';
import type { LatexEngine } from '@/app/actions/latex-doc';
import type { LatexDocMeta, LatexDocFull } from '@/components/latex/LatexDocStudio';

const COLS_META = 'id, title, engine, updated_at';
const COLS_FULL = 'id, title, content, engine, updated_at';

/** 当前用户的全部文档（不含正文），按最近修改倒序，供标签页/文档列表用。 */
export async function listLatexDocuments(): Promise<LatexDocMeta[]> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any;
    const { data, error } = await sb
      .from('latex_documents')
      .select(COLS_META)
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false });
    if (error) return []; // 迁移未跑等：静默降级
    return (data ?? []) as LatexDocMeta[];
  } catch {
    return [];
  }
}

/** 取单篇全文（owner 限定）。不存在/无权限/缺表 → null。 */
export async function getLatexDocument(id: string): Promise<LatexDocFull | null> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any;
    const { data, error } = await sb
      .from('latex_documents')
      .select(COLS_FULL)
      .eq('user_id', user.id)
      .eq('id', id)
      .maybeSingle();
    if (error || !data) return null;
    return data as LatexDocFull;
  } catch {
    return null;
  }
}

/** 新建一篇文档，返回新行（含正文）。 */
export async function createLatexDocument(
  input?: { title?: string; content?: string; engine?: LatexEngine },
): Promise<{ success: true; doc: LatexDocFull } | { success: false; error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: '请先登录' };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any;
  const { data, error } = await sb
    .from('latex_documents')
    .insert({
      user_id: user.id,
      title: input?.title?.trim() || '未命名文档',
      content: input?.content ?? '',
      engine: input?.engine ?? 'xelatex',
    })
    .select(COLS_FULL)
    .single();
  if (error) return { success: false, error: error.message };
  return { success: true, doc: data as LatexDocFull };
}

/** 自动保存入口：按字段增量更新（owner 限定）。 */
export async function updateLatexDocument(
  id: string,
  patch: { title?: string; content?: string; engine?: LatexEngine },
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: '请先登录' };

  const fields: Record<string, unknown> = {};
  if (typeof patch.title === 'string') fields.title = patch.title.trim() || '未命名文档';
  if (typeof patch.content === 'string') fields.content = patch.content;
  if (patch.engine) fields.engine = patch.engine;
  if (Object.keys(fields).length === 0) return { success: true };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any;
  const { error } = await sb
    .from('latex_documents')
    .update(fields)
    .eq('user_id', user.id)
    .eq('id', id);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

/** 删除一篇文档（owner 限定）。 */
export async function deleteLatexDocument(id: string): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: '请先登录' };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from('latex_documents')
    .delete()
    .eq('user_id', user.id)
    .eq('id', id);
  if (error) return { success: false, error: error.message };
  return { success: true };
}
