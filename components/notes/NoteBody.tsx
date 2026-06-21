// 笔记正文渲染（含块嵌入 transclusion + 块级引用 #^块id）。把 ![[标题]] / ![[标题#^id]] 截出，
// 文本段交 MathRenderer（先去掉 ^块id 锚点标记），嵌入段渲染成带左边框的引用卡（限深防环）。
// ★ 必须在 MathRenderer 之前截走 ![[..]]，否则会被 linkifyWikiRefs 误转成 markdown 图片。
import Link from 'next/link';
import { NotebookPen, CornerDownRight } from 'lucide-react';
import MathRenderer from '@/components/MathRenderer';
import { createClient } from '@/lib/supabase/server';
import { splitNoteEmbeds, extractBlock, stripBlockMarkers } from '@/lib/notes/embeds';

const MAX_DEPTH = 2; // 顶层 + 两层嵌入；再深只给链接，不展开（防循环/爆栈）。

export default async function NoteBody({ body, depth = 0 }: { body: string; depth?: number }) {
  const segments = splitNoteEmbeds(body);
  const hasEmbed = segments.some((s) => s.type === 'embed');
  if (!hasEmbed) {
    const clean = stripBlockMarkers(body);
    return clean.trim() ? <MathRenderer content={clean} academicTypography /> : null;
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
          const clean = stripBlockMarkers(s.value);
          return clean.trim() ? <MathRenderer key={i} content={clean} academicTypography /> : null;
        }
        const hit = hits.get(s.title);
        const label = s.blockId ? `${s.title} ›段落` : s.title;
        // 达到最大深度或未找到：给紧凑链接而非展开。
        if (depth >= MAX_DEPTH || !hit) {
          return (
            <Link
              key={i}
              href={`/notes?ref=${encodeURIComponent(s.title)}`}
              className="my-2 flex items-center gap-1.5 rounded-lg border border-dashed border-zinc-300 px-3 py-2 text-sm text-cyan-700 hover:bg-cyan-50 dark:border-zinc-700 dark:text-cyan-300 dark:hover:bg-cyan-500/10"
            >
              <CornerDownRight size={14} className="shrink-0" />
              嵌入：{label}
              {!hit && depth < MAX_DEPTH && <span className="ml-1 text-xs text-amber-500">（未找到）</span>}
            </Link>
          );
        }
        // 块级引用 #^id：只取锚点段落；命中不到则回退整篇。
        const blockBody = s.blockId ? extractBlock(hit.body, s.blockId) : null;
        const embedBody = blockBody ?? hit.body;
        return (
          <div key={i} className="my-3 rounded-r-lg border-l-2 border-cyan-400 bg-cyan-50/40 py-1 pl-4 pr-2 dark:border-cyan-500/50 dark:bg-cyan-500/[0.06]">
            <Link href={`/notes/${hit.id}`} className="mb-1 inline-flex items-center gap-1.5 text-xs font-medium text-cyan-700 hover:underline dark:text-cyan-300">
              <NotebookPen size={12} /> {label}
              {s.blockId && !blockBody && <span className="text-amber-500">（锚点未找到，显示全文）</span>}
            </Link>
            <NoteBody body={embedBody} depth={depth + 1} />
          </div>
        );
      })}
    </>
  );
}
