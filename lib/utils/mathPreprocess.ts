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

import { withAnswerBlank } from '@/lib/questions/content';

// 需要把上下限放到符号正上/正下的算子（高考排版标准）。
// 刻意不含积分族 \int \iint \iiint \oint —— 定积分 ∫_a^b 的上下限按惯例写在符号「右侧」，
// 强行 \limits 会把它排成像求和那样上下堆叠，反而不符合高考排版。
const NEEDS_LIMITS = ['sum', 'prod', 'lim', 'limsup', 'liminf', 'bigcup', 'bigcap', 'bigoplus', 'bigotimes', 'coprod'];

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
 * 选择题内联选项拆行：把挤在题干里的 "(A)… (B)… (C)… (D)…" 拆成各自独立成行，贴合试卷排版。
 *
 * 触发条件：文本里存在「(A)…(B)」这种递增的括号选项标记对（与 content.ts 的
 * PAREN_OPTION_TAIL_RE 同源）。从首个 (A) 起，把其后每个 (X) 标记前断行，选项块与题干也断开。
 * 选项已被单独抽进 metadata.options 的题目，其题干内联尾巴在 QuestionCard 渲染前已被剥除，
 * 故这里自然不触发，不会与下方选项网格重复。用「成对递增标记」约束避免误伤正文/解析里偶发的
 * 单个 "(A)" 引用或公式括号；半角 (A) 与全角（A）均支持。
 */
