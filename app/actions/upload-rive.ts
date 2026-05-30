'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAdminUser } from '@/lib/utils/auth';

const BUCKET = 'interactive-sandboxes';
const MAX_BYTES = 10 * 1024 * 1024;

export interface UploadRiveResult {
  success: boolean;
  url?: string;
  error?: string;
}

export async function uploadRiveAsset(formData: FormData): Promise<UploadRiveResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: '请先登录' };
  if (!isAdminUser(user)) return { success: false, error: '仅管理员可上传 Rive 资源' };

  const file = formData.get('file');
  if (!(file instanceof File)) return { success: false, error: '未收到文件' };
  if (file.size === 0) return { success: false, error: '文件为空' };
  if (file.size > MAX_BYTES) return { success: false, error: `文件超过 ${MAX_BYTES / 1024 / 1024} MB 上限` };
  if (!file.name.toLowerCase().endsWith('.riv')) {
    return { success: false, error: '仅接受 .riv 格式文件' };
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return { success: false, error: '服务端配置错误：缺少 SUPABASE_SERVICE_ROLE_KEY' };
  }

  // Generate a collision-free object key: <timestamp>-<uuid>.riv
  const objectKey = `${Date.now()}-${crypto.randomUUID()}.riv`;
  const bytes = new Uint8Array(await file.arrayBuffer());

  const { error: uploadErr } = await admin.storage
    .from(BUCKET)
    .upload(objectKey, bytes, {
      contentType: 'application/octet-stream',
      cacheControl: '31536000',
      upsert: false,
    });

  if (uploadErr) return { success: false, error: `上传失败：${uploadErr.message}` };

  const { data: pub } = admin.storage.from(BUCKET).getPublicUrl(objectKey);
  return { success: true, url: pub.publicUrl };
}
