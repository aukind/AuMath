'use client';

// 论坛内容渲染器（客户端）
//
// 与 components/MathRenderer.tsx（服务端）职责相同，但论坛场景下评论列表是
// 'use client' 的虚拟滚动树，无法内嵌服务端组件，故镜像一份客户端版本，并叠加：
//   - 入口经 lexicalToSafeMarkdown（白名单序列化 + DOMPurify 去标签）
//   - FORUM_KATEX_OPTIONS 限制宏展开与盒子尺寸，防止恶意公式卡死主线程
//   - useMemo 缓存解析结果，避免虚拟滚动反复回收/挂载时重复 parse

import { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import remarkGfm from 'remark-gfm';
import rehypeKatex from 'rehype-katex';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import 'katex/dist/katex.min.css';
import { lexicalToSafeMarkdown } from '@/lib/forum/lexicalSerialize';
import { FORUM_KATEX_OPTIONS } from '@/lib/forum/sanitize';

// 在默认 schema 基础上放行 <img>，且 src 仅允许 https（图片来自本项目 Supabase 存储，
// 序列化器已二次校验来源）。其余 HTML 仍按默认 schema 清洗。
const SANITIZE_SCHEMA = {
  ...defaultSchema,
  tagNames: [...(defaultSchema.tagNames ?? []), 'img'],
  attributes: {
    ...defaultSchema.attributes,
    img: ['src', 'alt', 'title'],
  },
  protocols: {
    ...defaultSchema.protocols,
    src: ['https'],
  },
};

interface MathContentProps {
  /** 序列化后的 Lexical JSON 字符串 */
  content: string;
  className?: string;
}

export default function MathContent({ content, className }: MathContentProps) {
  const markdown = useMemo(() => lexicalToSafeMarkdown(content), [content]);

  if (!markdown) {
    return <p className="text-sm italic text-zinc-400">（内容为空或无法解析）</p>;
  }

  return (
    <div
      className={[
        'prose prose-zinc dark:prose-invert max-w-none',
        '[&_.katex-display]:my-3 [&_.katex-display]:overflow-x-auto',
        '[&_.katex]:text-[1.0em]',
        '[&_p]:leading-[1.8] [&_p]:my-1.5',
        '[&_.katex_svg]:bg-transparent! [&_.katex_svg]:p-0! [&_.katex_svg]:fill-current!',
        className ?? '',
      ].join(' ')}
    >
      <ReactMarkdown
        remarkPlugins={[remarkMath, remarkGfm]}
        // 注意顺序：先 rehype-sanitize 清洗 HAST，再 rehype-katex 注入 KaTeX 标记。
        // 序列化器已不产出原始 HTML，这里是第三道防线。
        rehypePlugins={[[rehypeSanitize, SANITIZE_SCHEMA], [rehypeKatex, FORUM_KATEX_OPTIONS]]}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
}
