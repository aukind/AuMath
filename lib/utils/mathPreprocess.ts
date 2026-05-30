/**
 * 数学公式与排版预处理（KaTeX 友好）。
 *
 * 目标：
 * 1. 给 \sum, \prod, \int, \lim, \bigcup, \bigcap 等算子在行内公式中自动加 \limits，
 *    使上下限显示在符号正上方/正下方（高考试卷标准排版）。
 * 2. 行内公式遇到 \frac{}{} 时使用 \displaystyle 防止分子分母过小、字号过紧。
 *    （仅当公式较短且只含一个分数时，避免误伤）
 * 3. 修复模型常见错码：\(...\) → $...$、\[...\] → $$...$$
 *
 * 该预处理是字符串级别的，**只在数学分隔符内部** 应用变换，绝不修改普通文本。
 */

const NEEDS_LIMITS = ['sum', 'prod', 'int', 'lim', 'limsup', 'liminf', 'bigcup', 'bigcap', 'bigoplus', 'bigotimes', 'iint', 'iiint', 'oint', 'coprod'];

/**
 * 把 Gemini 各种"伪补集"统一改回 \complement：
 *   \mathsf{C}_X / \mathbf{C}_X / \mathbb{C}_X / \mathcal{C}_X / \mathrm{C}_X
 *   \text{C}_X / \textsf{C}_X / \textbf{C}_X
 *   {\rm C}_X (老式 LaTeX)
 *   裸 Unicode ∁_X
 *   裸 ∁ 字符（KaTeX 默认不识别为 complement）
 * 仅当紧跟下标时才替换前几种，避免误伤 \mathbb{C} (复数域) 等正常用法。
 */
function normalizeComplement(body: string): string {
  return body
    .replace(/\\(?:mathsf|mathbf|mathbb|mathcal|mathrm)\{C\}(\s*_)/g, '\\complement$1')
    .replace(/\\(?:text|textsf|textbf|textrm)\{C\}(\s*_)/g, '\\complement$1')
    .replace(/\{\s*\\(?:rm|sf|bf)\s+C\s*\}(\s*_)/g, '\\complement$1')
    .replace(/∁/g, '\\complement');
}

/**
 * 把 OCR 残留的 \begin{tabular}{...}...\end{tabular} 转成 GFM markdown 表格。
 * 不追求完美还原 LaTeX 语义；优先目标是不要让红色乱码出现在题面上。
 */
function convertTabular(input: string): string {
  return input.replace(
    /\\begin\{tabular\}\{[^}]*\}([\s\S]*?)\\end\{tabular\}/g,
    (_m, body: string) => {
      // 行分隔符是 \\，单元格分隔符是 &。
      const rows = body
        .replace(/\\hline/g, '')
        .split(/\\\\/)
        .map(r => r.trim())
        .filter(Boolean);
      if (rows.length === 0) return '';
      const cells = rows.map(r => r.split('&').map(c => c.trim()));
      const maxCols = Math.max(...cells.map(r => r.length), 1);
      // pad to uniform column count
      for (const row of cells) while (row.length < maxCols) row.push('');
      const header = cells[0];
      const restRows = cells.slice(1);
      const headerLine = `| ${header.join(' | ')} |`;
      const sepLine = `| ${Array(maxCols).fill('---').join(' | ')} |`;
      const bodyLines = restRows.map(r => `| ${r.join(' | ')} |`);
      return `\n\n${headerLine}\n${sepLine}\n${bodyLines.join('\n')}\n\n`;
    },
  );
}

/**
 * 大题小问拆行：把 "(1)求…; (2)设…" 这种挤一行的写法拆成各自独立段落，
 * 同时给小问号加粗以贴合高考排版习惯（**(1)** 求…）。
 * 用 lookahead 限制只在 (N) 紧跟中文字符时才拆，避免误伤 $f(1)$ 之类的数学表达
 * 或文中 "见 (1) 节" 这种带空格引用。
 */
function splitSubQuestions(input: string): string {
  return input.replace(
    /([^\n])\s*\(([1-9])\)(?=[一-鿿])/g,
    '$1\n\n**($2)** ',
  );
}

