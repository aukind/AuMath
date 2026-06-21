'use server';

// 用户原子笔记层（Zettelkasten）—— Obsidian 化的「灵魂层」。数据：user_notes + note_links（迁移 036）。
// 写操作一律返回判别联合、不 throw（生产脱敏）；RLS 已把每个用户限制在自己的笔记内。
// 保存时用 extractWikiRefs 抽出正文 [[维基链接]]，经 resolveWikiRefs 解析后重建 note_links，
// 这些边即刻喂给知识星图（个人化层）与反向链接面板——学生的笔记由此长进知识网。

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { extractWikiRefs } from '@/lib/utils/wikiLinks';
import { resolveWikiRefs } from '@/lib/notes/resolve';
import { findUnlinkedNames, wrapFirstMention } from '@/lib/notes/mentions';
import type { NoteSummary, NoteDetail, NoteOutLink, NoteBacklink, NoteResult, UnlinkedMention } from '@/types/notes';

const MAX_NOTES = 1000;        // 单用户笔记上限，挡脚本刷爆
const MAX_TITLE_LEN = 120;
const MAX_BODY_LEN = 100_000;  // 单篇正文上限（约 10 万字符）

/** 正文去公式/markdown 标记，取前 N 字作列表预览。 */
function makeSnippet(body: string, n = 100): string {
  const plain = body
    .replace(/\$\$[\s\S]*?\$\$/g, ' ')
    .replace(/\$[^$\n]*?\$/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/\[\[([^\[\]|\n]+?)(?:\|[^\[\]\n]+?)?\]\]/g, '$1')
    .replace(/[#>*_~\-]/g, ' ')
    .replace(/!?\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return plain.length > n ? plain.slice(0, n) + '…' : plain;
}

// ── 列表：我的全部笔记（按更新时间倒序）────────────────────────────
export async function getMyNotes(): Promise<NoteSummary[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from('user_notes')
    .select('id, title, is_public, body_md, updated_at, note_links(note_id)')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false });
  if (error) {
    console.error('[getMyNotes]', error.message);
    return [];
  }

  return (data ?? []).map((n) => ({
    id: n.id,
    title: n.title,
    isPublic: n.is_public,
    updatedAt: n.updated_at,
    snippet: makeSnippet(n.body_md ?? ''),
    linkCount: Array.isArray(n.note_links) ? n.note_links.length : 0,
  }));
}

// ── 单篇详情（含出链 + 反链）──────────────────────────────────────
async function buildDetail(noteId: string): Promise<NoteDetail | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: note, error } = await supabase
    .from('user_notes')
    .select('id, user_id, title, body_md, is_public, created_at, updated_at')
    .eq('id', noteId)
    .maybeSingle();
  if (error || !note) return null;
  // RLS 已保证：能读到 = 本人或公开。

  // 出链
  const { data: links } = await supabase
    .from('note_links')
    .select('target_type, target_id, target_label')
    .eq('note_id', noteId);
  const outLinks: NoteOutLink[] = (links ?? []).map((l) => ({
    targetType: l.target_type as NoteOutLink['targetType'],
    targetId: l.target_id,
    label: l.target_label,
  }));

  // 反链：哪些笔记 [[note:本标题]] 指了过来（仅在用户自己的笔记内查，隐私安全）。
  const backlinks: NoteBacklink[] = [];
  if (user) {
    const { data: incoming } = await supabase
      .from('note_links')
      .select('note_id, user_notes!inner(id, title, user_id)')
      .eq('target_type', 'note')
      .eq('target_id', noteId);
    const seen = new Set<string>();
    for (const row of (incoming ?? []) as unknown as { user_notes: { id: string; title: string; user_id: string } }[]) {
      const src = row.user_notes;
      if (!src || src.user_id !== user.id || src.id === noteId) continue;
      if (seen.has(src.id)) continue;
      seen.add(src.id);
      backlinks.push({ noteId: src.id, noteTitle: src.title });
    }
  }

  return {
    id: note.id,
    title: note.title,
    bodyMd: note.body_md ?? '',
    isPublic: note.is_public,
    createdAt: note.created_at,
    updatedAt: note.updated_at,
    outLinks,
    backlinks,
  };
}

export async function getNote(noteId: string): Promise<NoteDetail | null> {
  if (!noteId) return null;
  return buildDetail(noteId);
}

/** 按标题取本人笔记（[[note:标题]] 维基链接直达用，/notes?ref= 落地）。 */
export async function getNoteByTitle(title: string): Promise<NoteDetail | null> {
  const t = title.trim();
  if (!t) return null;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from('user_notes')
    .select('id')
    .eq('user_id', user.id)
    .eq('title', t)
    .maybeSingle();
  if (!data) return null;
  return buildDetail(data.id);
}

// ── 保存出链：抽 [[维基链接]] → 解析 → 全量重建该笔记的 note_links ──
async function rebuildNoteLinks(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  noteId: string,
  body: string,
): Promise<void> {
  const refs = extractWikiRefs(body);
  // 先清空旧链，再写新链（全量重建，简单可靠；笔记出链数量级很小）。
  await supabase.from('note_links').delete().eq('note_id', noteId);
  if (refs.length === 0) return;
  const resolved = await resolveWikiRefs(supabase, userId, refs, noteId);
  if (resolved.length === 0) return;
  const rows = resolved.map((r) => ({
    note_id: noteId,
    target_type: r.target_type,
    target_id: r.target_id,
    target_label: r.target_label,
  }));
  const { error } = await supabase.from('note_links').insert(rows);
  if (error) console.error('[rebuildNoteLinks]', error.message);
}

