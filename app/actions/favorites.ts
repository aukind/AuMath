'use server';

// 收藏夹：给「我的收藏」分门别类（单归属，像文件夹）。
// 数据：favorite_folders 表 + user_favorites.folder_id（迁移 034）。
// 写操作一律返回判别联合、不 throw（生产脱敏）；RLS 已把每个用户限制在自己的行内。

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import type {
  QuestionWithTopics,
  FavoriteFolderOverview,
  FavoriteFolderFilter,
} from '@/types/database';

export type FavoriteResult<T = unknown> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

/** 单用户收藏夹数量上限：够分门别类，又挡住脚本刷爆。 */
const MAX_FOLDERS = 50;
const MAX_NAME_LEN = 30;

// ── 收藏夹概览：自建夹（带题数）+ 未分类数 + 总数 ──────────────────────────────
export async function listFavoriteFolders(): Promise<FavoriteFolderOverview> {
  const empty: FavoriteFolderOverview = { folders: [], uncategorizedCount: 0, totalCount: 0 };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return empty;

  const [foldersRes, favsRes] = await Promise.all([
    supabase
      .from('favorite_folders')
      .select('id, name, sort_order, created_at')
      .eq('user_id', user.id)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true }),
    supabase.from('user_favorites').select('folder_id').eq('user_id', user.id),
  ]);

  const favs = favsRes.data ?? [];
  const countByFolder = new Map<string, number>();
  let uncategorizedCount = 0;
  for (const f of favs) {
    if (f.folder_id) countByFolder.set(f.folder_id, (countByFolder.get(f.folder_id) ?? 0) + 1);
    else uncategorizedCount += 1;
  }

  return {
    folders: (foldersRes.data ?? []).map((f) => ({
      id: f.id,
      name: f.name,
      count: countByFolder.get(f.id) ?? 0,
    })),
    uncategorizedCount,
    totalCount: favs.length,
  };
}

// ── 按收藏夹取收藏题（'all' 全部 / 'uncategorized' 未分类 / 其余为夹 id）───────────
export async function getFavoriteQuestions(
  filter: FavoriteFolderFilter = 'all',
): Promise<QuestionWithTopics[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  let q = supabase.from('user_favorites').select('question_id').eq('user_id', user.id);
  if (filter === 'uncategorized') q = q.is('folder_id', null);
  else if (filter !== 'all') q = q.eq('folder_id', filter);

  const { data: rows } = await q.order('created_at', { ascending: false }).limit(100);
  if (!rows?.length) return [];

  const ids = rows.map((r) => r.question_id);
  const { data: questions } = await supabase
    .from('questions')
    .select('*, question_topic_relations(question_id, topic_id, topics(*))')
    .eq('status', 'published')
    .in('id', ids);

  // 保持收藏顺序（IN 不保证返回顺序）
  const qMap = new Map(
    ((questions ?? []) as unknown as QuestionWithTopics[]).map((x) => [x.id, x]),
  );
  return ids.map((id) => qMap.get(id)).filter(Boolean) as QuestionWithTopics[];
}

// ── 新建收藏夹 ───────────────────────────────────────────────────────────────
export async function createFavoriteFolder(
  name: string,
): Promise<FavoriteResult<{ folder: { id: string; name: string } }>> {
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: '收藏夹名称不能为空' };
  if (trimmed.length > MAX_NAME_LEN) return { ok: false, error: `名称最多 ${MAX_NAME_LEN} 字` };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: '请先登录' };

  const { count } = await supabase
    .from('favorite_folders')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id);
  if ((count ?? 0) >= MAX_FOLDERS) return { ok: false, error: `收藏夹最多 ${MAX_FOLDERS} 个` };

  const { data, error } = await supabase
    .from('favorite_folders')
    .insert({ user_id: user.id, name: trimmed, sort_order: count ?? 0 })
    .select('id, name')
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? '创建失败' };

  revalidatePath('/');
  return { ok: true, folder: { id: data.id, name: data.name } };
}

// ── 重命名收藏夹 ─────────────────────────────────────────────────────────────
export async function renameFavoriteFolder(
  folderId: string,
  name: string,
): Promise<FavoriteResult> {
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: '收藏夹名称不能为空' };
  if (trimmed.length > MAX_NAME_LEN) return { ok: false, error: `名称最多 ${MAX_NAME_LEN} 字` };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: '请先登录' };

  const { error } = await supabase
    .from('favorite_folders')
    .update({ name: trimmed })
    .eq('id', folderId)
    .eq('user_id', user.id);
  if (error) return { ok: false, error: error.message };

  revalidatePath('/');
  return { ok: true };
}

// ── 删除收藏夹（夹内收藏题 folder_id 自动置空，落回未分类）──────────────────────
export async function deleteFavoriteFolder(folderId: string): Promise<FavoriteResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: '请先登录' };

  const { error } = await supabase
    .from('favorite_folders')
    .delete()
    .eq('id', folderId)
    .eq('user_id', user.id);
  if (error) return { ok: false, error: error.message };

  revalidatePath('/');
  return { ok: true };
}

// ── 批量把收藏题移动到某收藏夹（folderId=null 移回未分类）───────────────────────
export async function moveFavoritesToFolder(
  questionIds: string[],
  folderId: string | null,
): Promise<FavoriteResult> {
  if (!questionIds.length) return { ok: false, error: '未选择任何题目' };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: '请先登录' };

  // 目标夹必须属于本人（RLS 不限制 folder_id 取值，这里显式校验防越权写入他人夹 id）
  if (folderId) {
    const { data: owned } = await supabase
      .from('favorite_folders')
      .select('id')
      .eq('id', folderId)
      .eq('user_id', user.id)
      .maybeSingle();
    if (!owned) return { ok: false, error: '收藏夹不存在' };
  }

  const { error } = await supabase
    .from('user_favorites')
    .update({ folder_id: folderId })
    .eq('user_id', user.id)
    .in('question_id', questionIds);
  if (error) return { ok: false, error: error.message };

  revalidatePath('/');
  return { ok: true };
}
