'use server';

// 把裁剪出的几何图原图（base64 PNG）上传到 Storage，返回稳定公开 URL，
// 供录题时以 ![](url) 嵌入题目内容（无损位图路线）。

import { createAdminClient } from '@/lib/supabase/admin';

const BUCKET = 'paper-figures';

async function ensureBucket(supabase: ReturnType<typeof createAdminClient>) {
  const { data: buckets } = await supabase.storage.listBuckets();
  if (buckets?.some((b: { id: string }) => b.id === BUCKET)) return;
  await supabase.storage.createBucket(BUCKET, {
    public: true, // 题库页直接 <img> 引用，需公开读
    fileSizeLimit: 10 * 1024 * 1024,
    allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp'],
  });
}

export type UploadFigureResult = { success: true; url: string } | { success: false; error: string };

export async function uploadFigureImage(base64Png: string): Promise<UploadFigureResult> {
  try {
    const supabase = createAdminClient();
    await ensureBucket(supabase);
    const bytes = Buffer.from(base64Png, 'base64');
    const path = `figures/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.png`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, bytes, {
      contentType: 'image/png',
      upsert: false,
    });
    if (error) return { success: false, error: error.message };
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
    return { success: true, url: data.publicUrl };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}
