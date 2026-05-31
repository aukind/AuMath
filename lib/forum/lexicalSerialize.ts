// Lexical JSON → 安全 Markdown
//
// 帖子/评论的 content 是序列化后的 Lexical EditorState JSON。展示侧不直接信任它，
// 而是走一条「白名单序列化器」：只识别我们认得的节点类型，产出纯文本 + $公式$ 的
// Markdown，再交给 MathContent（react-markdown + rehype-sanitize + KaTeX）渲染。
//
// 这样做的安全收益：即便 JSON 里被塞进伪造的 `html`/`link` 节点，序列化器也只会
// 忽略它们，不存在「未知节点 → 原样输出 HTML」的注入路径。

import { clampEquation, sanitizeText } from './sanitize';

// Lexical 文本格式位掩码（与 lexical 内部常量一致）
const IS_BOLD = 1;
const IS_ITALIC = 1 << 1;
const IS_CODE = 1 << 4;

interface LexNode {
  type?: string;
  text?: string;
  format?: number | string;
  equation?: string;
  inline?: boolean;
  tag?: string; // heading: h1..h6
  listType?: string; // 'bullet' | 'number'
  src?: string; // image
  altText?: string; // image
  children?: LexNode[];
}

/**
 * 仅放行来自本项目 Supabase 存储的 https 图片，杜绝伪造 JSON 注入任意 / javascript: URL。
 * 公开 URL 形如 `${SUPABASE_URL}/storage/v1/object/public/forum-images/...`。
 */
function isTrustedImageSrc(src: string): boolean {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  return (
    !!src &&
    !!base &&
    src.startsWith('https://') &&
    src.startsWith(`${base}/storage/`)
  );
}

/**
 * 转义会被 Markdown / remark-math 误读的字符。
 * 重点是 `$`：用户正文里的孤立 `$` 不能被当作公式定界符，否则可能拼出超长公式。
 */
function escapeForMarkdown(text: string): string {
  return text
    .replace(/([\\`*_{}[\]()#+\-.!|])/g, '\\$1')
    .replace(/\$/g, '\\$');
}

function renderTextNode(node: LexNode): string {
  const raw = sanitizeText(node.text ?? '');
  if (!raw) return '';
  let out = escapeForMarkdown(raw);
  const fmt = typeof node.format === 'number' ? node.format : 0;
  if (fmt & IS_CODE) out = `\`${raw}\``; // 代码不做 markdown 转义，但仍经过 sanitizeText
  if (fmt & IS_BOLD) out = `**${out}**`;
  if (fmt & IS_ITALIC) out = `*${out}*`;
  return out;
}

function renderMathNode(node: LexNode): string {
  const { safe, truncated } = clampEquation(node.equation ?? '');
  if (!safe) return '';
  const body = truncated ? `${safe}\\;\\text{(公式过长已截断)}` : safe;
  return node.inline ? `$${body}$` : `\n\n$$${body}$$\n\n`;
}

function renderChildren(children: LexNode[] | undefined): string {
  if (!children) return '';
  return children.map(renderNode).join('');
}

function renderNode(node: LexNode): string {
  switch (node.type) {
    case 'text':
      return renderTextNode(node);
    case 'math':
      return renderMathNode(node);
    case 'image': {
      const src = node.src ?? '';
      if (!isTrustedImageSrc(src)) return '';
      const alt = sanitizeText(node.altText ?? '').replace(/[[\]]/g, '');
      return `\n\n![${alt}](${src})\n\n`;
    }
    case 'linebreak':
      return '  \n';
    case 'paragraph':
      return `${renderChildren(node.children)}\n\n`;
    case 'heading': {
      const level = Math.min(6, Math.max(1, Number(node.tag?.slice(1)) || 3));
      return `${'#'.repeat(level)} ${renderChildren(node.children)}\n\n`;
    }
    case 'quote':
      return `> ${renderChildren(node.children)}\n\n`;
    case 'list':
      return `${renderChildren(node.children)}\n`;
    case 'listitem': {
      const marker = node.listType === 'number' ? '1.' : '-';
      return `${marker} ${renderChildren(node.children)}\n`;
    }
    // 未知节点：只下钻其 children（若有），自身不产出任何标记 —— 安全降级。
    default:
      return renderChildren(node.children);
  }
}

/**
 * 把序列化的 Lexical EditorState JSON 转成可交给 MathContent 的安全 Markdown。
 * 解析失败（脏数据 / 非 JSON）时返回空串而非抛错，避免单条坏评论拖垮整页列表。
 */
export function lexicalToSafeMarkdown(rawJson: string): string {
  if (!rawJson) return '';
  try {
    const parsed = JSON.parse(rawJson) as { root?: LexNode };
    const root = parsed.root;
    if (!root) return '';
    return renderChildren(root.children).trim();
  } catch {
    // 兼容历史/降级数据：内容可能本就是纯文本而非 Lexical JSON。
    return sanitizeText(rawJson);
  }
}

/**
 * 构造一段「纯文本 → Lexical EditorState JSON」的最小序列化结果。
 * 乐观更新时，FloatingReplyEditor 已能拿到真正的 editor JSON；此函数仅用于
 * mock 种子数据，方便快速造内容。
 */
export function plainTextToLexicalJson(text: string): string {
  const paragraphs = text.split('\n').map((line) => ({
    type: 'paragraph',
    version: 1,
    children: line ? [{ type: 'text', version: 1, text: line, format: 0 }] : [],
  }));
  return JSON.stringify({
    root: {
      type: 'root',
      version: 1,
      direction: 'ltr',
      format: '',
      indent: 0,
      children: paragraphs,
    },
  });
}
