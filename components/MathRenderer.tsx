// Server Component — 无 'use client'，KaTeX 在服务端渲染，首屏无闪烁
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import type { KatexOptions } from 'katex';

interface MathRendererProps {
  content: string;
  /** 附加到外层 div 的 Tailwind 类名 */
  className?: string;
  /** 透传给 rehype-katex 的配置，如 { throwOnError: false } */
  katexOptions?: KatexOptions;
}

const defaultKatexOptions: KatexOptions = {
  throwOnError: false,     // 渲染失败时降级显示原始 LaTeX，不抛异常
  strict: 'ignore',        // 忽略不支持的命令（如 \text 中的部分写法）
  trust: false,
};

export default function MathRenderer({
  content,
  className,
  katexOptions,
}: MathRendererProps) {
  const katexOpts = { ...defaultKatexOptions, ...katexOptions };

  return (
    <div
      className={[
        // prose 提供中英文混排、标题、代码块、表格的排版基础
        'prose prose-zinc dark:prose-invert',
        // 不限制最大宽度，由父容器控制
        'max-w-none',
        // 行高优化：适合包含公式的数学文本
        '[&_.katex-display]:my-4 [&_.katex-display]:overflow-x-auto',
        '[&_p]:leading-8',
        className ?? '',
      ].join(' ')}
    >
      <ReactMarkdown
        remarkPlugins={[remarkMath]}
        rehypePlugins={[[rehypeKatex, katexOpts]]}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
