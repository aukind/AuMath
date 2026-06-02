'use server';

import { GoogleGenAI } from '@google/genai';
import { revalidatePath, revalidateTag } from 'next/cache';
import { normalizeLaTeX } from '@/lib/normalizeLatex';
import { stripInlineOptionTail } from '@/lib/questions/content';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { isAdminUser } from '@/lib/utils/auth';

// ── 导出类型 ───────────────────────────────────────────────────

export interface ExtractedQuestion {
  id: string;
  /** 原卷题号，用于强制排序和显示 */
  question_number?: number;
  content: string;
  options: string[];
  answer: string;
  /** 详细解析/解答（大题含完整解法，可多解法）；选填可空 */
  analysis: string;
  /** 6大知识点之一 */
  category?: string;
  /** 本题配图张数（Gemini 数图，供图文配额分发；三视图「图①②③④⑤」按张数计）。缺省=未知 */
  figure_count?: number;
}

/** 答案卷里单题的答案与解析（按题号回填到题目上） */
export interface ExtractedAnswerItem {
  question_number: number;
  answer:   string;
  analysis: string;
}

export type ExtractAnswersResult =
  | { success: true;  answers: ExtractedAnswerItem[] }
  | { success: false; error: string };

/** 一套完整试卷：元数据 + 题目列表 */
export interface ExtractedPaperBundle {
  paper_title?: string;
  paper_year?:  number;
  paper_type?:  'real' | 'mock';
  paper_grade?: 'high_school_1' | 'high_school_2' | 'high_school_3' | null;
  questions:    ExtractedQuestion[];
}

export type ProcessPaperResult =
  | { success: true; papers: ExtractedPaperBundle[]; usedModel?: string }
  // 当 JSON 体积可能超过 Vercel 函数响应上限（~4.5MB）时，结果改写入 Storage，前端 fetch 读取
  | { success: true; resultUrl: string; paperCount: number; questionCount: number; usedModel?: string }
  | { success: false; error: string };

export interface PublishBatchMeta {
  // 难度已退役为群众评分（见 question_difficulty_ratings）；录题不再设整卷难度，入库默认 3。
  year:         number | null;
  source:       string;
  paper_type?:  'real' | 'mock';
  paper_grade?: 'high_school_1' | 'high_school_2' | 'high_school_3' | null;
}

export interface PublishItemResult {
  localId: string;
  dbId?:   string;
  error?:  string;
}

export type PublishBatchResult =
  | { success: true;  results: PublishItemResult[]; savedCount: number; paper_id?: string }
  | { success: false; error: string }
  | { success: false; duplicate: DuplicatePaperInfo };  // 检测到同名卷，待前端弹窗选 跳过/替换

// ── 模型配置 ───────────────────────────────────────────────────

const FLASH_MODEL = 'gemini-2.5-flash'; // 兜底（与主模型相同，配置 disableThinking 加速）
const PRO_MODEL   = 'gemini-2.5-flash'; // 主提取：Flash 速度最快、最稳定，单次 5-10 秒

// ── PDF 分块配置 ──────────────────────────────────────────────
const GEMINI_PDF_PAGE_LIMIT = 1000; // Gemini 单次最多 1000 页
const PDF_CHUNK_SIZE        = 30;   // 每块 30 页，单块 Flash 调用 ~10-20s，截断风险小
const CHUNK_CONCURRENCY     = 10;   // 并发数：充分利用 Gemini 多通道
const PARALLEL_TRIGGER_PAGES = 25;  // >25 页就分块。单次 60 页 Flash 调用经常输出截断 → JSON 解析失败

// 单次 Gemini 调用硬超时（ms）。@google/genai 默认不超时，重图（带照片/水印的模拟题）
// 一旦卡住前端就会一直转圈；加上界限后会快速失败成可读错误。主+兜底两次 ≤ 240s，留在 maxDuration 300s 内。
const GEMINI_TIMEOUT_MS = 120_000;

// ── System Prompt ──────────────────────────────────────────────

const PAPER_HEADER = `\
You are an advanced OCR repair, mathematical typesetting, and knowledge-classification engine for Chinese high school exam papers.`;

const MULTI_PAPER_RULE = `\
【最高优先级 — 多卷分离规则】
处理前必须先扫描整个 PDF/图片，识别"试卷边界"。一份文档常含多套独立试卷（例如《1977年高考真题汇编》含上海卷理、江苏卷、北京卷文 等十余套）。下列任一信号都意味着新一套试卷开始：
  • 新的"标题行"出现（例：" 1977 普通高等学校招生考试（上海卷理）"、" 1991年全国卷数学"）
  • 题号从大数突然跳回 1（如上一题是 12 题，下一题又出现 "1." 或 "一、"）
  • 出现"一、选择题"等大节标题，且与上文风格不同
  • 出现明显的分页/分隔横线后题号重新计数
  • 试卷头/试卷尾的"考试时间 120 分钟"、"满分 150 分"等元信息再次出现
每识别到一个新边界，就在 "papers" 数组里追加一个新对象。**绝不能** 把不同试卷的题目堆在同一个 paper 对象里，宁可错分多份也不能合并。`;

const TOP_LEVEL_STRUCTURE = `\
Output ONLY a raw JSON object. No explanations, no reasoning, no Markdown fencing. Top-level structure:
{
  "papers": [
    {
      "title": "极简试卷名称（见规则1）",
      "year": 2024,
      "type": "real",
      "grade": null,
      "questions": [ /* 严格按原卷题号顺序 1→N */ ]
    },
    { /* 第 2 套试卷 */ },
    { /* 第 3 套试卷 ... */ }
  ]
}

NEVER merge questions from different papers into one entry. 哪怕只有 0.1% 的把握是新试卷，也要拆成两个对象。`;

