'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

/** Supabase Auth 常见报错 → 中文。生产站点不该把英文原始报错直接糊到用户脸上。 */
function toZhAuthError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('invalid login credentials')) return '邮箱或密码不正确';
  if (m.includes('email not confirmed')) return '邮箱尚未验证，请先查收验证邮件';
  if (m.includes('user already registered')) return '该邮箱已注册，请直接登录';
  if (m.includes('password should be at least')) return '密码至少需要 6 位';
  if (m.includes('rate limit') || m.includes('too many requests')) return '操作过于频繁，请稍后再试';
  if (m.includes('invalid email') || m.includes('unable to validate email')) return '邮箱格式不正确';
  return message; // 未覆盖的报错保留原文，便于排查
}

/** 防开放重定向：只接受站内相对路径（"/xxx"），其余一律回首页。 */
function safeRedirectPath(raw: unknown): string {
  if (typeof raw === 'string' && raw.startsWith('/') && !raw.startsWith('//')) return raw;
  return '/';
}

export async function login(formData: FormData) {
  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithPassword({
    email:    formData.get('email')    as string,
    password: formData.get('password') as string,
  });

  const redirectTo = safeRedirectPath(formData.get('redirectTo'));

  if (error) {
    const params = new URLSearchParams({ error: toZhAuthError(error.message) });
    if (redirectTo !== '/') params.set('redirectTo', redirectTo);
    redirect(`/login?${params}`);
  }

  revalidatePath('/', 'layout');
  // 尊重 middleware 带来的 redirectTo：从 /studio 被弹去登录的用户，登录后应回 /studio
  redirect(redirectTo);
}

export async function signup(formData: FormData) {
  const supabase = await createClient();

  const { error } = await supabase.auth.signUp({
    email:    formData.get('email')    as string,
    password: formData.get('password') as string,
  });

  if (error) {
    redirect('/signup?error=' + encodeURIComponent(toZhAuthError(error.message)));
  }

  revalidatePath('/', 'layout');
  redirect('/signup?success=1');
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath('/', 'layout');
  redirect('/login');
}
