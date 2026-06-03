'use server';

// 资源大厅 (Library) Server Actions —— 实现 types/library.ts 的 LibraryActions 契约。
//   · 读取走带 cookie 的用户态客户端（过 RLS）；
//   · 文件上传 + 加精走 service_role admin client（绕 RLS），镜像 forum-image.ts / geometry-library.ts；
//   · 举报/计数走 SECURITY DEFINER RPC，DB 层原子化，杜绝客户端读后 +1。

/* eslint-disable @typescript-eslint/no-explicit-any */

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAdminUser } from '@/lib/utils/auth';
import {
  RESOURCE_TYPES,
  EDU_STAGES,
  type EduStage,
  type FinalizeUploadInput,
  type LibraryFilter,
  type LibraryItem,
  type ResourceType,
} from '@/types/library';

const BUCKET = 'library-pdfs';
const COVER_BUCKET = 'library-covers';
const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46]; // "%PDF"
const MAX_COVER_BYTES = 2 * 1024 * 1024; // 封面 ≤2MB

/** 白名单兜底：越界值归「其他」。 */
function safeType(v: unknown): ResourceType {
  return (RESOURCE_TYPES as readonly string[]).includes(v as string)
    ? (v as ResourceType)
    : '其他';
}
function safeStage(v: unknown): EduStage {
  return (EDU_STAGES as readonly string[]).includes(v as string)
    ? (v as EduStage)
    : '其他';
}

/** 由对象路径拼公开 URL（bucket 为公开桶）。 */
function publicUrl(objectName: string): string {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  return `${base}/storage/v1/object/public/${BUCKET}/${objectName}`;
}

// DB 行 → LibraryItem（author 投影驼峰化）
function mapItem(row: any): LibraryItem {
  const author = Array.isArray(row.author) ? row.author[0] : row.author;
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? null,
    pdf_url: row.pdf_url,
    cover_url: row.cover_url ?? null,
    author_id: row.author_id,
    is_official: !!row.is_official,
    status: row.status,
    view_count: row.view_count ?? 0,
    download_count: row.download_count ?? 0,
    report_count: row.report_count ?? 0,
    upvote_count: row.upvote_count ?? 0,
    tags: row.tags ?? [],
    resource_type: safeType(row.resource_type),
    edu_stage: safeStage(row.edu_stage),
    created_at: row.created_at,
    author: author
      ? { username: author.username ?? '匿名', avatarUrl: author.avatar_url ?? undefined }
      : undefined,
  };
}

const SELECT =
  '*, author:profiles!library_items_author_id_fkey(username, avatar_url)';

/** 大厅列表：仅返回 published；按官方优先、再时间倒序。 */
export async function getLibraryItems(
  filter: LibraryFilter = 'all',
): Promise<LibraryItem[]> {
  const supabase = await createClient();
  const sb = supabase as any;

  let query = sb
    .from('library_items')
    .select(SELECT)
    .eq('status', 'published')
    .order('is_official', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(100);

  if (filter === 'official') query = query.eq('is_official', true);
  else if (filter === 'community') query = query.eq('is_official', false);

  const { data, error } = await query;
  if (error) {
    console.error('[getLibraryItems]', error.message);
    return [];
  }
  return (data ?? []).map(mapItem);
}

/**
 * 上传 finalize：文件已由浏览器 tus 续传直传 Storage（≤5GB），此处只校验 + 落元数据。
 * 默认进社区流（published / is_official=false）。
 *
 * 防伪装两段式之第二段——对已传对象发 `Range: 0-7` 只取 8 字节复验 `%PDF`，
 * 既不下载全量、又能拦下「客户端绕过头校验直传的伪装文件」；失败即删对象 + 拒绝入库。
 */
export async function finalizeLibraryUpload(
  input: FinalizeUploadInput,
): Promise<{ success: boolean; id?: string; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: '请先登录' };

  const objectName = (input.objectName ?? '').trim();
  const title = (input.title ?? '').trim();
  if (!title) return { success: false, error: '请填写标题' };
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

  const tags = Array.from(
    new Set((input.tags ?? []).map((t) => t.trim()).filter(Boolean)),
  ).slice(0, 8);

  // 落库用带用户态客户端，让 RLS library_insert_own 兜底校验本人 + UGC
  const sb = supabase as any;
  const { data, error } = await sb
    .from('library_items')
    .insert({
      title,
      description: (input.description ?? '').trim() || null,
      pdf_url: url,
      author_id: user.id,
      is_official: false,
      status: 'published',
      tags,
      resource_type: safeType(input.resourceType),
      edu_stage: safeStage(input.eduStage),
    })
    .select('id')
    .single();
  if (error) {
    // 入库失败则回收已传对象，避免孤儿文件
    await admin.storage.from(BUCKET).remove([objectName]).catch(() => {});
    return { success: false, error: '入库失败：' + error.message };
  }

  revalidatePath('/library');
  return { success: true, id: (data as { id: string }).id };
}

