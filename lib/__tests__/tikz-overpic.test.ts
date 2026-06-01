import { describe, it, expect } from 'vitest';

import { bakeLabelsIntoSvg, buildOverpicLatex, overpicToCss } from '../tikz/overpic';
import type { GeoLabel } from '@/types/tikz';

const LABELS: GeoLabel[] = [
  { text: 'A', x_percent: 20, y_percent: 30 },
  { text: 'B', x_percent: 80, y_percent: 50 },
];

describe('overpicToCss', () => {
  it('翻转 y 轴（overpic 左下原点 → CSS 左上原点）', () => {
    expect(overpicToCss(LABELS[0])).toEqual({ left: '20%', top: '70%' });
  });
});

describe('buildOverpicLatex', () => {
  it('生成 overpic 环境与百分比 \\put', () => {
    const tex = buildOverpicLatex(LABELS);
    expect(tex).toContain('\\begin{overpic}[percent]{clean_geometry.pdf}');
    expect(tex).toContain('\\put(20.0,30.0){$A$}');
    expect(tex).toContain('\\end{overpic}');
  });
});

describe('bakeLabelsIntoSvg', () => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100"><circle/></svg>';

  it('按 viewBox 尺寸把标签换算为 SVG 坐标并注入 <text>', () => {
    const out = bakeLabelsIntoSvg(svg, LABELS);
    // x = 20%*200 = 40；fontSize = max(8, 100*0.05) = 8；y = (1-0.3)*100 + 8*0.35 = 72.8
    expect(out).toContain('x="40.0"');
    expect(out).toContain('y="72.8"');
    expect(out).toContain('text-anchor="middle"');
    expect(out).not.toContain('dominant-baseline'); // sanitize 白名单不含，避免被剥离
    expect(out.match(/<text /g)).toHaveLength(2);
    expect(out.endsWith('</svg>')).toBe(true);
  });

  it('转义 XML 特殊字符', () => {
    const out = bakeLabelsIntoSvg(svg, [{ text: 'A&B', x_percent: 10, y_percent: 10 }]);
    expect(out).toContain('A&amp;B');
  });
});
