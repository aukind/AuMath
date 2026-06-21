// 块嵌入（transclusion）解析：把笔记正文按 ![[标题]] / ![[note:标题]] 切成
// 「文本段」与「嵌入段」。与 wikiLinks 同一铁律：跳过数学区（$...$ / $$...$$）与行内代码，
// 严禁在数学段内部误切。嵌入目标当前仅支持笔记（按标题），其余形态按普通文本保留。

// 数学/代码段（原样保留，不在其中找嵌入）。
const SEG_RE = /(\$\$[\s\S]+?\$\$|\$[^$\n]+?\$|`[^`\n]*`)/g;
// 行内嵌入：![[ 标题 ]] 或 ![[ note:标题 ]]（可带 |别名，别名忽略）。
const EMBED_RE = /!\[\[([^\[\]|\n]{1,80}?)(?:\|[^\[\]\n]{1,80}?)?\]\]/g;

export type NoteSegment =
  | { type: 'text'; value: string }
  | { type: 'embed'; title: string };

/** 去掉 note:/笔记: 前缀，返回纯笔记标题；非笔记目标返回 null（按文本处理）。 */
function embedTitle(target: string): string | null {
  const m = target.match(/^(note|笔记)[:：]\s*(.+)$/);
  if (m) return m[2].trim() || null;
  // 无前缀：默认就当笔记标题（Obsidian ![[X]] 即嵌入同名笔记）。
  const t = target.trim();
  return t || null;
}

/** 把正文切成文本/嵌入段。无嵌入时返回单个文本段。 */
export function splitNoteEmbeds(input: string): NoteSegment[] {
  if (!input || !input.includes('![[')) return [{ type: 'text', value: input }];

  const out: NoteSegment[] = [];
  let buf = '';
  const flush = () => { if (buf) { out.push({ type: 'text', value: buf }); buf = ''; } };

  const segments = input.split(SEG_RE);
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (i % 2 === 1) { buf += seg; continue; } // 数学/代码段：原样并入文本

    let last = 0;
    EMBED_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = EMBED_RE.exec(seg)) !== null) {
      const title = embedTitle(m[1]);
      if (!title) continue; // 解析不出标题 → 当普通文本，留给下一轮并入
      buf += seg.slice(last, m.index);
      flush();
      out.push({ type: 'embed', title });
      last = m.index + m[0].length;
    }
    buf += seg.slice(last);
  }
  flush();
  return out.length ? out : [{ type: 'text', value: input }];
}
