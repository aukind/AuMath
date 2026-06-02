'use server';

// 把裁剪出的几何图原图（base64 PNG）上传到 Storage，返回稳定公开 URL，
// 供录题时以 ![](url) 嵌入题目内容（无损位图路线）。

import { createAdminClient } from '@/lib/supabase/admin';

const BUCKET = 'paper-figures';

// 进程级缓存：bucket 只需确保一次。否则每张图上传前都 listBuckets() 多一次网络往返，
// 多图录题时累加成明显延迟（实测每张上传 ~900ms，串行+往返更慢）。
let bucketReady = false;

async function ensureBucket(supabase: ReturnType<typeof createAdminClient>) {
  if (bucketReady) return;
  const { data: buckets } = await supabase.storage.listBuckets();
  if (buckets?.some((b: { id: string }) => b.id === BUCKET)) { bucketReady = true; return; }
  await supabase.storage.createBucket(BUCKET, {
    public: true, // 题库页直接 <img> 引用，需公开读
    fileSizeLimit: 10 * 1024 * 1024,
    allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'],
  });
  bucketReady = true;
}

export type UploadFigureResult = { success: true; url: string } | { success: false; error: string };

async function uploadBytes(
  supabase: ReturnType<typeof createAdminClient>,
  bytes: Buffer,
  ext: string,
  contentType: string,
): Promise<UploadFigureResult> {
  await ensureBucket(supabase);
  const path = `figures/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, bytes, { contentType, upsert: false });
  if (error) return { success: false, error: error.message };
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return { success: true, url: data.publicUrl };
}

/** 上传裁剪原图 PNG（无损位图路线）。 */
export async function uploadFigureImage(base64Png: string): Promise<UploadFigureResult> {
  try {
    return await uploadBytes(createAdminClient(), Buffer.from(base64Png, 'base64'), 'png', 'image/png');
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** 上传云端 8B 编译好的矢量 SVG（最优质量路线）。题库以 <img src=.svg> 原生渲染。 */
export async function uploadFigureSvg(svg: string): Promise<UploadFigureResult> {
  try {
    return await uploadBytes(createAdminClient(), Buffer.from(svg, 'utf-8'), 'svg', 'image/svg+xml');
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}
