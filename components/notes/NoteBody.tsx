// 笔记正文渲染（含块嵌入 transclusion）。把 ![[标题]] 截出，文本段交 MathRenderer，
// 嵌入段渲染成带左边框的引用卡（标题可点 + 内联展开被嵌入笔记，递归限深防环）。
// ★ 必须在 MathRenderer 之前截走 ![[..]]，否则会被 linkifyWikiRefs 误转成 markdown 图片。
import Link from 'next/link';
import { NotebookPen, CornerDownRight } from 'lucide-react';
import MathRenderer from '@/components/MathRenderer';
import { createClient } from '@/lib/supabase/server';
import { splitNoteEmbeds } from '@/lib/notes/embeds';

const MAX_DEPTH = 2; // 顶层 + 两层嵌入；再深只给链接，不展开（防循环/爆栈）。

export default async function NoteBody({ body, depth = 0 }: { body: string; depth?: number }) {
  const segments = splitNoteEmbeds(body);
  const hasEmbed = segments.some((s) => s.type === 'embed');
  if (!hasEmbed) {
    return body.trim() ? <MathRenderer content={body} academicTypography /> : null;
  }

  // 批量取被嵌入笔记（按标题，限当前用户）。达最大深度则不再展开，只留链接。
  const titles = [...new Set(segments.flatMap((s) => (s.type === 'embed' ? [s.title] : [])))];
  const hits = new Map<string, { id: string; body: string }>();
  if (depth < MAX_DEPTH && titles.length) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data } = await supabase
        .from('user_notes')
        .select('id, title, body_md')
        .eq('user_id', user.id)
        .in('title', titles);
      for (const n of data ?? []) hits.set(n.title, { id: n.id, body: n.body_md ?? '' });
    }
  }

  return (
    <>
      {segments.map((s, i) => {
        if (s.type === 'text') {
          return s.value.trim() ? <MathRenderer key={i} content={s.value} academicTypography /> : null;
        }
        const hit = hits.get(s.title);
        // 达到最大深度或未找到：给紧凑链接而非展开。
        if (depth >= MAX_DEPTH || !hit) {
          return (
            <Link
              key={i}
              href={`/notes?ref=${encodeURIComponent(s.title)}`}
              className="my-2 flex items-center gap-1.5 rounded-lg border border-dashed border-zinc-300 px-3 py-2 text-sm text-cyan-700 hover:bg-cyan-50 dark:border-zinc-700 dark:text-cyan-300 dark:hover:bg-cyan-500/10"
            >
              <CornerDownRight size={14} className="shrink-0" />
              嵌入：{s.title}
              {!hit && depth < MAX_DEPTH && <span className="ml-1 text-xs text-amber-500">（未找到）</span>}
            </Link>
          );
        }
        // 展开嵌入卡：左边框引用块 + 标题链接 + 递归渲染被嵌入正文。
        return (
          <div key={i} className="my-3 rounded-r-lg border-l-2 border-cyan-400 bg-cyan-50/40 py-1 pl-4 pr-2 dark:border-cyan-500/50 dark:bg-cyan-500/[0.06]">
            <Link href={`/notes/${hit.id}`} className="mb-1 inline-flex items-center gap-1.5 text-xs font-medium text-cyan-700 hover:underline dark:text-cyan-300">
              <NotebookPen size={12} /> {s.title}
            </Link>
            <NoteBody body={hit.body} depth={depth + 1} />
          </div>
        );
      })}
    </>
  );
}