// 与答案无关的转写规则（题面排版/LaTeX/分类/题号），仅题目模式与配对模式共用。
const SHARED_TRANSCRIPTION_RULES = `\
═══ Paper Metadata Rules ═══
1. 【CRITICAL — title 极简规则】去除所有冗长废话，如"普通高等学校招生全国统一考试"、"模拟考试"等。只留最有辨识度的核心信息。
   必须保留年份；保留地区/卷别与科类（理/文）—— 完整卷名是最鲜明的检索特征。格式形如「年份+地区卷+科类」。例：
   "2023年普通高等学校招生全国统一考试新课标I卷数学" → "2023年新高考一卷"
   "1977年普通高等学校招生考试（上海卷理）" → "1977年上海卷理"
   "2024年北京市海淀区高三期末迎考闭卷模拟检测" → "2024年海淀区期末模考"
   【模拟题命名】type="mock" 的模拟/调研/联考卷一律按「年份+地区+考试名称」浓缩，例：
   "湖北省武汉市2025届高三三月调研考试" → "2025年湖北武汉三月调研"；"浙江省L16联盟2024年高三返校适应性测试" → "2024年浙江L16联盟返校适应性测试"。
   【一年两考】北京、上海等地含"春季高考/春季招生/秋季招生"等关键词的，用括号浓缩标注季次，如 "2002年上海卷（春）"、"2002年上海卷（秋）"。
2. type: "real" 表示高考真题或联考; "mock" 表示模拟/校考/期末/月考。
3. grade: type 为 "real" 时填 null；type 为 "mock" 时必须填 "high_school_1"(高一)、"high_school_2"(高二) 或 "high_school_3"(高三)。

═══ Category Rules (CRITICAL) ═══
4. 每道题的 category 字段必须且只能是以下 6 个值之一，绝对不允许自创：
   "数列" | "三角" | "函数与导数" | "解析几何" | "立体几何" | "概率统计"

═══ LaTeX Typesetting Rules (CRITICAL) ═══
5. Text vs math: Chinese/English prose stays OUTSIDE math environments. All variables, equations, sets MUST use LaTeX.
6. Inline math: single $ — e.g. 已知数列 $a_n$ 满足…
7. Display math (standalone line): $$ ... $$
8. Fix OCR tabular garbage: convert \\begin{tabular}…\\end{tabular} → standard GFM Markdown table with header separator |---|---| on its own line. NEVER compress a table to one line.
9. Strip OCR artifacts: stray \\hline, orphan backslashes in plain text.
10. 【CRITICAL — JSON ESCAPING】ALL LaTeX backslashes in JSON strings MUST be doubled:
    \\frac→\\\\frac  \\alpha→\\\\alpha  \\sqrt→\\\\sqrt  \\left→\\\\left  \\cdot→\\\\cdot  etc.
    Newlines in JSON strings use literal \\n (two characters: backslash + n).
11. Preserve original mathematical logic and values exactly — repair formatting only.
11a.【希腊字母 vs 拉丁字母】绝对不能把希腊字母 OCR 成相似的拉丁字母：α≠a, β≠b, γ≠y, ν≠v, π≠n, ρ≠p, χ≠x, ω≠w, μ≠u, σ≠o, τ≠t, ξ≠ξ；遇到希腊字母必须用 LaTeX 命令保留（\\\\alpha \\\\beta \\\\gamma \\\\theta \\\\pi \\\\sigma \\\\phi \\\\omega 等）。
11b.【补集符号】中国教材的补集 ∁_U A 必须用 \\\\complement 命令转写，不要写成 \\\\mathsf{C} / \\\\mathbf{C} / \\\\mathbb{C} / \\\\mathcal{C} / 裸 C —— 这些都不是补集符号。正例 \\\\complement_{I} S，反例 \\\\mathsf{C}_{I} S。补集符号同样必须包在 $...$ 内（如 $\\\\complement_{I} S$），绝不能裸写在普通文本里。
11d.【向量符号】由两点确定的向量必须用「长箭头」\\\\overrightarrow{AB}（贯穿两个字母），绝对不要用 \\\\vec{AB}——\\\\vec 的短帽箭头只压在末字母上，两点向量看着很别扭。仅当是单个向量名（如向量 a）时才用 \\\\vec{a} 或 \\\\boldsymbol{a}。正例 $\\\\overrightarrow{MP}\\\\cdot\\\\overrightarrow{MN}$，反例 $\\\\vec{MP}\\\\cdot\\\\vec{MN}$。
11c.【填空题的空白横线】填空题留空处（原卷的 "____" 横线）只能转写成 LaTeX 横线 \\\\underline{\\\\qquad}，且必须放在普通文本里、不要包进 $...$。绝对禁止把空白 OCR 成裸下标 / 嵌套空括号 / 散落上下标，例如 \`=_{ {{{ {_}}}}}\`、\`{_}\`、\`x_\`、\`a^{}\` 都是非法的——任何 \`_\` 或 \`^\` 后面都必须紧跟一个非空操作数（单字符或 {...}）。填空题的答案**绝不录入**（既不要塞进题面空白，也不要单独输出）——题面只保留到那条横线为止。正例：content 写 "则 $a_1+a_2+\\\\cdots+a_{10}=$ \\\\underline{\\\\qquad}."（不附任何答案）。

═══ Numbering & Structure Rules ═══
12. Detect question boundaries: section headers ("一、选择题"), numbers ("1.", "（1）") etc.
13. question_number: original integer from the paper. Infer from context if omitted. NEVER skip or mis-order.
13a.【完整性 — 一道都不能漏】必须输出卷面上**每一道**带题号的题，题号必须连续不缺号。尤其是篇幅很长、含表格、含大段"新定义/统计学背景"的解答题（例如某道给出"岗位—能力分值"表格、定义 $n$ 维向量距离的统计大题），**绝不能因为它长、含表格、含多个小问 (1)(2)(i)(ii)、或被半透明水印部分遮挡就跳过、截断或与相邻题合并**。这类题若含表格，按规则 8 转成 GFM 表格照常嵌进 content；小问按规则 15 各自换行。哪怕该题要写很长，也必须完整输出。

═══ 【CRITICAL】Content Layout Rules — 严格遵循，否则页面会很难看 ═══
14. content 必须以加粗题号开头："**5.**" 或 "**第5题**"，题号后空一格再写题干主句。
15. 【小问必须换行】每个小问 (1)/(2)/(3)/(I)/(II) 必须独占一行，且与上文之间用 **两个换行符 \\n\\n** 分隔。例：
    正确：
      "**4.** 正六棱锥 $V$-$ABCDEF$ 的高为 $2$ cm，底面边长为 $2$ cm.\\n\\n(1) 按 $1:1$ 画出它的三视图；\\n\\n(2) 求其侧面积；\\n\\n(3) 求它的侧棱和底面的夹角."
    错误：
      "**4.** 正六棱锥的高为... (1) 按1:1画出... (2) 求其侧面积... (3) 求它的侧棱..."

16. 【完全忽略图形】当题目原配几何图形/函数图象/统计图/三视图时，**只字不提**：
    - 不要描述图形
    - 不要插入 \`<!--FIG:...-->\` 占位符
    - 不要尝试用 SVG/PNG/TikZ/ASCII 绘图
    - 如果原题正文写了 "如图" / "如图所示" 这几个字，原样保留
    图形会由用户后续手工补回，这里只转写文字 + 公式 + 选项。
16b.【数图，不画图】在「不描述、不画图」前提下，额外**数清该题正文/选项里属于本题的配图张数**填入 figure_count（默认 0）。要点：三视图题里成组的「图①②③④⑤」按**张数**计（如 5）；函数图象/统计图/几何图各计 1；纯文字题填 0；选项本身是图（如散点图 A/B/C/D 四选项各一张图）按选项图张数计。只数本题自己的图，绝不要把相邻题的图算进来。
16a.【忽略与题目无关的杂物】模拟题卷面常混入：实拍照片（如共享单车、实物图）、机构 Logo、二维码、页眉页脚、以及斜向半透明网站水印（如重复出现的 "UP" / 网址字样）。这些一律**当作不存在**：绝不要把水印文字、照片内容、Logo 文案写进任何 content/options/solution。水印字符若恰好压在题干文字上，按题干本意还原文字，丢弃水印。

17. options: object {"A":"…","B":"…"} for choice questions; null for fill/essay/proof.
17a.【选择题选项不要重复】对于选择题，options 字段已经承载了 (A)/(B)/(C)/(D)，**content 字段绝不能再把 "(A)..(B)..(C)..(D).." 复述一遍**。content 末尾应止于题干主句的句号/问号，紧接着的 (A) 起的选项块只填进 options 对象。错误示范：content="**5.** ...的距离是 (A) 1/2 (B) √3/2 (C) 1 (D) √3"。正确：content="**5.** ...的距离是"，options={"A":"$\\\\dfrac{1}{2}$","B":"$\\\\dfrac{\\\\sqrt{3}}{2}$","C":"$1$","D":"$\\\\sqrt{3}$"}。
17b.【选项内公式同样必须包 $】options 每个选项里的所有数学符号/公式，与题干同等标准——必须用 $...$ 包裹，绝不能把 \\\\rho、\\\\cos\\\\theta、\\\\dfrac{1}{2}、\\\\complement 等裸命令写在选项文本里。错误：{"A":"极坐标方程 \\\\rho=\\\\cos\\\\theta 的图形"}；正确：{"A":"$\\\\rho=\\\\cos\\\\theta$ 与 $\\\\rho\\\\cos\\\\theta=\\\\dfrac{1}{2}$ 的交点"}。
17c.【选项必须是真实且互不相同的备选项，禁止复述题干】options 必须填原卷中 (A)(B)(C)(D) 各自**不同**的备选内容。**绝对禁止**把题干原话、或题干里的同一段公式，当作每个选项的内容逐字复述（例如 A、B 两项内容雷同、且都等于题干那句话——这是 OCR 失败/幻觉的典型表现）。如果实在无法辨认某题的选项，**宁可把 options 设为 null**，也不要编造或复述题干来凑数。`;

