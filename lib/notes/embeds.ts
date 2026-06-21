// 块嵌入（transclusion）与块级引用解析。把笔记正文按 ![[标题]] / ![[标题#^块id]] 切成
// 「文本段」与「嵌入段」。与 wikiLinks 同一铁律：跳过数学区（$...$ / $$...$$）与行内代码。
// 块级锚点语法（Obsidian）：在段落某行末尾写 `^块id`，即给该段落起锚，可被 #^块id 精确嵌入/引用。

// 数学/代码段（原样保留，不在其中找嵌入）。
const SEG_RE = /(\$\$[\s\S]+?\$\$|\$[^$\n]+?\$|`[^`\n]*`)/g;
// 行内嵌入：![[ 标题(#^块id) ]] 或 ![[ note:标题(#^块id) ]]（可带 |别名，别名忽略）。
const EMBED_RE = /!\[\[([^\[\]|\n]{1,100}?)(?:\|[^\[\]\n]{1,80}?)?\]\]/g;
// 块锚点：某行末尾的 ^块id（前面要有空白，避免误吃 LaTeX 的 ^）。
const BLOCK_MARK_RE = /[ \t]\^([a-zA-Z0-9-]{1,32})[ \t]*$/gm;

export type NoteSegment =
  | { type: 'text'; value: string }
  | { type: 'embed'; title: string; blockId?: string };

/** 去掉 note:/笔记: 前缀并拆出 #^块id，返回 {title, blockId}；非法返回 null。 */
function parseEmbedTarget(target: string): { title: string; blockId?: string } | null {
  let t = target.trim();
  const m = t.match(/^(note|笔记)[:：]\s*(.+)$/);
  if (m) t = m[2].trim();
  let blockId: string | undefined;
  const hash = t.match(/^(.*?)#\^([a-zA-Z0-9-]{1,32})$/);
  if (hash) { t = hash[1].trim(); blockId = hash[2]; }
  if (!t) return null;
  return { title: t, blockId };
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
      const parsed = parseEmbedTarget(m[1]);
      if (!parsed) continue;
      buf += seg.slice(last, m.index);
      flush();
      out.push({ type: 'embed', title: parsed.title, blockId: parsed.blockId });
      last = m.index + m[0].length;
    }
    buf += seg.slice(last);
  }
  flush();
  return out.length ? out : [{ type: 'text', value: input }];
}

/** 抽取带 ^块id 锚点的那一段（按空行分段，匹配段内任意行末锚点）。未命中返回 null。 */
export function extractBlock(body: string, blockId: string): string | null {
  if (!body) return null;
  const paragraphs = body.split(/\n{2,}/);
  for (const para of paragraphs) {
    BLOCK_MARK_RE.lastIndex = 0;
    let found = false;
    for (const line of para.split('\n')) {
      BLOCK_MARK_RE.lastIndex = 0;
      const m = BLOCK_MARK_RE.exec(line);
      if (m && m[1] === blockId) { found = true; break; }
    }
    if (found) return stripBlockMarkers(para).trim();
  }
  return null;
}

/** 去掉正文里所有 ^块id 锚点标记（展示时不显示字面量 ^id）。 */
export function stripBlockMarkers(text: string): string {
  return text.replace(BLOCK_MARK_RE, '');
}
