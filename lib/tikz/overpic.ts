// overpic 坐标 ↔ CSS 映射，及单标签 KaTeX 渲染。
// overpic：左下原点、y 向上、百分比。须与后端 overpic.py 保持一致。

import katex from 'katex';

import type { GeoLabel } from '@/types/tikz';

/** 低于此置信度的标签建议人工复核（O/0、漏检等）。 */
export const LOW_CONFIDENCE = 0.5;

/** 该标签是否为低置信度（人工新增标签 confidence 为空 → 视为可信，不告警）。 */
export function isLowConfidence(label: GeoLabel): boolean {
  return typeof label.confidence === 'number' && label.confidence < LOW_CONFIDENCE;
}

/** overpic 百分比坐标 → CSS 绝对定位（左上原点、y 向下）。 */
export function overpicToCss(label: GeoLabel): { left: string; top: string } {
  return {
    left: `${label.x_percent}%`,
    top: `${100 - label.y_percent}%`,
  };
}

/** 把单个标签文本当作行内数学公式渲染（如 A、B、\alpha）。 */
export function renderLabelHtml(text: string): string {
  return katex.renderToString(text, {
    throwOnError: false,
    strict: 'ignore',
    trust: false,
    errorColor: '#71717a',
  });
}

/** 组装可编译的 overpic 代码（导出用，镜像后端 overpic.build）。 */
export function buildOverpicLatex(labels: GeoLabel[], graphic = 'clean_geometry.pdf'): string {
  const lines = [`\\begin{overpic}[percent]{${graphic}}`];
  for (const lb of labels) {
    lines.push(`  \\put(${lb.x_percent.toFixed(1)},${lb.y_percent.toFixed(1)}){$${lb.text}$}`);
  }
  lines.push('\\end{overpic}');
  return lines.join('\n');
}

function escapeXml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!);
}

/** 读取 SVG 的内部坐标尺寸（优先 viewBox，回退 width/height）。 */
function svgDimensions(svg: string): { w: number; h: number } {
  const vb = svg.match(/viewBox\s*=\s*["']\s*[\d.]+\s+[\d.]+\s+([\d.]+)\s+([\d.]+)/i);
  if (vb) return { w: parseFloat(vb[1]), h: parseFloat(vb[2]) };
  const w = svg.match(/\bwidth\s*=\s*["']\s*([\d.]+)/i);
  const h = svg.match(/\bheight\s*=\s*["']\s*([\d.]+)/i);
  return { w: w ? parseFloat(w[1]) : 100, h: h ? parseFloat(h[1]) : 100 };
}

/**
 * 把标签烘焙进 SVG（原生 <text>），产出自包含 SVG —— 可直接粘进题库内容，
 * 由现有 MathRenderer 的内联 SVG 能力渲染。纯字母/数字标注效果完美；
 * 含 LaTeX 命令的标签会按原文落字（少见，复杂数学标注仍走 overpic 导出）。
 */
export function bakeLabelsIntoSvg(svg: string, labels: GeoLabel[]): string {
  const { w, h } = svgDimensions(svg);
  const fontSize = Math.max(8, h * 0.05);
  const texts = labels
    .map((lb) => {
      const x = (lb.x_percent / 100) * w;
      // overpic 左下原点 → SVG 左上原点；再下移 ~0.35em 近似垂直居中
      // （MathRenderer 的 sanitize 白名单不含 dominant-baseline，故不能依赖它）
      const y = (1 - lb.y_percent / 100) * h + fontSize * 0.35;
      return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-size="${fontSize.toFixed(1)}" font-style="italic" text-anchor="middle" fill="#000">${escapeXml(lb.text)}</text>`;
    })
    .join('');
  return svg.replace(/<\/svg>\s*$/i, `${texts}</svg>`);
}
