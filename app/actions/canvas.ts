'use server';

// 白板 Canvas（迁移 037）Server Actions。写操作返回判别联合、不 throw；RLS 限本人。
// 整张白板 data(nodes+edges) 全量存取，前端防抖自动保存。

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import type { Json } from '@/types/supabase';
import type { CanvasData, CanvasSummary, CanvasDoc, CanvasResult } from '@/types/canvas';

const MAX_CANVASES = 200;
const MAX_TITLE_LEN = 120;
const MAX_NODES = 500;   // 单图节点上限，挡脚本刷爆
const EMPTY: CanvasData = { nodes: [], edges: [] };

/** 收窄未知 JSONB 为 CanvasData（容错：字段缺失则给空数组）。 */
function toCanvasData(raw: unknown): CanvasData {
  const o = (raw ?? {}) as { nodes?: unknown; edges?: unknown };
  return {
    nodes: Array.isArray(o.nodes) ? (o.nodes as CanvasData['nodes']) : [],
    edges: Array.isArray(o.edges) ? (o.edges as CanvasData['edges']) : [],
  };
}

export async function listCanvases(): Promise<CanvasSummary[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from('canvas_documents')
    .select('id, title, is_public, data, updated_at')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false });
  if (error) { console.error('[listCanvases]', error.message); return []; }

  return (data ?? []).map((c) => ({
    id: c.id,
    title: c.title,
    isPublic: c.is_public,
    updatedAt: c.updated_at,
    nodeCount: toCanvasData(c.data).nodes.length,
  }));
}

export async function getCanvas(id: string): Promise<CanvasDoc | null> {
  if (!id) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('canvas_documents')
    .select('id, title, is_public, data, updated_at')
    .eq('id', id)
    .maybeSingle();
  if (error || !data) return null; // RLS：能读到=本人或公开
  return {
    id: data.id,
    title: data.title,
    isPublic: data.is_public,
    data: toCanvasData(data.data),
    updatedAt: data.updated_at,
  };
}

export async function createCanvas(title?: string): Promise<CanvasResult<{ id: string }>> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: '请先登录' };

  const { count } = await supabase
    .from('canvas_documents')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id);
  if ((count ?? 0) >= MAX_CANVASES) return { ok: false, error: `白板数量已达上限（${MAX_CANVASES}）` };

  const t = (title ?? '').trim().slice(0, MAX_TITLE_LEN) || '未命名白板';
  const { data, error } = await supabase
    .from('canvas_documents')
    .insert({ user_id: user.id, title: t, data: EMPTY as unknown as Json })
    .select('id')
    .single();
  if (error || !data) {
    if (error?.message?.includes('canvas_documents')) return { ok: false, error: '创建失败，请确认迁移 037 已执行' };
    console.error('[createCanvas]', error?.message);
    return { ok: false, error: '创建失败' };
  }
  revalidatePath('/canvas');
  return { ok: true, id: data.id };
}

export async function saveCanvas(input: {
  id: string;
  title?: string;
  data?: CanvasData;
  isPublic?: boolean;
}): Promise<CanvasResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: '请先登录' };

  const patch: { title?: string; data?: Json; is_public?: boolean } = {};
  if (input.title !== undefined) {
    const t = input.title.trim().slice(0, MAX_TITLE_LEN) || '未命名白板';
    patch.title = t;
  }
  if (input.data !== undefined) {
    if (input.data.nodes.length > MAX_NODES) return { ok: false, error: `节点数超过上限（${MAX_NODES}）` };
    patch.data = input.data as unknown as Json;
  }
  if (input.isPublic !== undefined) patch.is_public = input.isPublic;
  if (Object.keys(patch).length === 0) return { ok: true };

  const { error } = await supabase
    .from('canvas_documents')
    .update(patch)
    .eq('id', input.id)
    .eq('user_id', user.id);
  if (error) { console.error('[saveCanvas]', error.message); return { ok: false, error: '保存失败' }; }
  return { ok: true };
}

export async function deleteCanvas(id: string): Promise<CanvasResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: '请先登录' };

  const { error } = await supabase
    .from('canvas_documents')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id);
  if (error) { console.error('[deleteCanvas]', error.message); return { ok: false, error: '删除失败' }; }
  revalidatePath('/canvas');
  return { ok: true };
}
