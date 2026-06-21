'use server';

// 命令面板（⌘K Quick Switcher）的轻量索引：知识点 + 定理 + 当前用户笔记。
// 仅 id + 名称，绝不带正文/LaTeX；面板首次打开时拉取一次，前端本地模糊过滤。
// 题目/帖子/用户走按需的 searchAll（app/actions/search.ts），不在此预载。

import { createClient } from '@/lib/supabase/server';

export interface CommandIndex {
  topics: { id: string; name: string }[];
  theorems: { id: string; name: string }[];
  notes: { id: string; title: string }[];
}

export async function getCommandIndex(): Promise<CommandIndex> {
  const supabase = await createClient();

  // 知识点/定理公共可读；笔记按当前用户（RLS 限制在本人行）。
  const { data: { user } } = await supabase.auth.getUser();

  const [topicsRes, theoremsRes, notesRes] = await Promise.all([
    supabase.from('topics').select('id, name').order('name'),
    // 迁移 032 未跑 → 报错当空。
    supabase.from('theorems').select('id, name').order('name'),
    // 迁移 036 未跑 / 未登录 → 当空。
    user
      ? supabase.from('user_notes').select('id, title').eq('user_id', user.id).order('updated_at', { ascending: false })
      : Promise.resolve({ data: [] as { id: string; title: string }[], error: null }),
  ]);

  return {
    topics: topicsRes.error ? [] : (topicsRes.data ?? []),
    theorems: theoremsRes.error ? [] : (theoremsRes.data ?? []),
    notes: notesRes.error ? [] : (notesRes.data ?? []),
  };
}