// ── 仅题目模式（只录题面，不录答案）─────────────────────────────
const SYSTEM_INSTRUCTION = `${PAPER_HEADER}

${MULTI_PAPER_RULE}

【最高优先级 — 你是转写引擎，不是解题引擎；只录题面，不录答案】
绝对禁止自行解答、推导、计算、证明任何题目。你唯一的职责是把卷面上的**题目题面**（文字、公式、选项）原样转写下来。**绝不能**输出任何答案：既不要自己解题，**也不要照抄卷面上已经印出的答案/参考答案/答案栏**——本任务只录题面，答案一律不录。自行解题或录入答案都是本任务最严重的错误：既拖慢速度又污染题面。

${TOP_LEVEL_STRUCTURE}

Each question element (ALL 4 fields required；不要输出 solution / answer 字段):
{
  "question_number": 5,
  "content": "**5.** 完整题干（按规则 14-16 排版）",
  "options": {"A":"...","B":"...","C":"...","D":"..."} or null,
  "category": "数列",
  "figure_count": 0
}

${SHARED_TRANSCRIPTION_RULES}
18. 【不录任何答案】绝不输出 solution / answer 字段，也绝不把答案写进 content。无论答案是你自己算出来的，还是卷面上已经印好的（答案/参考答案/答案栏），一律**不录入**。本管线只录题面，答案在录题后由人工在编辑页补充。`;

const USER_PROMPT = '请提取图片/PDF中所有题目，按规定 JSON 格式输出。';

// ── 配对模式：单独提取答案卷（只照抄答案与解析，仍不解题）──────────
// 为避免「题面+答案」塞进同一次重调用导致超时/截断/Failed to fetch，
// 配对录入拆成两个并行调用：题面走 processPaper，本 prompt 只处理答案卷。
const SYSTEM_INSTRUCTION_ANSWERS = `${PAPER_HEADER}

【输入说明】本次输入是**一份答案卷 / 参考答案**（印有每道题的答案与解答）。你的唯一职责是把上面**已经印好的答案与解答照抄**成结构化 JSON，按题号组织。

【最高优先级 — 你不是解题引擎】绝对禁止自行解答、推导、计算、证明任何题目。answer/analysis 只能来自答案卷上**已经印出**的文字；答案卷里没有的就留空（""），**绝不编造、绝不自己算**。

Output ONLY a raw JSON object（无解释、无 markdown 围栏）：
{
  "answers": [
    { "question_number": 1,  "answer": "A",  "analysis": "" },
    { "question_number": 15, "answer": "",   "analysis": "解：……（完整解答，含全部解法）" }
  ]
}

═══ 【CRITICAL】答案与解析规则 ═══
A1.【选填题（选择 + 填空）】answer = 答案卷印出的答案：选择题填字母（如 "A"、多选填 "AD"）；填空题填最终结果（如 "$-1$"、"$260$"，多空用「；」或换行分隔）。analysis = 答案卷若给了该题的解析就照抄，没有就填 ""。
A2.【解答题（大题）】answer 填 ""；analysis = 答案卷里该题的**完整解答，原样照抄**（"解："起的全过程、每个小问），LaTeX/换行遵守下面所有排版规则。
A3.【多解法必须全部录入】若某大题给了多种解法 / 多个证法（如「解法1/解法2」「解法一/解法二」「①②⇒③、①③⇒②、②③⇒①」等），必须把**每一种**都完整照抄进同一题的 analysis，用 \\n\\n 分段，并用「解法一：」「解法二：」等小标题分隔，绝不能只录其中一种。
A4.【忽略次要信息】答案卷里的【命题说明】、教材题源、高考题源、课标要求、题源背景、以及评分标准里的分值标注（如行末「…………5分」），一律**不录入**——只录答案本身和解答过程。
A5.【题号】question_number 用答案卷里的题号整数，与试题卷一一对应；不要漏题、不要乱序。

═══ LaTeX 排版与转义规则（answer / analysis 同样遵守）═══
5. 中文/英文叙述在 math 环境外；所有变量、公式、集合必须用 LaTeX。行内用单 $，独立公式用 $$ ... $$。
8. 表格用标准 GFM Markdown 表格（表头分隔行 |---|---| 独占一行），绝不压成一行。
10.【JSON ESCAPING】JSON 字符串里所有 LaTeX 反斜杠必须双写：\\frac→\\\\frac、\\sqrt→\\\\sqrt、\\cdot→\\\\cdot 等；换行用字面量 \\n。
11a.希腊字母必须用 LaTeX 命令（\\\\alpha \\\\beta \\\\theta \\\\pi 等），绝不 OCR 成相似拉丁字母。
11b.补集用 \\\\complement；11d.两点向量用 \\\\overrightarrow{AB}。
16.【完全忽略图形】不要描述图形、不要插占位符、不要画 SVG/ASCII；原文写「如图」就原样保留「如图」。`;

const USER_PROMPT_ANSWERS = '这是答案卷/参考答案。请把每道题已印出的答案与解答（大题含全部解法）照抄成规定 JSON，忽略命题说明/题源/课标/分值，绝不自行解题。';

// ── 质量评估 ───────────────────────────────────────────────────

const POOR_QUALITY_RE = /不确定|unclear|\?\?\?|乱码|识别失败|\[unclear\]|\[.*?\?.*?\]/i;

function assessQuality(questions: ExtractedQuestion[]): { pass: boolean; reason?: string } {
  if (questions.length === 0)
    return { pass: false, reason: '未识别到任何题目' };

  const suspiciousCount = questions.filter(q =>
    q.content.trim().length < 6 || POOR_QUALITY_RE.test(q.content),
  ).length;

  if (suspiciousCount > 0 && suspiciousCount / questions.length >= 0.3)
    return { pass: false, reason: `${suspiciousCount}/${questions.length} 道题内容疑似识别失败` };

  return { pass: true };
}

// ── 内部工具函数 ───────────────────────────────────────────────

type SupportedMime = 'application/pdf' | 'image/jpeg' | 'image/png' | 'image/webp';

async function fetchFileBuffer(url: string): Promise<{
  buffer:   ArrayBuffer;
  mimeType: SupportedMime;
}> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`文件获取失败 (HTTP ${res.status})`);
  const buffer = await res.arrayBuffer();
  const ct     = res.headers.get('content-type') ?? '';
  const mimeType: SupportedMime =
    ct.includes('pdf')  ? 'application/pdf' :
    ct.includes('png')  ? 'image/png'       :
    ct.includes('webp') ? 'image/webp'      :
                          'image/jpeg';
  return { buffer, mimeType };
}

function bufferToImageData(buffer: ArrayBuffer, mimeType: SupportedMime) {
  return { data: Buffer.from(buffer).toString('base64'), mimeType };
}

/** 将 PDF buffer 按 chunkSize 页拆成多段，返回每段的 Uint8Array */
async function splitPdfIntoChunks(
  buffer:    ArrayBuffer,
  chunkSize: number,
): Promise<Uint8Array[]> {
  const { PDFDocument } = await import('pdf-lib');
  const srcDoc    = await PDFDocument.load(buffer, { ignoreEncryption: true });
  const total     = srcDoc.getPageCount();
  const chunks: Uint8Array[] = [];

  for (let start = 0; start < total; start += chunkSize) {
    const end     = Math.min(start + chunkSize, total);
    const indices = Array.from({ length: end - start }, (_, i) => start + i);
    const chunkDoc    = await PDFDocument.create();
    const copiedPages = await chunkDoc.copyPages(srcDoc, indices);
    copiedPages.forEach((p) => chunkDoc.addPage(p));
    chunks.push(await chunkDoc.save());
  }
  return chunks;
}

/**
 * 并发分块处理 PDF。全部用 Flash + 禁用 thinking 极速。
 * 同标题+年份的分块结果会合并为一套（防止跨页试卷被切成两个对象）。
 */
