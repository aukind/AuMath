'use server';

// 维基链接悬停预览（Obsidian 式 hover-peek）。前端把 hover 到的链接 href 传来，
// 按 href 形态派发，返回轻量预览（标题 + 描述/片段）。命中失败返回 null（不弹卡）。
//   /explore?focus=NAME            → 知识点（描述 + 题量）
//   /explore?focus=NAME&type=theorem → 定理（描述 + 陈述片段）
//   /notes/ID  或  /notes?ref=TITLE → 笔记（正文片段）

import { createClient } from '@/lib/supabase/server';

export interface LinkPreview {
  kind: 'topic' | 'theorem' | 'note';
  title: string;
  description?: string | null;
  /** 次要片段（定理陈述 / 笔记正文，已截断、去多余空白） */
  snippet?: string;
  /** 一行元信息，如「12 道题」 */
  meta?: string;
}

/** 去公式/标记取纯文本片段。 */
function plain(s: string, n = 160): string {
  const t = (s ?? '')
    .replace(/\$\$[\s\S]*?\$\$/g, ' ').replace(/\$[^$\n]*?\$/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/\[\[([^\[\]|\n]+?)(?:\|[^\[\]\n]+?)?\]\]/g, '$1')
    .replace(/!?\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/[#>*_~]/g, ' ').replace(/\s+/g, ' ').trim();
  return t.length > n ? t.slice(0, n) + '…' : t;
}

export async function getLinkPreview(href: string): Promise<LinkPreview | null> {
  let url: URL;
  try { url = new URL(href, 'http://x'); } catch { return null; }
  const supabase = await createClient();

  try {
    if (url.pathname === '/explore') {
      const name = url.searchParams.get('focus');
      if (!name) return null;
      if (url.searchParams.get('type') === 'theorem') {
        const { data } = await supabase.from('theorems').select('name, description, statement').eq('name', name).maybeSingle();
        if (!data) return null;
        return { kind: 'theorem', title: data.name, description: data.description, snippet: plain(data.statement ?? '') };
      }
      const { data } = await supabase.from('topics').select('id, name, description').eq('name', name).maybeSingle();
      if (!data) return null;
      const { count } = await supabase
        .from('question_topic_relations')
        .select('question_id', { count: 'exact', head: true })
        .eq('topic_id', data.id);
      return { kind: 'topic', title: data.name, description: data.description, meta: count ? `${count} 道题` : undefined };
    }

    if (url.pathname.startsWith('/notes/')) {
      const id = url.pathname.slice('/notes/'.length).split('/')[0];
      if (!id) return null;
      const { data } = await supabase.from('user_notes').select('title, body_md').eq('id', id).maybeSingle();
      if (!data) return null;
      return { kind: 'note', title: data.title, snippet: plain(data.body_md ?? '') };
    }

    if (url.pathname === '/notes') {
      const title = url.searchParams.get('ref');
      if (!title) return null;
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const { data } = await supabase.from('user_notes').select('title, body_md').eq('user_id', user.id).eq('title', title).maybeSingle();
      if (!data) return null;
      return { kind: 'note', title: data.title, snippet: plain(data.body_md ?? '') };
    }
  } catch {
    return null;
  }
  return null;
}
