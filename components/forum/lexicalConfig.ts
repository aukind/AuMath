// 论坛回复 / 发帖编辑器的共享 Lexical 配置。
// 复用题库既有的 MathNode（components/editor），保证发帖与做题用同一套公式基座。

import type { InitialConfigType } from '@lexical/react/LexicalComposer';
import { HeadingNode, QuoteNode } from '@lexical/rich-text';
import { ListItemNode, ListNode } from '@lexical/list';
import {
  HEADING,
  QUOTE,
  UNORDERED_LIST,
  ORDERED_LIST,
  BOLD_ITALIC_STAR,
  BOLD_ITALIC_UNDERSCORE,
  BOLD_STAR,
  BOLD_UNDERSCORE,
  ITALIC_STAR,
  ITALIC_UNDERSCORE,
  STRIKETHROUGH,
  INLINE_CODE,
  type Transformer,
} from '@lexical/markdown';
import { MathNode } from '@/components/editor/MathNode';
import { MATH_TRANSFORMERS } from '@/components/editor/MathTransformers';

const theme = {
  paragraph: 'm-0 leading-relaxed',
  heading: { h1: 'text-lg font-bold', h2: 'text-base font-bold', h3: 'font-semibold' },
  quote: 'border-l-2 border-zinc-300 pl-3 text-zinc-500 dark:border-zinc-600',
  list: { ul: 'list-disc pl-5', ol: 'list-decimal pl-5', listitem: 'my-0.5' },
  text: {
    bold: 'font-semibold',
    italic: 'italic',
    strikethrough: 'line-through',
    code: 'rounded bg-zinc-100 px-1 font-mono text-[0.9em] dark:bg-zinc-800',
  },
};

/**
 * 编辑器需注册的节点。务必与下方 FORUM_TRANSFORMERS 的依赖保持一致 ——
 * MarkdownShortcutPlugin 启动时会校验每个转换器的 dependencies 是否已注册，
 * 缺一个就会在运行时抛 "missing dependency ... for transformer"。
 */
const FORUM_NODES = [MathNode, HeadingNode, QuoteNode, ListNode, ListItemNode];

/**
 * markdown 快捷输入转换器。刻意只保留「渲染器 lexicalToSafeMarkdown 能还原」的子集：
 * 标题 / 引用 / 有序无序列表 / 文本格式 / 数学公式。
 * 不含代码块(CODE)、链接(LINK)、清单(CHECK_LIST) —— 既因渲染器不特殊处理，
 * 也避免引入 @lexical/code、@lexical/link 等额外节点依赖。
 */
export const FORUM_TRANSFORMERS: Transformer[] = [
  ...MATH_TRANSFORMERS,
  HEADING,
  QUOTE,
  UNORDERED_LIST,
  ORDERED_LIST,
  BOLD_ITALIC_STAR,
  BOLD_ITALIC_UNDERSCORE,
  BOLD_STAR,
  BOLD_UNDERSCORE,
  ITALIC_STAR,
  ITALIC_UNDERSCORE,
  STRIKETHROUGH,
  INLINE_CODE,
];

export function buildReplyEditorConfig(namespace: string): InitialConfigType {
  return {
    namespace,
    theme,
    nodes: FORUM_NODES,
    editable: true,
    onError(error: Error) {
      // 编辑器内部错误不应静默吞掉，但也不该炸掉整页 —— 抛给最近的错误边界。
      throw error;
    },
  };
}
