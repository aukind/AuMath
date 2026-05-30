'use server';

import { createClient } from '@/lib/supabase/server';

export async function getSiteViews(): Promise<number> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('site_statistics')
    .select('total_views')
    .eq('id', 1)
    .single();
  return (data as { total_views: number } | null)?.total_views ?? 0;
}

export async function incrementSiteViews(): Promise<void> {
  const supabase = await createClient();
  await supabase.rpc('increment_site_views' as never);
}
