import type { User } from '@supabase/supabase-js';

export function isAdminUser(user: User | null | undefined): boolean {
  return user?.app_metadata?.role === 'admin';
}