/** 举报：原子去重累加；达阈值自动转 pending_review（DB 触发器）。 */
export async function reportItem(
  itemId: string,
): Promise<{ success: boolean; hidden?: boolean }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false };

  const sb = supabase as any;
  const { data, error } = await sb.rpc('report_library_item', { p_id: itemId });
  if (error) {
    console.error('[reportItem]', error.message);
    return { success: false };
  }
  const hidden = (data as any)?.status === 'pending_review';
  if (hidden) revalidatePath('/library');
  return { success: true, hidden };
}

/**
 * 点赞 / 取消点赞（迁移 020）。原子 toggle 走 SECURITY DEFINER RPC，DB 端推导计数，
 * 镜像 reportItem 的写法。未登录返回失败，由前端引导登录。
 */
export async function toggleUpvote(
  itemId: string,
): Promise<{ success: boolean; upvoted: boolean; upvotes: number }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, upvoted: false, upvotes: 0 };

  const sb = supabase as any;
  const { data, error } = await sb.rpc('toggle_library_upvote', { p_id: itemId });
  if (error) {
    console.error('[toggleUpvote]', error.message);
    return { success: false, upvoted: false, upvotes: 0 };
  }
  return {
    success: true,
    upvoted: !!(data as any)?.upvoted,
    upvotes: (data as any)?.upvote_count ?? 0,
  };
}

/** 当前用户点过赞的资料 id 列表（访客返回空）。供大厅初始填充爱心实心态。 */
export async function getMyLibraryUpvotes(): Promise<string[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const sb = supabase as any;
  const { data, error } = await sb
    .from('library_item_upvotes')
    .select('item_id')
    .eq('user_id', user.id);
  if (error) {
    console.error('[getMyLibraryUpvotes]', error.message);
    return [];
  }
  return (data ?? []).map((r: { item_id: string }) => r.item_id);
}

/** 加精（Admin only）：转官方精选并确保公开。走 service_role 绕 RLS。 */
export async function promoteItem(itemId: string): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!isAdminUser(user)) return false;

  const admin = createAdminClient();
  const { error } = await admin
    .from('library_items')
    .update({ is_official: true, status: 'published' })
    .eq('id', itemId);
  if (error) {
    console.error('[promoteItem]', error.message);
    return false;
  }
  revalidatePath('/library');
  return true;
}

/**
 * 写入封面：客户端用 PDF.js 取第 1 页生成的缩略图 JPEG（数十 KB，走 server action 无 OOM 风险）。
 * 鉴权本人/admin → service_role 懒建公开桶 library-covers → 上传 → 回写 cover_url。
 */
export async function uploadLibraryCover(
  itemId: string,
  formData: FormData,
): Promise<{ success: boolean; url?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false };

  const sb = supabase as any;
  const { data: row } = await sb
    .from('library_items')
    .select('author_id')
    .eq('id', itemId)
    .single();
  if (!row) return { success: false };
  if (row.author_id !== user.id && !isAdminUser(user)) return { success: false };

  const file = formData.get('cover');
  if (!(file instanceof File) || file.size === 0) return { success: false };
  if (file.size > MAX_COVER_BYTES) return { success: false };
  if (!file.type.startsWith('image/')) return { success: false };

  const admin = createAdminClient();
  await admin.storage
    .createBucket(COVER_BUCKET, {
      public: true,
      fileSizeLimit: MAX_COVER_BYTES,
      allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
    })
    .catch(() => {});

  const key = `${user.id}/${itemId}.jpg`;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const { error: upErr } = await admin.storage
    .from(COVER_BUCKET)
    .upload(key, bytes, { contentType: file.type || 'image/jpeg', upsert: true, cacheControl: '3600' });
  if (upErr) return { success: false };

  const { data: pub } = admin.storage.from(COVER_BUCKET).getPublicUrl(key);
  const url = pub.publicUrl;
  await admin.from('library_items').update({ cover_url: url }).eq('id', itemId);
  revalidatePath('/library');
  return { success: true, url };
}

/** 阅读器打开埋点：原子 +1 浏览。允许访客。 */
export async function recordView(itemId: string): Promise<void> {
  const supabase = await createClient();
  await (supabase as any).rpc('increment_library_view', { p_id: itemId });
}

/** 下载埋点：原子 +1 下载。允许访客。 */
export async function recordDownload(itemId: string): Promise<void> {
  const supabase = await createClient();
  await (supabase as any).rpc('increment_library_download', { p_id: itemId });
}
