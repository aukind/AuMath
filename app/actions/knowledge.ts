'use server';

// 个人 PDF 知识库 (Knowledge Base) Server Actions —— 迁移 027 user_documents。
//   · 来源 studio：LaTeX 工作室编译产物，浏览器已直传 library-pdfs 桶 ${uid}/kb/*.pdf，
//     此处只校验对象归属 + %PDF 魔数后落元数据（镜像 library.ts 的 finalizeLibraryUpload）。
//   · 来源 library：资源大厅一键收藏，存引用快照（library_item_id + 标题/封面/url），不复制文件。
//   · 读写均走带 cookie 的用户态客户端，过 user_documents 的 owner-only RLS。

/* eslint-disable @typescript-eslint/no-explicit-any */

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import type { KnowledgeDoc } from '@/types/library';

const BUCKET = 'library-pdfs';
const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46]; // "%PDF"

/** 由对象路径拼公开 URL（library-pdfs 为公开桶）。 */
function publicUrl(objectName: string): string {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  return `${base}/storage/v1/object/public/${BUCKET}/${objectName}`;
}

function mapDoc(row: any): KnowledgeDoc {
  return {
    id: row.id,
    title: row.title,
    source: row.source,
    pdf_url: row.pdf_url,
    cover_url: row.cover_url ?? null,
    library_item_id: row.library_item_id ?? null,
    created_at: row.created_at,
  };
}

/** 我的知识库列表：本人全部文档，按收藏时间倒序。 */
export async function getMyKnowledgeDocs(): Promise<KnowledgeDoc[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await (supabase as any)
    .from('user_documents')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) {
    console.error('[getMyKnowledgeDocs]', error.message);
    return [];
  }
  return (data ?? []).map(mapDoc);
}

/** 已收藏的公共资料 id 列表（library 来源），用于点亮大厅卡片书签态。访客返回空。 */
export async function getMyKnowledgeItemIds(): Promise<string[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await (supabase as any)
    .from('user_documents')
    .select('library_item_id')
    .eq('user_id', user.id)
    .not('library_item_id', 'is', null);
  if (error) {
    console.error('[getMyKnowledgeItemIds]', error.message);
    return [];
  }
  return (data ?? []).map((r: { library_item_id: string }) => r.library_item_id);
}

/**
 * 资源大厅一键收藏到知识库：存引用快照，不复制文件。
 * 唯一索引 idx_user_documents_lib 天然防重复；重复收藏返回 already=true。
 */
export async function saveLibraryItemToKnowledge(
  itemId: string,
): Promise<{ success: boolean; already?: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: '请先登录' };

  const sb = supabase as any;
  // 读公共资料快照（仅 published 可收藏）
  const { data: item, error: readErr } = await sb
    .from('library_items')
    .select('id, title, pdf_url, cover_url, status')
    .eq('id', itemId)
    .single();
  if (readErr || !item) return { success: false, error: '资料不存在' };
  if (item.status !== 'published') return { success: false, error: '该资料暂不可收藏' };

  const { error } = await sb.from('user_documents').insert({
    user_id: user.id,
    title: item.title,
    source: 'library',
    pdf_url: item.pdf_url,
    cover_url: item.cover_url ?? null,
    library_item_id: item.id,
  });
  if (error) {
    // 唯一索引冲突 = 已收藏过，视为幂等成功
    if ((error as any).code === '23505') return { success: true, already: true };
    return { success: false, error: error.message };
  }

  revalidatePath('/');
  return { success: true };
}

/** 取消收藏某公共资料（按 library_item_id 删本人对应知识库条目）。 */
export async function unsaveLibraryItem(
  itemId: string,
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: '请先登录' };

  const { error } = await (supabase as any)
    .from('user_documents')
    .delete()
    .eq('user_id', user.id)
    .eq('library_item_id', itemId);
  if (error) return { success: false, error: error.message };

  revalidatePath('/');
  return { success: true };
}

/**
 * LaTeX 工作室编译产物入库：文件已由浏览器直传 library-pdfs 桶（${uid}/kb/*.pdf），
 * 此处校验对象归属 + 发 `Range:0-7` 复验 %PDF（镜像 library.ts finalizeLibraryUpload），
 * 通过后落 source='studio' 的知识库行。不写 library_items，故不进公共大厅。
 */
export async function addStudioDocument(input: {
  objectName: string;
  title: string;
  coverUrl?: string | null;
}): Promise<{ success: boolean; id?: string; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: '请先登录' };

  const objectName = (input.objectName ?? '').trim();
  const title = (input.title ?? '').trim() || '未命名文档';
  // 越权防御：对象路径必须落在本人 uid 目录下（与 storage.objects RLS 双保险）
  if (!objectName || !objectName.startsWith(`${user.id}/`) || objectName.includes('..')) {
    return { success: false, error: '非法的对象路径' };
  }

  const url = publicUrl(objectName);
  const admin = createAdminClient();

  // 服务端 Magic Number 复验（仅取前 8 字节）
  try {
    const head = await fetch(url, { headers: { Range: 'bytes=0-7' }, cache: 'no-store' });
    if (!head.ok && head.status !== 206) {
      await admin.storage.from(BUCKET).remove([objectName]).catch(() => {});
      return { success: false, error: '无法读取已上传文件，请重试' };
    }
    const bytes = new Uint8Array(await head.arrayBuffer());
    const headOk = bytes.length >= 4 && PDF_MAGIC.every((b, i) => bytes[i] === b);
    if (!headOk) {
      await admin.storage.from(BUCKET).remove([objectName]).catch(() => {});
      return { success: false, error: '文件不是合法的 PDF（签名校验失败）' };
    }
  } catch {
    return { success: false, error: '文件校验失败，请重试' };
  }

  const sb = supabase as any;
  const { data, error } = await sb
    .from('user_documents')
    .insert({
      user_id: user.id,
      title,
      source: 'studio',
      pdf_url: url,
      cover_url: input.coverUrl ?? null,
    })
    .select('id')
    .single();
  if (error) {
    await admin.storage.from(BUCKET).remove([objectName]).catch(() => {});
    return { success: false, error: '入库失败：' + error.message };
  }

  revalidatePath('/');
  return { success: true, id: (data as { id: string }).id };
}

/** 从知识库移除一条（仅删本人；studio 来源的 Storage 对象一并回收，library 引用不动原文件）。 */
export async function removeKnowledgeDoc(
  id: string,
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: '请先登录' };

  const sb = supabase as any;
  const { data: row } = await sb
    .from('user_documents')
    .select('source, pdf_url')
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle();
  if (!row) return { success: false, error: '文档不存在' };

  const { error } = await sb
    .from('user_documents')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id);
  if (error) return { success: false, error: error.message };

  // studio 自有产物：回收 Storage 对象，避免孤儿文件（library 引用绝不删公共原文件）
  if (row.source === 'studio') {
    const prefix = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${BUCKET}/`;
    if (typeof row.pdf_url === 'string' && row.pdf_url.startsWith(prefix)) {
      const objectName = row.pdf_url.slice(prefix.length);
      if (objectName.startsWith(`${user.id}/`)) {
        await createAdminClient().storage.from(BUCKET).remove([objectName]).catch(() => {});
      }
    }
  }

  revalidatePath('/');
  return { success: true };
}
