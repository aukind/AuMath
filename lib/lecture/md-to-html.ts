// 讲义 PDF 的服务端 Markdown→HTML 渲染 —— 不用 react-dom/server。
//
// 背景：原先讲义靠 renderToStaticMarkup(<MathRenderer/>) 出 HTML，但 react-dom/server 在 Vercel
// 无头函数里解析不到（react-dom 未被 trace 进 /var/task/node_modules）→「Cannot find package 'react-dom'」。
// 这里改用 unified（remark/rehype/katex）直接出 HTML 字符串：这正是 MathRenderer（Server Component）
// 在 SSR 时已经在服务端跑通的同一套管线，确定可用，且公式渲染与题卡逐字一致。
//
// 插件顺序严格对齐 MathRenderer：remark-math → remark-gfm →（remark-rehype allowDangerousHtml）→
// rehype-raw → rehype-sanitize(svgSchema) → rehype-katex(defaultKatexOptions) → stringify。

import { unified, type Processor } from 'unified';
import remarkParse from 'remark-parse';
import remarkMath from 'remark-math';
import remarkGfm from 'remark-gfm';
import remarkRehype from 'remark-rehype';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';
import rehypeKatex from 'rehype-katex';
import rehypeStringify from 'rehype-stringify';
import { svgSchema, defaultKatexOptions } from '@/components/MathRenderer';
import { preprocessMathContent } from '@/lib/utils/mathPreprocess';

// 单例处理器：所有插件均为同步，可 processSync 重复调用。
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const processor: Processor<any, any, any, any, string> = unified()
  .use(remarkParse)
  .use(remarkMath)
  .use(remarkGfm)
  .use(remarkRehype, { allowDangerousHtml: true })
  .use(rehypeRaw)
  .use(rehypeSanitize, svgSchema)
  .use(rehypeKatex, defaultKatexOptions)
  .use(rehypeStringify) as unknown as Processor<any, any, any, any, string>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** 把题目 Markdown（含 $LaTeX$、内嵌 SVG 几何图）渲染成 HTML 片段。与 MathRenderer 等价。 */
export function mdToHtml(content: string | null | undefined): string {
  if (!content) return '';
  return String(processor.processSync(preprocessMathContent(content)));
}
