'use client';

// TeXStudio 式「目录大纲（Structure）」：解析源码的分节命令成层级树，点击跳到对应行。
// 纯前端解析，不碰编译。随源码（外壳里已防抖）刷新。

import { useMemo } from 'react';
import { List } from 'lucide-react';

export type OutlineItem = { level: number; title: string; line: number };

// 标准分节命令 → 层级（数字越小越靠上）。带 \section* 星号与可选 [短标题] 都吃。
const LEVELS: Record<string, number> = {
  part: 0,
  chapter: 1,
  section: 2,
  subsection: 3,
  subsubsection: 4,
  paragraph: 5,
  subparagraph: 6,
};
const SECTION_RE =
  /^\s*\\(part|chapter|section|subsection|subsubsection|paragraph|subparagraph)\*?\s*(?:\[[^\]]*\])?\s*\{/;

/** 从 `{` 处按花括号配平提取标题文本（标题通常单行；多行时取到行尾）。 */
function braceContent(line: string, openIdx: number): string {
  let depth = 0;
  let out = '';
  for (let i = openIdx; i < line.length; i++) {
    const c = line[i];
    if (c === '{') {
      depth++;
      if (depth === 1) continue;
    } else if (c === '}') {
      depth--;
      if (depth === 0) break;
    }
    out += c;
  }
  return out;
}

/** 轻量清洗标题：去掉 \cmd、花括号、行内 $...$ 美元符，保留可读文字。 */
function cleanTitle(raw: string): string {
  return raw
    .replace(/\\[a-zA-Z]+\*?/g, '')
    .replace(/[{}]/g, '')
    .replace(/\$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function parseOutline(src: string): OutlineItem[] {
  const items: OutlineItem[] = [];
  const lines = src.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const m = SECTION_RE.exec(line);
    if (!m) continue;
    const cmd = m[1];
    const openIdx = line.indexOf('{', m.index);
    if (openIdx < 0) continue;
    const title = cleanTitle(braceContent(line, openIdx)) || '（无标题）';
    items.push({ level: LEVELS[cmd] ?? 2, line: i + 1, title });
  }
  return items;
}

export default function LatexOutline({
  source,
  onJump,
}: {
  source: string;
  onJump: (line: number) => void;
}) {
  const items = useMemo(() => parseOutline(source), [source]);
  // 把绝对层级归一到从 0 起的缩进，避免文档没用 part/chapter 时整体缩进过深。
  const minLevel = items.length ? Math.min(...items.map((it) => it.level)) : 0;

  return (
    <div className="flex h-full flex-col bg-zinc-50 dark:bg-zinc-900/50">
      <div className="flex items-center gap-1.5 border-b border-zinc-200 px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-zinc-400 dark:border-zinc-800">
        <List size={12} /> 目录
      </div>
      <div className="min-h-0 flex-1 overflow-auto py-1">
        {items.length === 0 ? (
          <p className="px-3 py-4 text-[11px] leading-relaxed text-zinc-400">
            还没有章节。使用 <code className="text-zinc-500">\section{'{...}'}</code>、
            <code className="text-zinc-500">\subsection{'{...}'}</code> 等命令即可在此生成目录。
          </p>
        ) : (
          items.map((it, idx) => (
            <button
              key={`${it.line}-${idx}`}
              onClick={() => onJump(it.line)}
              title={`第 ${it.line} 行`}
              style={{ paddingLeft: `${12 + (it.level - minLevel) * 14}px` }}
              className="flex w-full items-center gap-1.5 truncate py-1 pr-2 text-left text-[12px] text-zinc-600 transition-colors hover:bg-zinc-200/60 hover:text-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
            >
              <span className="truncate">{it.title}</span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
