'use client';

// overpic 实时预览：SVG 干净底图 + 绝对定位的 KaTeX 标签。
// %坐标 ↔ CSS 映射在 lib/tikz/overpic.ts，无需编译 LaTeX。

import 'katex/dist/katex.min.css';

import { isLowConfidence, overpicToCss, renderLabelHtml } from '@/lib/tikz/overpic';
import type { GeoLabel } from '@/types/tikz';

export default function OverlaySvgPreview({
  svg,
  labels,
}: {
  svg: string;
  labels: GeoLabel[];
}) {
  return (
    <div className="relative inline-block w-full bg-white">
      {/* SVG 干净底图 */}
      <div
        className="[&>svg]:block [&>svg]:h-auto [&>svg]:w-full"
        dangerouslySetInnerHTML={{ __html: svg }}
      />
      {/* 叠加标签 */}
      {labels.map((lb, i) => {
        const { left, top } = overpicToCss(lb);
        const lowConf = isLowConfidence(lb);
        return (
          <span
            key={i}
            title={lowConf ? `低置信度 ${lb.confidence}，建议复核` : undefined}
            className={`pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 leading-none ${
              lowConf ? 'rounded bg-amber-300/40 px-0.5 text-amber-700 ring-1 ring-amber-500' : 'text-black'
            }`}
            style={{ left, top }}
            dangerouslySetInnerHTML={{ __html: renderLabelHtml(lb.text) }}
          />
        );
      })}
    </div>
  );
}
