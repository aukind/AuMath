import { createClient } from '@supabase/supabase-js';

/** 使用 service_role key，绕过 RLS，仅在 Server Actions / 服务端使用。
 *  不传 Database 泛型，避免与实际远端 schema 的偏差产生类型冲突。 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return createClient<any>(url, key, { auth: { persistSession: false } });
}
