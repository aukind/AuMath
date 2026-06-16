'use client';

// 轻量客户端 Markdown+KaTeX 渲染器，用于「动态生成、无法服务端预渲染」的文本
// （当前：AI 渐进提示）。区别于 MathContent（吃 Lexical JSON），本组件吃原始 markdown。
// 沿用 MathRenderer 的关键宏（\R \N… 实心黑体）与「先 sanitize 再 katex」的顺序。

import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import remarkGfm from 'remark-gfm';
import rehypeKatex from 'rehype-katex';
import rehypeSanitize from 'rehype-sanitize';
import 'katex/dist/katex.min.css';
import { preprocessMathContent } from '@/lib/utils/mathPreprocess';

const KATEX_OPTS = {
  throwOnError: false,
  strict: 'ignore' as const,
  errorColor: '#71717a',
  macros: {
    '\\R': '\\mathbf{R}', '\\N': '\\mathbf{N}', '\\Z': '\\mathbf{Z}',
    '\\Q': '\\mathbf{Q}', '\\C': '\\mathbf{C}',
    '\\parallel': '\\mathrel{/\\mkern-5mu/}',
  },
};

export default function ClientMath({ content, className }: { content: string; className?: string }) {
  return (
    <div
      className={[
        'prose prose-zinc dark:prose-invert prose-sm max-w-none',
        '[&_.katex-display]:my-2 [&_.katex-display]:overflow-x-auto',
        '[&_p]:leading-[1.75] [&_p]:my-1',
        '[&_.katex_svg]:bg-transparent! [&_.katex_svg]:p-0! [&_.katex_svg]:fill-current!',
        className ?? '',
      ].join(' ')}
    >
      <ReactMarkdown
        remarkPlugins={[remarkMath, remarkGfm]}
        rehypePlugins={[rehypeSanitize, [rehypeKatex, KATEX_OPTS]]}
      >
        {preprocessMathContent(content)}
      </ReactMarkdown>
    </div>
  );
}
