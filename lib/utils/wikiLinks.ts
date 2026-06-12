// Obsidian 式维基双链：正文里的 [[知识点]] / [[知识点|显示文本]] 转成指向知识星图的链接，
// 点击后 /explore?focus=知识点 直接打开该知识点的局部图谱 + 双向链接面板。
// 必须跳过数学区（$...$ / $$...$$）与行内代码——LaTeX 里 [[ 虽罕见（如嵌套可选参数/矩阵字面量），
// 一旦误改即毁公式，与 mathPreprocess 同一铁律：严禁触碰数学段内部。

const SEGMENT_RE = /(\$\$[\s\S]+?\$\$|\$[^$\n]+?\$|`[^`\n]*`)/g;
const WIKI_RE = /\[\[([^\[\]|\n]{1,64}?)(?:\|([^\[\]\n]{1,64}?))?\]\]/g;

function linkifySegment(text: string): string {
  return text.replace(WIKI_RE, (_m, target: string, alias?: string) => {
    const name = target.trim();
    if (!name) return _m;
    const label = (alias ?? name).trim() || name;
    return `[${label}](/explore?focus=${encodeURIComponent(name)})`;
  });
}

/** 把非数学/非代码段里的 [[维基链接]] 转为 markdown 链接；其余原样保留。 */
export function linkifyWikiRefs(input: string): string {
  if (!input || !input.includes('[[')) return input;
  return input
    .split(SEGMENT_RE)
    .map((seg, i) => (i % 2 === 1 ? seg : linkifySegment(seg)))
    .join('');
}
