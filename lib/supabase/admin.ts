import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/supabase';

/** 使用 service_role key，绕过 RLS，仅在 Server Actions / 服务端使用。 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY');
  return createClient<Database>(url, key, { auth: { persistSession: false } });
}