function splitChoiceOptions(input: string): string {
  const anchor = /[(（]\s*[Aa]\s*[)）][\s\S]*?[(（]\s*[Bb]\s*[)）]/.exec(input);
  if (!anchor) return input;
  const start = anchor.index;
  const head = input.slice(0, start).replace(/\s+$/, '');
  const tail = input
    .slice(start)
    .replace(
      /\s*[(（]\s*([A-Ha-h])\s*[)）]\s*/g,
      (_m, letter: string) => `\n\n(${letter.toUpperCase()}) `,
    )
    .replace(/^\n+/, '');
  // 高考排版：题干末尾补作答括号「（　　）」（已有则不重复）
  const stem = head ? withAnswerBlank(head) : '';
  return stem ? `${stem}\n\n${tail}` : tail;
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

// 漏包的 LaTeX：命令出现在「普通文本里」（$...$ 之外）时一定渲染不出——remark-math 只渲染
// $...$ 内的内容，于是它们会以字面量（"\underline{\qquad}"、"\rho=\cos\theta"）漏到题面上，
// 补集 ∁ 则退化成方块。常见来源：① 旧规则要求把填空横线写在文本里不包 $；② 模型在选项里漏包 $。
// wrapOrphanLatex 把这些游离 LaTeX 统一补回 $...$。

/** CJK 字符（含中日韩标点、全角符号、中文引号）——游离公式段在文本里的天然边界。
 *  注意：补集符 ∁(U+2201)、省略号等数学符号不在此列，会被纳入公式段。 */
function isCJK(ch: string): boolean {
  return /[‘’“”　-〿㐀-䶿一-鿿豈-﫿︰-﹏＀-￯]/.test(ch);
}

/** 游离公式的触发起点：反斜杠 + ≥2 字母的命令（排除字面量 \n \t \r），或补集符 ∁。
 *  纯中文 / markdown 文本里不存在反斜杠命令，故不会被误触发。 */
function isOrphanTriggerStart(s: string, i: number): boolean {
  if (s[i] === '∁') return true;
  return s[i] === '\\' && /[a-zA-Z]/.test(s[i + 1] ?? '') && /[a-zA-Z]/.test(s[i + 2] ?? '');
}

/** 尾随的句末标点 / 空白（中英文）——包裹时剥到 $...$ 之外，避免句号逗号被渲染进数学模式。 */
const TRAILING_PUNCT = /[.,;:!?．。，、；：！？\s]+$/;

/**
 * 从 s[i]（游离公式触发点）起，按花括号深度感知地吃掉一段「行内数学表达式」：
 * 深度 0 时遇到 CJK / 换行 / `$` 即停止；花括号内允许 CJK（如 \text{中文}）。
 * 返回结束下标与「是否确含数学触发」——只有确含 ≥2 字母命令或 ∁ 才值得包裹。
 */
function scanMathRun(s: string, i: number): { end: number; hasTrigger: boolean } {
  const n = s.length;
  let depth = 0;
  let hasTrigger = false;
  while (i < n) {
    const ch = s[i];
    if (ch === '\\') {
      const m = /^\\([a-zA-Z]+)/.exec(s.slice(i));
      if (m) {
        if (m[1].length >= 2) hasTrigger = true;
        i += m[0].length;
        continue;
      }
      i += 2; // \ 后接非字母（\{ \} \, \\）——连同其后字符一起吃，避免转义括号扰乱深度
      continue;
    }
    if (ch === '∁') { hasTrigger = true; i++; continue; }
    if (ch === '{') { depth++; i++; continue; }
    if (ch === '}') { if (depth === 0) break; depth--; i++; continue; }
    if (ch === '$' || ch === '\n' || ch === '\r') break;
    if (depth === 0 && isCJK(ch)) break;
    i++;
  }
  return { end: i, hasTrigger };
}

/**
 * 把游离在普通文本里（$...$ 之外）的 LaTeX 补上 $...$ 包裹，使其能被 KaTeX 渲染。
 * 覆盖：填空横线 \underline{\qquad}、漏包的公式片段 \rho=\cos\theta、补集 ∁/\complement 等。
 *
 * 字符级扫描：跳过已有数学区（不二次包裹）；仅在遇到「≥2 字母反斜杠命令 / ∁」时才启动一段
 * 括号深度感知、以 CJK/换行 为边界的数学段，且要求该段确含触发才包裹——因此纯中文、
 * markdown（**粗体**、表格、图片链接）、字面量 \n 等都不会被误包。首尾空白与句末标点剥到 $ 外。
 */
function wrapOrphanLatex(input: string): string {
  let out = '';
  let i = 0;
  const n = input.length;
  while (i < n) {
    const ch = input[i];
    // 转义美元符 \$ —— 原样保留，不当作数学区起点
    if (ch === '\\' && input[i + 1] === '$') { out += '\\$'; i += 2; continue; }
    // 进入已有数学区：原样复制到匹配的闭合分隔符
    if (ch === '$') {
      const dd = input[i + 1] === '$';
      const startMath = i;
      i += dd ? 2 : 1;
      while (i < n) {
        if (input[i] === '\\' && i + 1 < n) { i += 2; continue; }
        if (dd ? input[i] === '$' && input[i + 1] === '$' : input[i] === '$') break;
        i++;
      }
      i += dd ? 2 : 1;
      out += input.slice(startMath, Math.min(i, n));
      continue;
    }
    // 文本区：遇到命令/∁ 起点 → 扫描一段数学表达式并包裹（句末标点剥到 $ 外）
    if (isOrphanTriggerStart(input, i)) {
      const { end, hasTrigger } = scanMathRun(input, i);
      if (hasTrigger && end > i) {
        const raw = input.slice(i, end);
        const trail = TRAILING_PUNCT.exec(raw)?.[0] ?? '';
        const core = trail ? raw.slice(0, raw.length - trail.length) : raw;
        if (core) {
          out += `$${core}$${trail}`;
          i = end;
          continue;
        }
      }
    }
    out += ch;
    i++;
  }
  return out;
}

/**
 * 把两点（多字母）向量 \vec{AB} 归一为 \overrightarrow{AB}——高考排版里两点确定的向量
 * 必须用「贯穿两个字母的长箭头」\overrightarrow，\vec 的短帽箭头只压在末字母上、很别扭。
 * 仅当 \vec 的参数是 2 个及以上拉丁字母（如 MP、AB）时改写；单字母向量 \vec{a} 保持不动。
 * \overrightarrow{...} 已是长箭头，不重复处理。
 */
function normalizeVectors(body: string): string {
  return body.replace(/\\vec\s*\{\s*([A-Za-z]{2,})\s*\}/g, '\\overrightarrow{$1}');
}

/**
 * 数集字体规范化：高考/人教版用「实心黑体」\mathbf 表示数集（R N Z Q C 是粗体大写字母），
 * 而非国际数学的「空心黑板粗体」\mathbb（ℝ ℕ ℤ ℚ ℂ）。把模型/OCR 写出的 \mathbb{R/N/Z/Q/C} 统一改 \mathbf。
 * ⚠️ 必须在 normalizeComplement 之后调用——补集 \mathbb{C}_X 已先被还原成 \complement，
 * 此处剩下的 \mathbb{C} 才是「复数集」，可安全改成 \mathbf{C}。
 */
function normalizeNumberSets(body: string): string {
  return body.replace(/\\mathbb\s*\{\s*([RNZQC])\s*\}/g, '\\mathbf{$1}');
}

function transformMathBody(body: string): string {
  let out = repairDegenerateScripts(body);

  // 1. 给需要 \limits 的算子注入：\sum_{...}^{...} → \sum\limits_{...}^{...}
  //    负向先行查避免重复：① 后面已是 \limits/\nolimits 的不再加；
  //    ② **关键**：算子名后必须紧跟非字母——否则 \lim 会匹配到 \limits 的前缀，
  //    把 \sum\limits 毁成 \sum\lim\limitsits（题20 的乱码根因）。
  for (const op of NEEDS_LIMITS) {
    const re = new RegExp(`\\\\${op}(?![a-zA-Z])(?!\\\\?(?:limits|nolimits))`, 'g');
    out = out.replace(re, `\\${op}\\limits`);
  }

  // 1.5 两点向量 \vec{AB} → \overrightarrow{AB}（单字母向量 \boldsymbol/\mathbf 保持黑斜体，不改箭头）
  out = normalizeVectors(out);

  // 2. 行内分数注入 \displaystyle（仅一两个 \frac 时，避免压扁）
  //    粗略策略：如果包含 \frac 且公式总长度 < 100，就前置 \displaystyle。
  if (/\\frac\b/.test(out) && out.length < 100 && !/\\displaystyle/.test(out)) {
    out = `\\displaystyle ${out}`;
  }

  // 3. 补集符号归一化
  out = normalizeComplement(out);

  // 4. 数集字体：\mathbb{R/N/Z/Q/C} → \mathbf（高考实心黑体）。须在补集归一化之后，
  //    避免把补集 \mathbb{C}_X 误当复数集改写。
  out = normalizeNumberSets(out);

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
  text = splitChoiceOptions(text);

  // -1. 把 <!--FIG:描述--> HTML 注释转为可见的 blockquote 提示
  text = text.replace(/<!--FIG:([^>]+?)-->/g, (_m, desc) =>
    `\n\n> 📐 *待生成图：${(desc as string).trim()}*\n\n`,
  );

  // 0. 兼容 LaTeX 原生分隔符
  text = text
    .replace(/\\\(/g, '$').replace(/\\\)/g, '$')
    .replace(/\\\[/g, '$$$$').replace(/\\\]/g, '$$$$');

  // 0.5 把游离在文本里的 LaTeX（填空横线、漏包的公式片段、补集 ∁ 等）补回 $...$，否则漏成字面量。
  //     必须在 $$/$ 处理之前做，且本身会跳过已有数学区，不会二次包裹。
  text = wrapOrphanLatex(text);

  // 1. 处理 display math $$...$$ —— 与行内共用 transformMathBody，避免重复实现（以及重复的
  //    \lim 误吃 bug）。display 模式天然 displaystyle，transformMathBody 多注入的 \displaystyle
  //    前缀在此处冗余但无害。
  text = text.replace(/\$\$([\s\S]+?)\$\$/g, (_m, body) =>
    `$$${transformMathBody(body as string)}$$`,
  );

  // 2. 处理 inline math $...$
  text = text.replace(/(?<!\$)\$([^$\n]+?)\$(?!\$)/g, (_m, body) => {
    return `$${transformMathBody(body as string)}$`;
  });

  return text;
}
