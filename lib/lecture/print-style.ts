// 讲义 PDF 的自包含打印样式（无头 Chromium 渲染时注入到 <style>）。
//
// 无头文档没有 Tailwind，故把两类样式用普通 CSS 写死：
//  ① 原 globals.css `@media print` 里的版心/题块/解答区规则（去掉 @media 外壳、无条件生效）；
//  ② MathRenderer 原本靠 Tailwind 任意变体实现、但 PDF 也必须有的排版（段落行距、表格四边框、
//     几何图 SVG 居中限宽、KaTeX 字号与「不污染公式内 SVG」）。
// 版心边距由 playwright page.pdf({ margin }) 控制，这里不设 @page margin，避免叠加。

export const LECTURE_PRINT_STYLE = `
* { box-sizing: border-box; }

html, body {
  margin: 0;
  padding: 0;
  background: #fff;
  color: #000;
}

.lecture {
  font-family: 'Times New Roman', Georgia, 'Noto Serif SC', 'Songti SC', 'SimSun', serif;
  font-size: 11pt;
  line-height: 1.8;
  color: #000;
}

/* ── 抬头 ── */
.lec-header {
  text-align: center;
  padding-bottom: 8mm;
  margin-bottom: 10mm;
  border-bottom: 2pt solid #000;
}
.lec-header h1 { font-size: 20pt; font-weight: bold; margin: 0 0 2mm; color: #000; }
.lec-header p  { font-size: 9.5pt; color: #555; margin: 0; }

/* ── 题块：避免跨页截断 ── */
.lec-q {
  break-inside: avoid;
  page-break-inside: avoid;
  padding-bottom: 6mm;
  margin-bottom: 8mm;
  border-bottom: 0.5pt solid #ccc;
}
.lec-q:last-child { border-bottom: none; padding-bottom: 0; margin-bottom: 0; }

/* ── 元信息行 ── */
.lec-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 4mm;
  align-items: baseline;
  font-size: 9pt;
  color: #666;
  margin-bottom: 3mm;
}
.lec-num { font-size: 11pt; font-weight: bold; color: #000; }

/* ── 题干 ── */
.lec-stem { font-size: 11pt; line-height: 1.9; }

/* ── 选项网格（对应 QuestionCard 的 1/2 列布局） ── */
.lec-options {
  display: grid;
  gap: 1.5mm 8mm;
  margin-top: 2mm;
}
.lec-options-1 { grid-template-columns: 1fr; }
.lec-options-2 { grid-template-columns: 1fr 1fr; }
.lec-opt { font-size: 11pt; }
.lec-opt p { margin: 0 !important; line-height: 1.85; }

/* ── 含答案模式：答案/解析块 ── */
.lec-answer {
  margin-top: 4mm;
  padding: 3mm 4mm;
  border: 0.5pt solid #bbb;
  border-radius: 1.5mm;
  background: #fafafa;
}
.lec-answer-label {
  font-size: 8.5pt;
  font-weight: bold;
  letter-spacing: 0.05em;
  color: #444;
  margin-bottom: 2mm;
}

/* ── 练习卷模式：空白解答区 ── */
.lec-blank {
  min-height: 42mm;
  margin-top: 5mm;
  border: 1pt dashed #bbb;
  border-radius: 2mm;
  position: relative;
}
.lec-blank::before {
  content: '解答区';
  position: absolute;
  top: 2.5mm;
  right: 3mm;
  font-size: 8pt;
  color: #bbb;
  font-style: italic;
}

/* ── 通用正文排版（替代 MathRenderer 的 prose 任意变体） ── */
.lecture p { margin: 0 0 2mm; line-height: 1.85; }
.lecture .prose { max-width: none; color: #000; }
.lecture h1, .lecture h2, .lecture h3 { color: #000; margin: 2mm 0 1.5mm; }
.lecture a { color: #000; text-decoration: none; }
.lecture pre, .lecture code { background: #f5f5f5; border: 0.5pt solid #ddd; box-shadow: none; }

/* 表格：四边格线、按内容自适应宽度、居中（中文教材风） */
.lecture table { width: auto; max-width: 100%; margin: 3mm 0; border-collapse: collapse; }
.lecture th, .lecture td {
  border: 0.5pt solid #999;
  padding: 1mm 3mm;
  text-align: center;
}

/* 几何图 SVG：居中、限宽 */
.lecture svg { display: block; margin: 3mm auto; max-width: 100%; }
.lecture svg text { fill: #000; }

/* 关键：撤销上面几何图样式对 KaTeX 内部 SVG（根号/求和/积分尾）的污染，否则公式会被毁 */
.lecture .katex svg { margin: 0 !important; max-width: none !important; fill: currentColor !important; display: inline; }
.lecture .katex svg text { fill: currentColor !important; }

/* KaTeX 矢量保真 */
.lecture .katex { font-size: 1.02em; color: #000; }
.lecture .katex-display { margin: 2mm 0; padding: 1mm 0; overflow: visible; }
.lecture .katex-display > .katex { font-size: 1.08em; }
`;