async function processChunksParallel(
  client: GoogleGenAI,
  chunks: Uint8Array[],
): Promise<ExtractedPaperBundle[]> {
  const allBundles: ExtractedPaperBundle[] = [];

  for (let i = 0; i < chunks.length; i += CHUNK_CONCURRENCY) {
    const batch   = chunks.slice(i, i + CHUNK_CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map(async (chunk, chunkIdx) => {
        const imgData = bufferToImageData(chunk.buffer as ArrayBuffer, 'application/pdf');
        // Same primary→thinking-fallback pattern as the single-document path
        // so a truncated/garbled chunk doesn't drop silently.
        try {
          const text = await callModel(client, FLASH_MODEL, [imgData], USER_PROMPT, true);
          return await parseAndNormalize(text);
        } catch (e) {
          console.warn(`[chunk ${i + chunkIdx}] 主调用失败，启用 thinking 重试:`, (e as Error).message);
          const text = await callModel(client, FLASH_MODEL, [imgData], USER_PROMPT, false);
          return await parseAndNormalize(text);
        }
      }),
    );
    for (const r of results) {
      if (r.status === 'fulfilled') allBundles.push(...r.value);
      else console.error('[processChunksParallel] 分块失败（已跳过）:', (r.reason as Error).message);
    }
  }

  return mergeBundlesByTitle(allBundles);
}

/** 合并同名试卷（跨分块时被切开的同一份卷子按 paper_title+year 合并） */
function mergeBundlesByTitle(bundles: ExtractedPaperBundle[]): ExtractedPaperBundle[] {
  const map = new Map<string, ExtractedPaperBundle>();
  for (const b of bundles) {
    const key = `${b.paper_title ?? '__notitle'}__${b.paper_year ?? '__noyear'}`;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, { ...b, questions: [...b.questions] });
    } else {
      const seen = new Set(existing.questions.map(q => q.question_number));
      for (const q of b.questions) {
        if (q.question_number == null || !seen.has(q.question_number)) {
          existing.questions.push(q);
          if (q.question_number != null) seen.add(q.question_number);
        }
      }
    }
  }
  // 题目按题号排序
  return Array.from(map.values()).map(b => ({
    ...b,
    questions: [...b.questions].sort((a, b) => (a.question_number ?? Infinity) - (b.question_number ?? Infinity)),
  }));
}

const VALID_CATEGORIES = new Set([
  '数列', '三角', '函数与导数', '解析几何', '立体几何', '概率统计',
]);

const VALID_GRADES = new Set(['high_school_1', 'high_school_2', 'high_school_3']);

