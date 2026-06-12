import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { Database } from '@/types/supabase';

/** 服务端客户端实例类型（供工具函数收参用，如 lib/notifications.ts） */
export type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

/**
 * 服务端 Supabase 客户端（用于 Server Components 和 Server Actions）。
 * 必须在异步上下文中调用，每次请求都应创建新实例。
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Server Component 中调用 setAll 会抛出，可安全忽略。
            // 若需要刷新 session，请改在 middleware 中处理。
          }
        },
      },
    },
  );
}
