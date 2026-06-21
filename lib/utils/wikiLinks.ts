// Obsidian 式维基双链：正文里的 [[知识点]] / [[知识点|显示文本]] 转成指向知识星图/笔记的链接。
// 必须跳过数学区（$...$ / $$...$$）与行内代码——LaTeX 里 [[ 虽罕见（如嵌套可选参数/矩阵字面量），
// 一旦误改即毁公式，与 mathPreprocess 同一铁律：严禁触碰数学段内部。
//
// 多类型升级：原先 [[名称]] 只能指向知识点。现支持可选「类型前缀」路由到四类实体：
//   [[名称]]            → 知识点（默认，向后兼容）          /explore?focus=名称
//   [[thm:名称]]        → 定理（别名「定理:」）              /explore?focus=名称&type=theorem
//   [[note:标题]]       → 用户笔记（别名「笔记:」）           /notes?ref=标题
//   [[q:题号或摘要]]     → 题目（别名「题:」，仅建边用，渲染暂回退到搜索） /search?q=
// 别名后的实际解析（label→实体 id，喂星图边/反链）在保存时由 lib/notes/resolve.ts 做。

export type WikiTargetType = 'topic' | 'theorem' | 'note' | 'question';

export interface WikiRef {
  /** 解析出的目标类型（按前缀判定，无前缀=topic） */
  type: WikiTargetType;
  /** 去掉前缀后的纯名称/标题（用于 (user_id,title) 或 name 命中） */
  name: string;
  /** 渲染显示文本（[[name|alias]] 的 alias，缺省=name） */
  label: string;
}

const SEGMENT_RE = /(\$\$[\s\S]+?\$\$|\$[^$\n]+?\$|`[^`\n]*`)/g;
const WIKI_RE = /\[\[([^\[\]|\n]{1,64}?)(?:\|([^\[\]\n]{1,64}?))?\]\]/g;

// 前缀别名 → 类型。中英双写，冒号支持半/全角。
const PREFIX_MAP: Record<string, WikiTargetType> = {
  thm: 'theorem', 定理: 'theorem',
  note: 'note', 笔记: 'note',
  q: 'question', 题: 'question',
  topic: 'topic', 知识点: 'topic',
};

/** 把 [[...]] 里捕获的 target 文本拆成 {type,name}。无已知前缀则整体当知识点名。
 *  末尾的 #^块id / #小标题 仅用于定位，解析实体时一律剥掉，按裸名命中。 */
function parseTarget(target: string): { type: WikiTargetType; name: string } {
  const stripHash = (s: string) => s.replace(/#\^?[^\[\]\n]*$/, '').trim() || s.trim();
  const m = target.match(/^([A-Za-z一-龥]{1,6})[:：]\s*(.+)$/);
  if (m && PREFIX_MAP[m[1]]) {
    return { type: PREFIX_MAP[m[1]], name: stripHash(m[2]) };
  }
  return { type: 'topic', name: stripHash(target) };
}

/** 单条 WikiRef 对应的目标 URL。 */
function hrefFor(type: WikiTargetType, name: string): string {
  const enc = encodeURIComponent(name);
  switch (type) {
    case 'note':     return `/notes?ref=${enc}`;
    case 'theorem':  return `/explore?focus=${enc}&type=theorem`;
    case 'question': return `/search?q=${enc}`;
    case 'topic':
    default:         return `/explore?focus=${enc}`;
  }
}

function linkifySegment(text: string): string {
  return text.replace(WIKI_RE, (_m, target: string, alias?: string) => {
    const { type, name } = parseTarget(target);
    if (!name) return _m;
    const label = (alias ?? name).trim() || name;
    return `[${label}](${hrefFor(type, name)})`;
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

/**
 * 抽取正文里全部 [[维基链接]]（跳过数学/代码段），用于保存笔记时重建 note_links。
 * 同一 (type,name) 去重；返回顺序即出现顺序。
 */
export function extractWikiRefs(input: string): WikiRef[] {
  if (!input || !input.includes('[[')) return [];
  const out: WikiRef[] = [];
  const seen = new Set<string>();
  const segments = input.split(SEGMENT_RE);
  for (let i = 0; i < segments.length; i++) {
    if (i % 2 === 1) continue; // 数学/代码段，跳过
    const seg = segments[i];
    WIKI_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = WIKI_RE.exec(seg)) !== null) {
      // 紧邻 ! 前缀即「嵌入」![[..]]：本质是嵌入另一篇笔记，强制记为 note 边
      // （否则裸 [[标题]] 会被当知识点，错连或悬挂）。
      const isEmbed = m.index > 0 && seg[m.index - 1] === '!';
      const parsed = parseTarget(m[1]);
      const type = isEmbed ? 'note' : parsed.type;
      const name = parsed.name;
      if (!name) continue;
      const key = `${type}|${name}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const label = (m[2] ?? name).trim() || name;
      out.push({ type, name, label });
    }
  }
  return out;
}