// ── 新建 ───────────────────────────────────────────────────────────
export async function createNote(input: {
  title: string;
  bodyMd?: string;
  isPublic?: boolean;
}): Promise<NoteResult<{ id: string }>> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: '请先登录' };

  const title = input.title.trim();
  if (!title) return { ok: false, error: '标题不能为空' };
  if (title.length > MAX_TITLE_LEN) return { ok: false, error: '标题过长' };
  const body = (input.bodyMd ?? '').slice(0, MAX_BODY_LEN);

  const { count } = await supabase
    .from('user_notes')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id);
  if ((count ?? 0) >= MAX_NOTES) return { ok: false, error: `笔记数量已达上限（${MAX_NOTES}）` };

  const { data, error } = await supabase
    .from('user_notes')
    .insert({ user_id: user.id, title, body_md: body, is_public: input.isPublic ?? false })
    .select('id')
    .single();
  if (error || !data) {
    if (error?.code === '23505') return { ok: false, error: '已有同名笔记，换个标题' };
    if (error?.message?.includes('user_notes')) return { ok: false, error: '保存失败，请确认迁移 036 已执行' };
    console.error('[createNote]', error?.message);
    return { ok: false, error: '保存失败' };
  }

  await rebuildNoteLinks(supabase, user.id, data.id, body);
  revalidatePath('/notes');
  return { ok: true, id: data.id };
}

// ── 更新 ───────────────────────────────────────────────────────────
export async function updateNote(input: {
  id: string;
  title?: string;
  bodyMd?: string;
  isPublic?: boolean;
}): Promise<NoteResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: '请先登录' };

  const patch: { title?: string; body_md?: string; is_public?: boolean } = {};
  if (input.title !== undefined) {
    const t = input.title.trim();
    if (!t) return { ok: false, error: '标题不能为空' };
    if (t.length > MAX_TITLE_LEN) return { ok: false, error: '标题过长' };
    patch.title = t;
  }
  if (input.bodyMd !== undefined) patch.body_md = input.bodyMd.slice(0, MAX_BODY_LEN);
  if (input.isPublic !== undefined) patch.is_public = input.isPublic;
  if (Object.keys(patch).length === 0) return { ok: true };

  const { error } = await supabase
    .from('user_notes')
    .update(patch)
    .eq('id', input.id)
    .eq('user_id', user.id);
  if (error) {
    if (error.code === '23505') return { ok: false, error: '已有同名笔记，换个标题' };
    console.error('[updateNote]', error.message);
    return { ok: false, error: '保存失败' };
  }

  // 正文变了才重建出链。
  if (patch.body_md !== undefined) {
    await rebuildNoteLinks(supabase, user.id, input.id, patch.body_md);
  }
  revalidatePath('/notes');
  revalidatePath(`/notes/${input.id}`);
  return { ok: true };
}

// ── 未链接提及：正文里以纯文本出现、却没建双链的知识点/定理 ──────────
export async function getUnlinkedMentions(noteId: string): Promise<UnlinkedMention[]> {
  if (!noteId) return [];
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: note } = await supabase
    .from('user_notes')
    .select('body_md, user_id')
    .eq('id', noteId)
    .maybeSingle();
  if (!note || note.user_id !== user.id || !note.body_md?.trim()) return [];

  const [topicsRes, theoremsRes] = await Promise.all([
    supabase.from('topics').select('name'),
    supabase.from('theorems').select('name'),
  ]);
  const topicNames = (topicsRes.data ?? []).map(t => t.name);
  const theoremNames = theoremsRes.error ? [] : (theoremsRes.data ?? []).map(t => t.name);

  const hitTopics = new Set(findUnlinkedNames(note.body_md, topicNames));
  const hitTheorems = new Set(findUnlinkedNames(note.body_md, theoremNames));

  const out: UnlinkedMention[] = [];
  for (const name of hitTopics) out.push({ type: 'topic', name });
  // 定理优先级略低，且与知识点同名时只保留知识点。
  for (const name of hitTheorems) if (!hitTopics.has(name)) out.push({ type: 'theorem', name });
  return out.slice(0, 24);
}

/** 一键把某个未链接提及在正文首个出现处补成 [[双链]]，并保存（重建出链）。 */
export async function linkMention(noteId: string, type: 'topic' | 'theorem', name: string): Promise<NoteResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: '请先登录' };

  const { data: note } = await supabase
    .from('user_notes')
    .select('body_md')
    .eq('id', noteId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (!note) return { ok: false, error: '笔记不存在' };

  const next = wrapFirstMention(note.body_md ?? '', name, type === 'theorem' ? 'thm:' : '');
  if (next === (note.body_md ?? '')) return { ok: false, error: '未找到该提及' };

  const { error } = await supabase
    .from('user_notes')
    .update({ body_md: next })
    .eq('id', noteId)
    .eq('user_id', user.id);
  if (error) { console.error('[linkMention]', error.message); return { ok: false, error: '补链失败' }; }

  await rebuildNoteLinks(supabase, user.id, noteId, next);
  revalidatePath(`/notes/${noteId}`);
  return { ok: true };
}

// ── 删除 ───────────────────────────────────────────────────────────
export async function deleteNote(id: string): Promise<NoteResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: '请先登录' };

  // note_links 经 ON DELETE CASCADE 一并清除。
  const { error } = await supabase
    .from('user_notes')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id);
  if (error) {
    console.error('[deleteNote]', error.message);
    return { ok: false, error: '删除失败' };
  }
  revalidatePath('/notes');
  return { ok: true };
}
