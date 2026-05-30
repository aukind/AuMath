'use server';

// 个人账号管理 Server Actions：用户名 / 头像 / 密码。
// 头像存到公开 bucket `avatars`（首次使用时用 service_role 懒创建，无需额外迁移）。

/* eslint-disable @typescript-eslint/no-explicit-any */

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

const AVATAR_BUCKET = 'avatars';
const MAX_AVATAR_BYTES = 4 * 1024 * 1024;

export interface MyAccount {
  id: string;
  email: string | null;
  username: string;
  avatarUrl: string | null;
  role: 'admin' | 'user';
}

export async function getMyAccount(): Promise<MyAccount | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const sb = supabase as any;
  const { data } = await sb
    .from('profiles')
    .select('username, avatar_url, role')
    .eq('id', user.id)
    .single();

  return {
    id: user.id,
    email: user.email ?? null,
    username: data?.username ?? user.email?.split('@')[0] ?? '我',
    avatarUrl: data?.avatar_url ?? null,
    role: data?.role === 'admin' ? 'admin' : 'user',
  };
}

export async function updateUsername(username: string): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('未登录');

  const name = username.trim();
  if (name.length < 1 || name.length > 30) throw new Error('用户名需在 1–30 字之间');

  const sb = supabase as any;
  const { error } = await sb.from('profiles').update({ username: name }).eq('id', user.id);
  if (error) throw new Error('更新失败：' + error.message);
  revalidatePath('/account');
  revalidatePath('/');
}

export async function changePassword(newPassword: string): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('未登录');
  if (newPassword.length < 6) throw new Error('密码至少 6 位');

  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw new Error('修改密码失败：' + error.message);
}

export async function uploadAvatar(formData: FormData): Promise<{ url: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('未登录');

  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) throw new Error('未收到文件');
  if (file.size > MAX_AVATAR_BYTES) throw new Error('头像不能超过 4MB');
  if (!file.type.startsWith('image/')) throw new Error('仅支持图片格式');

  const admin = createAdminClient();
  // 懒创建公开 bucket（已存在则忽略报错），避免额外手动迁移。
  await admin.storage
    .createBucket(AVATAR_BUCKET, { public: true, fileSizeLimit: MAX_AVATAR_BYTES })
    .catch(() => {});

  const ext = (file.name.split('.').pop() || 'png').toLowerCase();
  const key = `${user.id}/${Date.now()}.${ext}`;
  const bytes = new Uint8Array(await file.arrayBuffer());

  const { error: upErr } = await admin.storage
    .from(AVATAR_BUCKET)
    .upload(key, bytes, { contentType: file.type, upsert: true, cacheControl: '3600' });
  if (upErr) throw new Error('上传失败：' + upErr.message);

  const { data: pub } = admin.storage.from(AVATAR_BUCKET).getPublicUrl(key);

  const sb = supabase as any;
  await sb.from('profiles').update({ avatar_url: pub.publicUrl }).eq('id', user.id);
  revalidatePath('/account');
  revalidatePath('/');
  return { url: pub.publicUrl };
}