function fixLaTeXEscapes(raw: string): string {
  return raw
    .replace(/(?<!\\)\\([^"\\/bfnrtu\d\s])/g, '\\\\$1')
    .replace(/(?<!\\)\\f(?=[a-zA-Z{])/g, '\\\\f')
    .replace(/(?<!\\)\\b(?=[a-zA-Z{])/g, '\\\\b')
    .replace(/(?<!\\)\\n(?=[a-zA-Z{])/g, '\\\\n')
    .replace(/(?<!\\)\\r(?=[a-zA-Z{])/g, '\\\\r')
    .replace(/(?<!\\)\\t(?=[a-zA-Z{])/g, '\\\\t');
}

function normalizeOptions(opts: unknown): string[] {
  if (!opts) return [];
  if (Array.isArray(opts))
    return (opts as unknown[]).map(o => normalizeLaTeX(String(o)));
  if (typeof opts === 'object')
    return Object.entries(opts as Record<string, unknown>).map(
      ([k, v]) => normalizeLaTeX(`${k}. ${v}`),
    );
  return [];
}

/**
 * keepAnswers=false（默认，仅题目路径）：卷面印了答案也一律不录入。
 * keepAnswers=true（配对路径）：从模型输出读取 answer/analysis（答案卷照抄来的）。
 */
async function normalizeQuestions(
  rawList: Record<string, unknown>[],
  keepAnswers = false,
): Promise<ExtractedQuestion[]> {
  const sorted = [...rawList].sort((a, b) => {
    const na = typeof a.question_number === 'number' ? a.question_number : Infinity;
    const nb = typeof b.question_number === 'number' ? b.question_number : Infinity;
    return na - nb;
  });
  const all = await Promise.all(
    sorted.map(async (q): Promise<ExtractedQuestion> => {
      const rawCategory = String(q.category ?? '');
      const [content, options] = await Promise.all([
        Promise.resolve(normalizeLaTeX(String(q.content ?? ''))),
        Promise.resolve(normalizeOptions(q.options)),
      ]);
      // 仅题目模式：answer/analysis 一律留空（卷面印了也不录）。
      // 配对模式：照抄答案卷里的 answer（选填）与 analysis（大题完整解答/多解法）。
      const answer   = keepAnswers ? normalizeLaTeX(String(q.answer ?? '')) : '';
      const analysis = keepAnswers ? normalizeLaTeX(String(q.analysis ?? q.solution ?? '')) : '';
      const category        = VALID_CATEGORIES.has(rawCategory) ? rawCategory : undefined;
      const question_number = typeof q.question_number === 'number' ? q.question_number : undefined;
      const figure_count    = typeof q.figure_count === 'number' && q.figure_count >= 0 ? Math.round(q.figure_count) : undefined;
      // 治本：即便模型把选项复述进 content，也在入库前确定性剥掉，杜绝与选项卡片重复。
      const cleanContent = stripInlineOptionTail(content, options.length >= 2);
      return { id: crypto.randomUUID(), question_number, content: cleanContent, options, answer, analysis, category, figure_count };
    }),
  );
  // 过滤掉完全空的题（content/options/answer 全空 = 模型输出被截断的残骸）
  return all.filter(q => q.content.trim().length > 0 || q.options.length > 0 || q.answer.trim().length > 0);
}

async function parseSinglePaperObj(
  paper: Record<string, unknown>,
  keepAnswers = false,
): Promise<ExtractedPaperBundle> {
  const paper_title = typeof paper.title === 'string' ? paper.title : undefined;
  const paper_year  = typeof paper.year  === 'number' ? paper.year  : undefined;
  const paper_type  = (paper.type === 'real' || paper.type === 'mock') ? paper.type : undefined;
  const paper_grade = VALID_GRADES.has(String(paper.grade))
    ? (paper.grade as 'high_school_1' | 'high_school_2' | 'high_school_3')
    : paper.grade === null ? null : undefined;
  const rawQuestions = Array.isArray(paper.questions) ? paper.questions as Record<string, unknown>[] : [];
  const questions    = await normalizeQuestions(rawQuestions, keepAnswers);
  return { paper_title, paper_year, paper_type, paper_grade, questions };
}

/**
 * 解析模型返回 JSON，支持三种格式并统一返回 ExtractedPaperBundle[]：
 *   新格式：{ "papers": [...] }
 *   旧格式：{ "paper": {...} }
 *   平铺：  [...]
 */
async function parseAndNormalize(raw: string, keepAnswers = false): Promise<ExtractedPaperBundle[]> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(fixLaTeXEscapes(raw));
  } catch (e) {
    // Preserve a short preview of the raw model output so retries and logs
    // can show *why* the parse failed instead of just "Unexpected token …".
    const preview = raw.slice(0, 300).replace(/\s+/g, ' ');
    console.error('[parseAndNormalize] JSON 解析失败:', (e as Error).message, '原始输出预览:', preview);
    throw new Error(`JSON 解析失败：${(e as Error).message}（模型输出预览：${preview}…）`);
  }

  // 新格式：papers 数组
  if (parsed && typeof parsed === 'object' && Array.isArray((parsed as Record<string, unknown>).papers)) {
    const papers = (parsed as Record<string, unknown>).papers as Record<string, unknown>[];
    if (papers.length === 0) throw new Error('模型返回 papers 为空数组');
    return Promise.all(papers.map(p => parseSinglePaperObj(p, keepAnswers)));
  }

  // 旧格式：单 paper 包装对象
  if (
    parsed && typeof parsed === 'object' &&
    Array.isArray(((parsed as Record<string, unknown>).paper as Record<string, unknown> | undefined)?.questions)
  ) {
    return [await parseSinglePaperObj((parsed as Record<string, unknown>).paper as Record<string, unknown>, keepAnswers)];
  }

  // 平铺数组（最老格式）
  if (Array.isArray(parsed)) {
    const questions = await normalizeQuestions(parsed as Record<string, unknown>[], keepAnswers);
    return [{ questions }];
  }

  throw new Error('模型返回格式无法识别');
}

/**
 * 解析答案卷模型输出 → 按题号的 answer/analysis 映射。
 * 兼容 { answers: [...] } 与裸数组；解析失败返回空 Map（不抛，answer 降级留空）。
 */
function parseAnswers(raw: string): Map<number, { answer: string; analysis: string }> {
  const map = new Map<number, { answer: string; analysis: string }>();
  let parsed: unknown;
  try {
    parsed = JSON.parse(fixLaTeXEscapes(raw));
  } catch (e) {
    console.error('[parseAnswers] JSON 解析失败:', (e as Error).message, '预览:', raw.slice(0, 200).replace(/\s+/g, ' '));
    return map;
  }
  const arr: unknown =
    parsed && typeof parsed === 'object' && Array.isArray((parsed as Record<string, unknown>).answers)
      ? (parsed as Record<string, unknown>).answers
      : Array.isArray(parsed) ? parsed : [];
  for (const item of arr as Record<string, unknown>[]) {
    const n = typeof item.question_number === 'number' ? item.question_number : undefined;
    if (n == null) continue;
    map.set(n, {
      answer:   normalizeLaTeX(String(item.answer ?? '')),
      analysis: normalizeLaTeX(String(item.analysis ?? item.solution ?? '')),
    });
  }
  return map;
}

/**
 * 单次模型调用。Flash 禁用 thinking 极速；Pro 保留 thinking 精准。
 * 必须显式设置高 maxOutputTokens — 默认 8192 不够装下多套试卷 + SVG 几何图，
 * 否则 JSON 会被截断，落到下游变成"空题"。
 *
 * Includes one-shot retry on transient errors (429 rate limit, 5xx, network
 * fetch failures) — Google's SDK does not auto-retry, so a single hiccup
 * silently kills the whole extraction.
 */
async function callModel(
  client:         GoogleGenAI,
  model:          string,
  imageParts:     { data: string; mimeType: string }[],
  promptText:     string,
  disableThinking = false,
  systemInstruction: string = SYSTEM_INSTRUCTION,
): Promise<string> {
  const call = async (): Promise<string> => {
    const result = await client.models.generateContent({
      model,
      contents: [{
        role:  'user',
        parts: [
          ...imageParts.map((p) => ({ inlineData: { mimeType: p.mimeType as 'image/jpeg', data: p.data } })),
          { text: promptText },
        ],
      }],
      config: {
        systemInstruction,
        responseMimeType:  'application/json',
        maxOutputTokens:   65536, // 2.5 Pro 上限，足够 10+ 套试卷 + 大量 SVG
        // Always set thinkingConfig explicitly so the fallback path can't run
        // away with unlimited thinking tokens — that's the single biggest
        // cost spike when extractions retry. 4096 is enough to recover from
        // truncation without burning more than $0.01 in thinking.
        thinkingConfig: disableThinking
          ? { thinkingBudget: 0 }
          : { thinkingBudget: 4096 },
      },
    });
    const text = result.text;
    if (!text) throw new Error(`${model} 未返回内容`);
    return text;
  };

  try {
    return await call();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // Permanent failures — retrying just wastes time and money.
    // RESOURCE_EXHAUSTED / prepayment-depleted / billing errors stay 429 until
    // the user tops up; 401/403 are auth issues; INVALID_ARGUMENT is a bug.
    const isPermanent = /RESOURCE_EXHAUSTED|prepayment|depleted|billing|401|403|INVALID_ARGUMENT|PERMISSION_DENIED/i.test(msg);
    if (isPermanent) throw e;
    // Only retry on genuine transient failures.
    const isTransient = /\b429\b|\b503\b|\b504\b|UNAVAILABLE|fetch failed|ECONNRESET|ETIMEDOUT|socket hang up/i.test(msg);
    if (!isTransient) throw e;
    console.warn(`[callModel:${model}] 瞬时错误，1.5s 后重试一次:`, msg);
    await new Promise((r) => setTimeout(r, 1500));
    return await call();
  }
}

// ── Storage: 签名上传 URL ──────────────────────────────────────

const BUCKET = 'paper-uploads';
const BUCKET_OPTS = {
  public:           false,
  fileSizeLimit:    52428800,
  allowedMimeTypes: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'] as string[],
};

export async function createUploadUrl(
  fileName: string,
): Promise<{ success: true; signedUrl: string; path: string } | { success: false; error: string }> {
  let supabase;
  try { supabase = createAdminClient(); } catch {
    return { success: false, error: '服务端配置缺失：SUPABASE_SERVICE_ROLE_KEY 未设置' };
  }

  const { data: buckets } = await supabase.storage.listBuckets();
  if (!buckets?.some(b => b.id === BUCKET)) {
    const { error: ce } = await supabase.storage.createBucket(BUCKET, BUCKET_OPTS);
    if (ce) return { success: false, error: `Bucket 创建失败：${ce.message}` };
  }

  const ext  = fileName.split('.').pop() ?? 'bin';
  const path = `uploads/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data) return { success: false, error: `生成签名 URL 失败：${error?.message ?? '未知错误'}` };
  return { success: true, signedUrl: data.signedUrl, path: data.path };
}

export async function createReadUrl(
  path: string,
): Promise<{ success: true; signedUrl: string } | { success: false; error: string }> {
  let supabase;
  try { supabase = createAdminClient(); } catch {
    return { success: false, error: '服务端配置缺失：SUPABASE_SERVICE_ROLE_KEY 未设置' };
  }
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600);
  if (error || !data?.signedUrl) return { success: false, error: error?.message ?? '生成读取 URL 失败' };
  return { success: true, signedUrl: data.signedUrl };
}

// ── 主 Server Action：Flash 预检 + Pro 深度精修 ────────────────

// Vercel Serverless 函数响应体上限约 4.5MB，留出余量
const RESPONSE_INLINE_LIMIT = 3 * 1024 * 1024; // 3MB

/**
 * 把提取结果包装好返回。
 * 体积小（<3MB）直接 inline；超大时上传到 Storage 返回 signedUrl，前端 fetch 读取。
 * 这样彻底绕开 Vercel 函数响应上限，无论提取出多少套试卷都能传回前端。
 */
async function packResult(
  papers:    ExtractedPaperBundle[],
  usedModel: string,
): Promise<ProcessPaperResult> {
  const payload   = JSON.stringify({ papers });
  const byteSize  = Buffer.byteLength(payload, 'utf8');

  if (byteSize < RESPONSE_INLINE_LIMIT) {
    return { success: true, papers, usedModel };
  }

  // 大体积：写到 Storage
  let supabase;
  try { supabase = createAdminClient(); } catch {
    return { success: false, error: '结果过大但 Storage 未配置（缺 SUPABASE_SERVICE_ROLE_KEY）' };
  }
  const path = `extractions/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.json`;
  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, payload, { contentType: 'application/json', upsert: false });
  if (upErr) return { success: false, error: `上传结果失败：${upErr.message}` };

  const { data: signed, error: signErr } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, 3600);
  if (signErr || !signed?.signedUrl) return { success: false, error: `生成结果链接失败：${signErr?.message ?? '未知'}` };

  const questionCount = papers.reduce((s, p) => s + p.questions.length, 0);
  return {
    success:       true,
    resultUrl:     signed.signedUrl,
    paperCount:    papers.length,
    questionCount,
    usedModel:     `${usedModel}·storage(${(byteSize / 1024 / 1024).toFixed(1)}MB)`,
  };
}

export async function processPaper(
  signedUrl: string,
  fileType: 'pdf' | 'image',
): Promise<ProcessPaperResult> {
  // Top-level envelope — any uncaught throw inside processPaperInner
  // would surface to the client as Next's opaque "An unexpected response
  // was received from the server" error; trap and serialise instead.
  try {
    return await processPaperInner(signedUrl, fileType);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[processPaper] 未捕获异常:', msg, e instanceof Error ? e.stack : '');
    return { success: false, error: `处理崩溃：${msg}` };
  }
}

async function processPaperInner(
  signedUrl: string,
  _fileType: 'pdf' | 'image',
): Promise<ProcessPaperResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return { success: false, error: '服务端配置缺失：GEMINI_API_KEY 未设置' };

  const client = new GoogleGenAI({ apiKey, httpOptions: { timeout: GEMINI_TIMEOUT_MS } });

  let rawBuffer: ArrayBuffer;
  let mimeType:  SupportedMime;
  try {
    ({ buffer: rawBuffer, mimeType } = await fetchFileBuffer(signedUrl));
  } catch (e) {
    return { success: false, error: `文件获取失败：${(e as Error).message}` };
  }

  // ── PDF 页数检测：>80 页就并行分块（避免 Pro 串行长等待） ─────
  if (mimeType === 'application/pdf') {
    try {
      const { PDFDocument } = await import('pdf-lib');
      const pdfDoc     = await PDFDocument.load(rawBuffer, { ignoreEncryption: true });
      const totalPages = pdfDoc.getPageCount();

      if (totalPages > PARALLEL_TRIGGER_PAGES) {
        const chunkCount = Math.ceil(totalPages / PDF_CHUNK_SIZE);
        const chunks     = await splitPdfIntoChunks(rawBuffer, PDF_CHUNK_SIZE);
        const papers     = await processChunksParallel(client, chunks);
        // 过滤空套子（mergeBundlesByTitle 后可能仍有 questions.length === 0 的残骸）
        const nonEmpty   = papers.filter(p => p.questions.length > 0);
        const totalQ     = nonEmpty.reduce((s, p) => s + p.questions.length, 0);

        if (totalQ === 0)
          return { success: false, error: `PDF 共 ${totalPages} 页已分 ${chunkCount} 批并行处理，但未识别到题目。请确认文件包含数学题目并重试。` };

        return await packResult(nonEmpty, `flash-parallel×${chunkCount}`);
      }
    } catch (e) {
      console.error('[processPaper] PDF 页数检测失败，降级处理:', (e as Error).message);
    }
  }

  const imageData = bufferToImageData(rawBuffer, mimeType);

  // ── 校验：提取结果必须含有效题目，否则视为失败 ─────────────
  const validateNonEmpty = (papers: ExtractedPaperBundle[]): ExtractedPaperBundle[] => {
    const nonEmpty = papers.filter(p => p.questions.length > 0);
    if (nonEmpty.length === 0)
      throw new Error('模型返回的所有试卷题目都为空（可能输出被截断或图片无法识别）');
    return nonEmpty;
  };

  // ── 主提取：Flash + thinking 关闭（5–10s, 大多数情况已足够） ─
  // 失败时的兜底必须真正"不一样"，否则等于重试同样的失败：
  //   primary:  FLASH + thinking off  (speed)
  //   fallback: FLASH + thinking ON   (accuracy, ~30–60s)
  let primaryText: string;
  try {
    primaryText = await callModel(client, FLASH_MODEL, [imageData], USER_PROMPT, true);
  } catch (e) {
    console.warn('[processPaper] 主调用失败，启用 thinking 重试:', (e as Error).message);
    try {
      const fallbackText = await callModel(client, FLASH_MODEL, [imageData], USER_PROMPT, false);
      const papers = validateNonEmpty(await parseAndNormalize(fallbackText));
      return await packResult(papers, 'flash-thinking-fallback');
    } catch (e2) {
      return { success: false, error: `两次调用均失败：${(e2 as Error).message}` };
    }
  }

  try {
    const papers = validateNonEmpty(await parseAndNormalize(primaryText));
    return await packResult(papers, 'flash-fast');
  } catch (e) {
    // Parse/empty failure — almost always due to truncated or hallucinated
    // output. Retry with thinking enabled so the model has budget to produce
    // a complete, well-formed JSON.
    console.warn('[processPaper] 主解析失败/全空，启用 thinking 重试:', (e as Error).message);
    try {
      const fallbackText = await callModel(client, FLASH_MODEL, [imageData], USER_PROMPT, false);
      const papers = validateNonEmpty(await parseAndNormalize(fallbackText));
      return await packResult(papers, 'flash-thinking-fallback');
    } catch (e2) {
      return { success: false, error: `提取失败：${(e2 as Error).message}` };
    }
  }
}

// ── 配对模式 Server Action：只提取答案卷（题面走 processPaper，二者前端并行）──
// 拆成独立调用，避免「题面+答案」一次重调用导致 POST 过久 / Failed to fetch。
// 答案结果是精简数组（必走 inline，不经 Storage），单独 POST 也更短。
export async function extractAnswers(answerUrl: string): Promise<ExtractAnswersResult> {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return { success: false, error: '服务端配置缺失：GEMINI_API_KEY 未设置' };
    // 答案卷可能含整本解答，给更宽的单次超时（仍 < maxDuration 300s），避免串行兜底叠加。
    const client = new GoogleGenAI({ apiKey, httpOptions: { timeout: 240_000 } });

    let buffer: ArrayBuffer, mimeType: SupportedMime;
    try {
      ({ buffer, mimeType } = await fetchFileBuffer(answerUrl));
    } catch (e) {
      return { success: false, error: `答案文件获取失败：${(e as Error).message}` };
    }
    const part = bufferToImageData(buffer, mimeType);

    const toItems = (m: Map<number, { answer: string; analysis: string }>): ExtractedAnswerItem[] =>
      Array.from(m.entries()).map(([question_number, v]) => ({ question_number, ...v }));

    // 主调用 Flash + thinking 关闭；空/解析失败时开一次 thinking 兜底
    try {
      const text = await callModel(client, FLASH_MODEL, [part], USER_PROMPT_ANSWERS, true, SYSTEM_INSTRUCTION_ANSWERS);
      const map  = parseAnswers(text);
      if (map.size > 0) return { success: true, answers: toItems(map) };
      throw new Error('未解析到任何答案');
    } catch (e) {
      console.warn('[extractAnswers] 主提取失败/为空，启用 thinking 重试:', (e as Error).message);
      const text = await callModel(client, FLASH_MODEL, [part], USER_PROMPT_ANSWERS, false, SYSTEM_INSTRUCTION_ANSWERS);
      return { success: true, answers: toItems(parseAnswers(text)) };
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[extractAnswers] 未捕获异常:', msg);
    return { success: false, error: `答案提取失败：${msg}` };
  }
}

// ── 批量发布入库 ───────────────────────────────────────────────

export async function publishQuestions(
  questions: ExtractedQuestion[],
  meta:      PublishBatchMeta,
  strategy?: DuplicateStrategy,   // 未给=遇同名卷返回 duplicate 待前端确认；'replace'=先删旧卷再发
): Promise<PublishBatchResult> {
  let supabase;
  try {
    supabase = createAdminClient();
  } catch {
    return { success: false, error: '服务端配置缺失：SUPABASE_SERVICE_ROLE_KEY 未设置' };
  }

  if (!questions.length) return { success: false, error: '没有可发布的题目' };

  // 单卷查重：插入题目之前按 标题+年份 检测同名卷（否则先插题再发现重复会留下孤儿题）。
  // strategy 未给 → 返回 duplicate 交前端弹窗；'replace' → 删旧卷再发。多卷路径已自行预处理重复，
  // 调用时旧卷已删/已跳过，此处查不到重复故不受影响。
  if (meta.source && (strategy === undefined || strategy === 'replace')) {
    const dup = await detectDuplicatePapers([{ paper_title: meta.source, paper_year: meta.year ?? undefined, questions: [] }]);
    if (dup.success && dup.duplicates.length > 0) {
      if (strategy === undefined) return { success: false, duplicate: dup.duplicates[0] };
      await deletePaperWithQuestions(dup.duplicates[0].existingId); // replace
    }
  }

  // 批量插入：一次 INSERT 多行（取代逐题 N 次往返；dev 下走代理时差异巨大）。
  // PostgREST 对单条多行 insert 的 returning 按插入顺序返回，故 inserted[i] 对应 questions[i]。
  const rows = questions.map((q) => {
    const question_type = q.options.length > 0 ? 'multiple_choice' : 'calculation';
    const metadata: Record<string, unknown> = {};
    if (q.category)                metadata.tags        = q.category;
    if (q.question_number != null) metadata.exam_number = `第${q.question_number}题`;
    if (q.options.length > 0)      metadata.options     = q.options;
    return {
      content:    q.content,
      answer:     q.answer,
      analysis:   q.analysis ?? '',
      question_type,
      difficulty: 3, // 已退役字段，留默认中等；展示用群众评分
      year:       meta.year,
      source:     meta.source || null,
      status:     'published',
      metadata,
    };
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any;
  // 试卷行不依赖题目 id → 与批量插题**并行**，省一次代理往返（dev 下走 ClashX 收益明显）。
  const paperPromise = meta.source
    ? sb.from('papers').insert({
        title: meta.source,
        year:  meta.year,
        type:  meta.paper_type ?? 'real',
        grade: meta.paper_grade ?? null,
      }).select('id').single()
    : Promise.resolve({ data: null, error: null });

  const [qRes, pRes] = await Promise.all([
    supabase.from('questions').insert(rows).select('id'),
    paperPromise,
  ]);

  const { data: inserted, error: insErr } = qRes;
  if (insErr || !inserted) {
    // 题目入库失败 → 清掉可能已并行插入的孤儿试卷行（best-effort）。
    if (pRes?.data?.id) { try { await sb.from('papers').delete().eq('id', pRes.data.id); } catch {} }
    return { success: false, error: `题目入库失败：${insErr?.message ?? '未返回 id'}` };
  }

  const results: PublishItemResult[] = inserted.map((row, i) => ({
    localId: questions[i]?.id ?? `row-${i}`,
    dbId:    (row as { id: string }).id,
  }));
  const savedCount = results.length;

  // ── 关联题目到（已并行创建的）试卷记录 ────────────────────────────
  let paper_id: string | undefined;
  const { data: paperData, error: paperErr } = pRes ?? { data: null, error: null };
  if (meta.source && savedCount > 0 && !paperErr && paperData) {
    try {
      paper_id = paperData.id as string;

      const paperQuestionsRows = results
        .map((r, i) => {
          if (!r.dbId) return null;
          const q = questions[i];
          return {
            paper_id:        paperData.id as string,
            question_id:     r.dbId,
            question_number: q.question_number ?? (i + 1),
          };
        })
        .filter((row): row is NonNullable<typeof row> => row !== null);

      if (paperQuestionsRows.length > 0) {
        const { error: pqErr } = await supabase
          .from('paper_questions')
          .insert(paperQuestionsRows);
        if (pqErr) {
          // 不要 swallow —— 之前的静默 catch 导致大量试卷题数徽章丢失。
          console.error('[publishQuestions] paper_questions insert failed:', {
            paper_id,
            attempted: paperQuestionsRows.length,
            error: pqErr.message,
          });
        }
      }
    } catch (e) {
      console.error('[publishQuestions] paper bind failed:', (e as Error).message);
    }
  } else if (meta.source && paperErr) {
    console.error('[publishQuestions] papers insert failed:', paperErr.message);
  }

  if (savedCount > 0) {
    revalidatePath('/');
    revalidateTag('papers', 'max'); // 新卷/新题 → 刷新缓存的试卷列表（含题数徽章）；'max' 为 Next16 即时失效写法
    revalidateTag('topics', 'max');
  }

  return { success: true, results, savedCount, paper_id };
}

// ── 批量发布多套试卷 ─────────────────────────────────────────────

export interface PublishBundlesResultItem {
  title?:     string;
  savedCount: number;
  paper_id?:  string;
  error?:     string;
  skipped?:   boolean;   // 因重名跳过
}

/** 已存在的重名试卷信息（用于前端弹窗提示） */
export interface DuplicatePaperInfo {
  bundleIndex:   number;
  title:         string;
  year:          number | null;
  existingId:    string;
  existingCount: number;
}

export type PublishBundlesResult =
  | { success: true; publishedPapers: number; totalQuestions: number; results: PublishBundlesResultItem[]; duplicates?: DuplicatePaperInfo[] }
  | { success: false; error: string; duplicates?: DuplicatePaperInfo[] };

/** 重名时的策略：skip 全部跳过 / replace 删除旧的重新创建 / merge 追加到旧试卷 */
export type DuplicateStrategy = 'skip' | 'replace' | 'merge';

/**
 * 预检：检查 bundles 中哪些试卷已存在（按 title+year 匹配）。
 * 不写入数据。
 */
export async function detectDuplicatePapers(
  bundles: ExtractedPaperBundle[],
): Promise<{ success: true; duplicates: DuplicatePaperInfo[] } | { success: false; error: string }> {
  let supabase;
  try { supabase = createAdminClient(); } catch {
    return { success: false, error: '服务端配置缺失：SUPABASE_SERVICE_ROLE_KEY 未设置' };
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any;

  const duplicates: DuplicatePaperInfo[] = [];

  for (let i = 0; i < bundles.length; i++) {
    const b = bundles[i];
    if (!b.paper_title) continue;
    const title = b.paper_title.trim();
    const year  = b.paper_year ?? null;

    let q = sb.from('papers').select('id, title, year').eq('title', title);
    q = year !== null ? q.eq('year', year) : q.is('year', null);
    const { data } = await q.limit(1);
    const existing = (data ?? [])[0];
    if (!existing) continue;

    const { count } = await sb
      .from('paper_questions')
      .select('paper_id', { count: 'exact', head: true })
      .eq('paper_id', existing.id);

    duplicates.push({
      bundleIndex:   i,
      title,
      year,
      existingId:    existing.id as string,
      existingCount: count ?? 0,
    });
  }

  return { success: true, duplicates };
}

/**
 * 删除一套试卷（含其所有题目）。供"替换"策略和管理后台使用。
 * 注意：paper_questions 由 CASCADE 自动清理，需要手动删除关联的 questions。
 */
export async function deletePaperWithQuestions(
  paperId: string,
): Promise<{ success: boolean; error?: string; deletedQuestions?: number }> {
  let supabase;
  try { supabase = createAdminClient(); } catch {
    return { success: false, error: '服务端配置缺失：SUPABASE_SERVICE_ROLE_KEY 未设置' };
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any;

  const { data: pqRows, error: pqErr } = await sb
    .from('paper_questions')
    .select('question_id')
    .eq('paper_id', paperId);
  if (pqErr) return { success: false, error: `查询失败：${pqErr.message}` };

  const questionIds = (pqRows ?? []).map((r: { question_id: string }) => r.question_id);

  if (questionIds.length > 0) {
    await sb.from('question_topic_relations').delete().in('question_id', questionIds);
    await sb.from('questions').delete().in('id', questionIds);
  }
  const { error: paperErr } = await sb.from('papers').delete().eq('id', paperId);
  if (paperErr) return { success: false, error: `删除试卷失败：${paperErr.message}` };

  revalidatePath('/');
  revalidateTag('papers', 'max'); // 删卷 → 刷新缓存的试卷列表（'max' 为 Next16 即时失效写法）
  return { success: true, deletedQuestions: questionIds.length };
}

export interface UpdatePaperInput {
  title: string;
  year:  number | null;
  type:  'real' | 'mock';
  grade: 'high_school_1' | 'high_school_2' | 'high_school_3' | null;
}

/**
 * 编辑试卷信息（仅管理员）：标题 / 年份 / 类型 / 学段。
 * 标题与年份同时同步到该卷所有题目的 source/year（卡片展示用的是 question.source，需保持一致）。
 */
export async function updatePaper(
  paperId: string,
  input:   UpdatePaperInput,
): Promise<{ success: boolean; error?: string }> {
  const ssr = await createClient();
  const { data: { user } } = await ssr.auth.getUser();
  if (!isAdminUser(user)) return { success: false, error: '无权限' };

  const title = input.title.trim();
  if (!title) return { success: false, error: '试卷标题不能为空' };

  let admin;
  try { admin = createAdminClient(); } catch {
    return { success: false, error: '服务端配置缺失：SUPABASE_SERVICE_ROLE_KEY 未设置' };
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = admin as any;

  const { error: paperErr } = await sb.from('papers').update({
    title,
    year:  input.year,
    type:  input.type,
    grade: input.type === 'mock' ? input.grade : null,
  }).eq('id', paperId);
  if (paperErr) return { success: false, error: `更新失败：${paperErr.message}` };

  // 同步题目的 source / year（卡片来源徽章读的是 question.source）
  const { data: pqRows } = await sb
    .from('paper_questions').select('question_id').eq('paper_id', paperId);
  const questionIds = (pqRows ?? []).map((r: { question_id: string }) => r.question_id);
  if (questionIds.length > 0) {
    await sb.from('questions').update({ source: title, year: input.year }).in('id', questionIds);
  }

  revalidatePath('/');
  revalidatePath('/admin/papers');
  revalidatePath(`/admin/papers/${paperId}`);
  revalidateTag('papers', 'max');
  return { success: true };
}

export async function publishPaperBundles(
  bundles:    ExtractedPaperBundle[],
  strategy:   DuplicateStrategy = 'skip',
): Promise<PublishBundlesResult> {
  if (!bundles.length) return { success: false, error: '没有可发布的试卷' };

  // 预检重名
  const dupResult = await detectDuplicatePapers(bundles);
  const duplicates = dupResult.success ? dupResult.duplicates : [];
  const dupIndexSet = new Set(duplicates.map(d => d.bundleIndex));

  // 如果是 replace，先删除老试卷
  if (strategy === 'replace') {
    for (const d of duplicates) {
      await deletePaperWithQuestions(d.existingId);
    }
  }

  const results: PublishBundlesResultItem[] = [];

  for (let i = 0; i < bundles.length; i++) {
    const bundle = bundles[i];
    const isDup  = dupIndexSet.has(i);

    if (isDup && strategy === 'skip') {
      results.push({ title: bundle.paper_title, savedCount: 0, skipped: true });
      continue;
    }

    const meta: PublishBatchMeta = {
      year:        bundle.paper_year ?? null,
      source:      bundle.paper_title ?? '',
      paper_type:  bundle.paper_type,
      paper_grade: bundle.paper_grade ?? undefined,
    };
    const r = await publishQuestions(bundle.questions, meta);
    if (r.success) {
      results.push({ title: bundle.paper_title, savedCount: r.savedCount, paper_id: r.paper_id });
    } else {
      // 多卷路径已在循环前删/跳过重复，运行时不会命中 duplicate 分支；仅为类型完整兜底。
      results.push({ title: bundle.paper_title, savedCount: 0, error: 'error' in r ? r.error : `已存在同名卷《${r.duplicate.title}》` });
    }
  }

  return {
    success:         true,
    publishedPapers: results.filter(r => !r.error && !r.skipped).length,
    totalQuestions:  results.reduce((s, r) => s + r.savedCount, 0),
    results,
    duplicates,
  };
}

// ── Stage 2：单题按需生成 SVG 几何图 ─────────────────────────────
//
// 主提取（Flash）只在题干插入 <!--FIG:描述--> 占位符。
// 当用户在校对时点击「生成几何图」按钮时，此 Action 拿题干 + 占位描述，
// 调用 Gemini 2.5 Pro 输出 SVG，并替换占位符为 SVG。

const SVG_GEN_PROMPT = `\
你是一位精通几何作图的助手。读题目和图形描述，输出**纯 SVG 代码**（无任何解释文本、无 markdown 代码围栏）。

规格：
- 根标签 \`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 240">\`（或更合适的 viewBox）
- 线条 \`stroke="#222"\` \`stroke-width="1.5"\` \`fill="none"\`（除非显式填充）
- 顶点字母用 \`<text font-size="14" font-family="serif" font-style="italic">\`（注意 SVG 用 kebab-case 属性名）
- 立体几何用斜二测画法（30°/45°），被遮挡棱用 \`stroke-dasharray="4 3"\`
- 圆/椭圆/三角形用对应原生 SVG 元素
- 不要 \`<script>\`、\`onclick\`、外链 image

**输出格式硬约束**：你的回答必须以 \`<svg\` 三个字符开头，以 \`</svg>\` 结尾。中间不能有任何说明、注释、围栏。`;

// Pro 2.5 默认带"思考"流程；明确给它一个合理的思考预算，避免它把全部
// output token 都花在思考上、剩下不够装完整 SVG（产生空文本或被截断）。
const SVG_THINKING_BUDGET = 1024;
const SVG_MAX_OUTPUT_TOKENS = 16384;

/** 从模型回复里抽出 SVG。容忍 ```svg ... ``` 围栏、前导/尾随文字。 */
function extractSvg(raw: string): string | null {
  let text = raw.trim();
  // 去掉常见的 markdown 代码围栏（```svg ... ```、```xml ... ```、``` ... ```）
  text = text.replace(/^```(?:svg|xml|html)?\s*\n?/i, '').replace(/\n?```\s*$/i, '');
  const m = text.match(/<svg[\s\S]+?<\/svg>/i);
  return m ? m[0] : null;
}

export async function generateSvgForQuestion(
  questionContent: string,
  figureHint?:     string,
): Promise<{ success: true; svg: string } | { success: false; error: string }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return { success: false, error: '服务端配置缺失：GEMINI_API_KEY 未设置' };

  const client = new GoogleGenAI({ apiKey, httpOptions: { timeout: GEMINI_TIMEOUT_MS } });

  const prompt = `${SVG_GEN_PROMPT}

【题目】
${questionContent.slice(0, 800)}

${figureHint ? `【图形描述】\n${figureHint}` : ''}`;

  let raw = '';
  let finishReason: string | undefined;
  try {
    const result = await client.models.generateContent({
      model: 'gemini-2.5-pro',
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: {
        maxOutputTokens: SVG_MAX_OUTPUT_TOKENS,
        thinkingConfig: { thinkingBudget: SVG_THINKING_BUDGET },
      },
    });
    raw = result.text ?? '';
    finishReason = result.candidates?.[0]?.finishReason;
  } catch (e) {
    console.error('[generateSvgForQuestion] Gemini 调用异常:', e);
    return { success: false, error: `SVG 生成失败：${(e as Error).message}` };
  }

  const svg = extractSvg(raw);
  if (svg) return { success: true, svg };

  // 把诊断信息透传出去，方便前端 toast 直接告诉用户"为什么"，而不是"网络"
  const snippet = raw.trim().slice(0, 200).replace(/\s+/g, ' ');
  const reason =
    !raw.trim()        ? '模型返回空文本' :
    finishReason === 'MAX_TOKENS' ? '输出被 MAX_TOKENS 截断' :
    finishReason === 'SAFETY'     ? '触发了安全策略' :
    finishReason && finishReason !== 'STOP' ? `finishReason=${finishReason}` :
    '回复中无 <svg>...</svg>';
  console.error('[generateSvgForQuestion]', { reason, finishReason, snippet, hint: figureHint });
  return { success: false, error: `${reason}${snippet ? `（片段: ${snippet}）` : ''}` };
}

/**
 * 把题目 content 里所有 <!--FIG:...--> 占位符并行替换为 SVG。
 * 用于校对页"一键全部生成图"。
 */
export async function generateAllSvgInContent(
  content: string,
): Promise<
  | { success: true; content: string; replaced: number; failedReasons: string[] }
  | { success: false; error: string }
> {
  const matches = Array.from(content.matchAll(/<!--FIG:([^>]+?)-->/g));
  if (matches.length === 0) return { success: true, content, replaced: 0, failedReasons: [] };

  const results = await Promise.allSettled(
    matches.map(m => generateSvgForQuestion(content, m[1])),
  );

  let newContent = content;
  let replaced = 0;
  const failedReasons: string[] = [];
  for (let i = 0; i < matches.length; i++) {
    const r = results[i];
    if (r.status === 'rejected') {
      failedReasons.push(r.reason instanceof Error ? r.reason.message : String(r.reason));
    } else if (r.value.success) {
      newContent = newContent.replace(matches[i][0], `\n\n${r.value.svg}\n\n`);
      replaced++;
    } else {
      failedReasons.push(r.value.error);
    }
  }
  return { success: true, content: newContent, replaced, failedReasons };
}
