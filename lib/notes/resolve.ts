// 维基链接解析：把笔记正文抽出的 WikiRef（{type,name}）批量解析成 note_links 行。
// 解析命中 → 带 target_id（喂星图边/反链）；未命中 → target_id=NULL（悬挂链接，仍记录）。
//
// 解析范围与权限：
//   topic / theorem —— 公共可读，按 name 唯一命中。
//   note            —— 仅当前用户自己的笔记，按 (user_id,title) 命中。
//   question        —— 题目无稳定人类名，暂不解析（恒为悬挂），渲染侧回退到 /search。
// 注意：依赖调用方传入「带当前用户身份」的 supabase 客户端（RLS 保证只读到本人笔记）。

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/supabase';
import type { WikiRef } from '@/lib/utils/wikiLinks';

export interface ResolvedNoteLink {
  target_type: 'topic' | 'theorem' | 'question' | 'note';
  target_id: string | null;
  target_label: string;
}

/** 批量解析 refs。selfNoteId 用于排除「笔记链接到自己」的自环。 */
export async function resolveWikiRefs(
  supabase: SupabaseClient<Database>,
  userId: string,
  refs: WikiRef[],
  selfNoteId?: string,
): Promise<ResolvedNoteLink[]> {
  if (refs.length === 0) return [];

  const topicNames = [...new Set(refs.filter(r => r.type === 'topic').map(r => r.name))];
  const theoremNames = [...new Set(refs.filter(r => r.type === 'theorem').map(r => r.name))];
  const noteTitles = [...new Set(refs.filter(r => r.type === 'note').map(r => r.name))];

  // 三类批量查（任一表/迁移缺席时静默当空，不阻断保存）。
  const [topicsRes, theoremsRes, notesRes] = await Promise.all([
    topicNames.length
      ? supabase.from('topics').select('id, name').in('name', topicNames)
      : Promise.resolve({ data: [] as { id: string; name: string }[], error: null }),
    theoremNames.length
      ? supabase.from('theorems').select('id, name').in('name', theoremNames)
      : Promise.resolve({ data: [] as { id: string; name: string }[], error: null }),
    noteTitles.length
      ? supabase.from('user_notes').select('id, title').eq('user_id', userId).in('title', noteTitles)
      : Promise.resolve({ data: [] as { id: string; title: string }[], error: null }),
  ]);

  const topicByName = new Map((topicsRes.data ?? []).map(t => [t.name, t.id]));
  const theoremByName = new Map((theoremsRes.data ?? []).map(t => [t.name, t.id]));
  const noteByTitle = new Map((notesRes.data ?? []).map(n => [n.title, n.id]));

  const out: ResolvedNoteLink[] = [];
  for (const r of refs) {
    let target_id: string | null = null;
    if (r.type === 'topic') target_id = topicByName.get(r.name) ?? null;
    else if (r.type === 'theorem') target_id = theoremByName.get(r.name) ?? null;
    else if (r.type === 'note') target_id = noteByTitle.get(r.name) ?? null;
    // question 恒悬挂（target_id=null）

    // 跳过指向自身的自环（笔记标题恰好等于自己）。
    if (r.type === 'note' && selfNoteId && target_id === selfNoteId) continue;

    out.push({ target_type: r.type, target_id, target_label: r.name });
  }
  return out;
}
