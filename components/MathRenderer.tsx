// Server Component — 无 'use client'，KaTeX 在服务端渲染，首屏无闪烁
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import remarkGfm from 'remark-gfm';
import rehypeKatex from 'rehype-katex';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import type { KatexOptions } from 'katex';
import { preprocessMathContent } from '@/lib/utils/mathPreprocess';

interface MathRendererProps {
  content: string;
  /** 附加到外层 div 的 Tailwind 类名 */
  className?: string;
  /** 透传给 rehype-katex 的配置，如 { throwOnError: false } */
  katexOptions?: KatexOptions;
}

const defaultKatexOptions: KatexOptions = {
  throwOnError: false,
  strict:       'ignore',
  trust:        false,
  macros: {
    '\\R':  '\\mathbb{R}',
    '\\N':  '\\mathbb{N}',
    '\\Z':  '\\mathbb{Z}',
    '\\Q':  '\\mathbb{Q}',
    '\\dd': '\\,\\mathrm{d}',
    '\\eu': '\\mathrm{e}',
    '\\iu': '\\mathrm{i}',
  },
};

// rehype-sanitize 模式：在默认基础上放行 SVG 标签和属性，用于内嵌几何图
const svgSchema = {
  ...defaultSchema,
  tagNames: [
    ...(defaultSchema.tagNames ?? []),
    'svg', 'g', 'path', 'circle', 'ellipse', 'line', 'rect',
    'polygon', 'polyline', 'text', 'tspan', 'defs', 'marker',
    'use', 'symbol', 'title', 'desc', 'pattern', 'mask',
    'linearGradient', 'radialGradient', 'stop', 'clipPath',
    'foreignObject', 'image', 'animate', 'animateTransform',
  ],
  attributes: {
    ...defaultSchema.attributes,
    '*': [
      ...((defaultSchema.attributes && defaultSchema.attributes['*']) ?? []),
      'className', 'style',
    ],
    svg: [
      'width', 'height', 'viewBox', 'xmlns', 'fill', 'stroke',
      'strokeWidth', 'stroke-width', 'preserveAspectRatio',
      'className', 'style',
    ],
    path: ['d', 'fill', 'stroke', 'strokeWidth', 'stroke-width',
           'strokeLinecap', 'stroke-linecap', 'strokeLinejoin', 'stroke-linejoin',
           'strokeDasharray', 'stroke-dasharray', 'transform', 'opacity',
           'markerEnd', 'marker-end'],
    circle: ['cx', 'cy', 'r', 'fill', 'stroke', 'strokeWidth', 'stroke-width', 'opacity'],
    ellipse: ['cx', 'cy', 'rx', 'ry', 'fill', 'stroke', 'strokeWidth', 'stroke-width', 'opacity', 'transform'],
    line: ['x1', 'y1', 'x2', 'y2', 'stroke', 'strokeWidth', 'stroke-width',
           'strokeDasharray', 'stroke-dasharray', 'markerEnd', 'marker-end', 'opacity'],
    rect: ['x', 'y', 'width', 'height', 'rx', 'ry', 'fill', 'stroke',
           'strokeWidth', 'stroke-width', 'opacity', 'transform'],
    polygon: ['points', 'fill', 'stroke', 'strokeWidth', 'stroke-width', 'opacity', 'transform'],
    polyline: ['points', 'fill', 'stroke', 'strokeWidth', 'stroke-width', 'opacity', 'transform',
               'strokeDasharray', 'stroke-dasharray'],
    text: ['x', 'y', 'dx', 'dy', 'textAnchor', 'text-anchor', 'fontSize', 'font-size',
           'fontFamily', 'font-family', 'fontWeight', 'font-weight', 'fill', 'transform', 'fontStyle', 'font-style'],
    tspan: ['x', 'y', 'dx', 'dy', 'fontSize', 'font-size', 'fontStyle', 'font-style',
            'fill', 'baselineShift', 'baseline-shift'],
    g: ['fill', 'stroke', 'strokeWidth', 'stroke-width', 'opacity', 'transform'],
    marker: ['id', 'viewBox', 'refX', 'refY', 'markerWidth', 'markerHeight', 'orient'],
    defs: [],
  },
};

export default function MathRenderer({
  content,
  className,
  katexOptions,
}: MathRendererProps) {
  const katexOpts  = { ...defaultKatexOptions, ...katexOptions };
  const normalized = preprocessMathContent(content);

  return (
    <div
      className={[
        // prose 提供中英文混排、标题、代码块、表格的排版基础
        'prose prose-zinc dark:prose-invert',
        // 不限制最大宽度，由父容器控制
        'max-w-none',
        // 公式与正文比例：贴合高考试卷阅读体验
        '[&_.katex-display]:my-4 [&_.katex-display]:overflow-x-auto',
        '[&_.katex]:text-[1.02em]',                  // 行内公式略大
        '[&_.katex-display>.katex]:text-[1.08em]',   // 块级公式更大
        '[&_p]:leading-[1.85]',                      // 段落行距贴近印刷
        '[&_p]:my-2',
        // 表格：默认 prose 只给横线、且 width:100% 把稀疏列拉得很散。
        // 中文教材风格要带四边格线、按内容自适应宽度。
        '[&_table]:w-auto! [&_table]:max-w-full [&_table]:my-3!',
        '[&_th]:border [&_th]:border-zinc-300 dark:[&_th]:border-zinc-600',
        '[&_td]:border [&_td]:border-zinc-300 dark:[&_td]:border-zinc-600',
        '[&_th]:px-3! [&_th]:py-1.5! [&_td]:px-3! [&_td]:py-1.5!',
        '[&_th]:text-center [&_td]:text-center',
        // SVG 几何图：居中、限宽、亮色卡片背景便于阅读
        '[&_svg]:block [&_svg]:mx-auto [&_svg]:my-3 [&_svg]:max-w-full',
        '[&_svg]:bg-white dark:[&_svg]:bg-zinc-50 [&_svg]:rounded-md [&_svg]:p-2',
        '[&_svg_text]:fill-zinc-900',
        // 关键：撤销上面的几何图样式对 KaTeX 内部 SVG（根号、求和、积分尾等）的污染。
        // 否则根号横线会被盖上白色色块，整行公式被毁。
        // Tailwind v4 中 !important 用后缀 `class!`，不是 v3 的前缀 `!class`。
        // 注意：不要强制 `display: inline-block`。KaTeX 0.17+ 的 SVG 是 `position:absolute`，
        // 改 display 会扰乱根号 vlist 的纵向定位（vinculum 落在数字中间，像被划线）。
        '[&_.katex_svg]:bg-transparent! [&_.katex_svg]:p-0! [&_.katex_svg]:m-0!',
        '[&_.katex_svg]:rounded-none! [&_.katex_svg]:max-w-none! [&_.katex_svg]:fill-current!',
        // KaTeX 内的 text 元素跟随当前文字颜色
        '[&_.katex_svg_text]:fill-current!',
        className ?? '',
      ].join(' ')}
    >
      <ReactMarkdown
        remarkPlugins={[remarkMath, remarkGfm]}
        rehypePlugins={[
          rehypeRaw,
          [rehypeSanitize, svgSchema],
          [rehypeKatex, katexOpts],
        ]}
      >
        {normalized}
      </ReactMarkdown>
    </div>
  );
}
