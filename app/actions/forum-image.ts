'use server';

// 论坛配图上传。镜像 app/actions/account.ts 的 uploadAvatar：
// 用 service_role 懒建 public bucket `forum-images`，上传后返回公开 URL。无需 SQL 迁移。

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

const BUCKET = 'forum-images';
const MAX_BYTES = 6 * 1024 * 1024;

export async function uploadForumImage(formData: FormData): Promise<{ url: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('请先登录');

  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) throw new Error('未收到文件');
  if (file.size > MAX_BYTES) throw new Error('图片不能超过 6MB');
  if (!file.type.startsWith('image/')) throw new Error('仅支持图片格式');

  const admin = createAdminClient();
  // 懒创建公开 bucket（已存在则忽略）
  await admin.storage
    .createBucket(BUCKET, { public: true, fileSizeLimit: MAX_BYTES })
    .catch(() => {});

  const ext = (file.name.split('.').pop() || 'png').toLowerCase();
  const key = `${user.id}/${Date.now()}.${ext}`;
  const bytes = new Uint8Array(await file.arrayBuffer());

  const { error } = await admin.storage
    .from(BUCKET)
    // key 带时间戳，天然不可变 → 长缓存（1 年），让 Storage CDN 兜住 egress。
    .upload(key, bytes, { contentType: file.type, upsert: true, cacheControl: '31536000' });
  if (error) throw new Error('上传失败：' + error.message);

  const { data: pub } = admin.storage.from(BUCKET).getPublicUrl(key);
  return { url: pub.publicUrl };
}
