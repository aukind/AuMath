import type { TextMatchTransformer } from '@lexical/markdown';
import { $createImageNode, $isImageNode, ImageNode } from './ImageNode';

/**
 * 图片 Markdown 双向转换：`![alt](url)` ↔ ImageNode。
 * URL 不含空格/括号（Supabase 公开 URL 满足）。导入用于 $convertFromMarkdownString，
 * 导出用于 $convertToMarkdownString round-trip。
 */
export const IMAGE_TRANSFORMER: TextMatchTransformer = {
  dependencies: [ImageNode],

  export: (node) => {
    if (!$isImageNode(node)) return null;
    return `![${node.getAltText()}](${node.getSrc()})`;
  },

  importRegExp: /!\[([^\]]*)\]\(([^()\s]+)\)/,
  regExp: /!\[([^\]]*)\]\(([^()\s]+)\)$/,

  replace: (textNode, match) => {
    const alt = match[1] ?? '';
    const src = match[2];
    if (!src) return;
    textNode.replace($createImageNode(src, alt));
  },

  trigger: ')',
  type: 'text-match',
};