/**
 * 修复 OCR/AI 提取产生的「悬空上下标」退化结构，避免一个坏 token 让整段公式飘红。
 *
 * 典型来源：填空题的横线 "____" 被模型误转写成 `=_{ {{{ {_}}}}}` 之类——下标里有个
 * 裸 `_`（KaTeX 报 "Expected group after '_'"）。这类 `_`/`^` 后面缺操作数的情况，
 * 给它补一个空组 `{}`，使其退化为「空上下标」（渲染为空），而不是整条公式解析失败。
 *
 * 仅匹配「`_` 或 `^` 之后（跳过空格）紧跟 `}` / 另一个 `_`^` / 字符串结尾」的退化写法；
 * 健康的 `x_{i}^{2}`、`x_ 2` 一律不动。`(?<!\\)` 避免误伤 `\_`（数学模式下的字面下划线）。
 */
function repairDegenerateScripts(body: string): string {
  return body.replace(/(?<!\\)[_^](?=\s*(?:[}_^]|$))/g, m => `${m}{}`);
}

function transformMathBody(body: string): string {
  let out = repairDegenerateScripts(body);

  // 1. 给需要 \limits 的算子注入：\sum_{...}^{...} → \sum\limits_{...}^{...}
  //    使用负向后查避免重复（已经有 \limits 的不再加）。
  for (const op of NEEDS_LIMITS) {
    const re = new RegExp(`\\\\${op}(?!\\\\?(limits|nolimits))`, 'g');
    out = out.replace(re, `\\${op}\\limits`);
  }

  // 2. 行内分数注入 \displaystyle（仅一两个 \frac 时，避免压扁）
  //    粗略策略：如果包含 \frac 且公式总长度 < 100，就前置 \displaystyle。
  if (/\\frac\b/.test(out) && out.length < 100 && !/\\displaystyle/.test(out)) {
    out = `\\displaystyle ${out}`;
  }

  // 3. 补集符号归一化
  out = normalizeComplement(out);

  return out;
}

/**
 * 提取并处理所有 $...$ / $$...$$ 区块。
 * 同时支持把 \( \) → $ $、\[ \] → $$ $$。
 * 把 <!--FIG:描述--> 占位符转成可视化提示块（待 Stage 2 替换为 SVG）。
 */
export function preprocessMathContent(input: string): string {
  if (!input) return input;

  // -2. 内容级归一化：tabular 环境 → markdown 表格；(1)(2) 挤一行 → 分段
  //     这两步必须在所有数学分隔符处理之前做，否则 \begin{tabular} 里的 & 和 \\ 会被
  //     后续步骤当成数学语义误处理。
  let text = convertTabular(input);
  text = splitSubQuestions(text);

  // -1. 把 <!--FIG:描述--> HTML 注释转为可见的 blockquote 提示
  text = text.replace(/<!--FIG:([^>]+?)-->/g, (_m, desc) =>
    `\n\n> 📐 *待生成图：${(desc as string).trim()}*\n\n`,
  );

  // 0. 兼容 LaTeX 原生分隔符
  text = text
    .replace(/\\\(/g, '$').replace(/\\\)/g, '$')
    .replace(/\\\[/g, '$$$$').replace(/\\\]/g, '$$$$');

  // 1. 处理 display math $$...$$（display 模式天然 displaystyle，但 limits 还需注入）
  text = text.replace(/\$\$([\s\S]+?)\$\$/g, (_m, body) => {
    let b = repairDegenerateScripts(body as string);
    for (const op of NEEDS_LIMITS) {
      const re = new RegExp(`\\\\${op}(?!\\\\?(limits|nolimits))`, 'g');
      b = b.replace(re, `\\${op}\\limits`);
    }
    b = normalizeComplement(b);
    return `$$${b}$$`;
  });

  // 2. 处理 inline math $...$
  text = text.replace(/(?<!\$)\$([^$\n]+?)\$(?!\$)/g, (_m, body) => {
    return `$${transformMathBody(body as string)}$`;
  });

  return text;
}
