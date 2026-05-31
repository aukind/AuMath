'use server';

import { GoogleGenAI } from '@google/genai';

export type ExtractLatexResult =
  | { success: true; markdown: string; rawModelOutput?: string }
  | { success: false; error: string; rawModelOutput?: string };

const SUPPORTED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);

// Clipboard PNGs from a typical screenshot tool sit in the 100s of KB;
// 6 MB covers full-page captures and keeps base64 transit reasonable.
const MAX_IMAGE_BYTES = 6 * 1024 * 1024;

const SYSTEM_PROMPT = `你是高考数学题录题助手。用户会粘贴一张包含一道完整题目的截图（题干可能含中文叙述、若干公式、子小题、配图）。

你的任务：把整张图里的**文字 + 公式**原样转写为 Markdown + 内嵌 LaTeX，准备直接录入题库。

输出格式（严格 JSON，不要 code fence、不要解释）：
{"markdown": "..."}

转写规则：
1. **中文/英文叙述文字保留为普通段落文本**，不要塞进 $ 定界符里。
2. **行内公式用 \`$...$\`**：如 $a_n$、$\\dfrac{1}{5}$、$x^2+1$。
3. **独立成行的大公式用 \`$$...$$\`**：如分块矩阵、对齐方程、占整行的复杂积分。绝大多数中学题目应该全部用行内 \`$...$\`。
4. **【关键】完全忽略所有图形与杂物**：几何图（三棱柱、四棱锥、立体几何示意图）、函数图象、坐标系、三视图、统计图、电路图、数表都**只字不提**。不要描述图形，不要插入任何占位符，不要写 "如图所示" 以外的图形相关说明（如果原题写了 "如图"，原样保留这三个字即可）。图形会由用户后续手工补回。同样，实拍照片、机构 Logo、二维码、以及斜向半透明的网站水印（如重复的 "UP" / 网址字样）都**当作不存在**，绝不要把水印文字或照片内容写进结果；水印若压在题字上，按题干本意还原文字、丢弃水印。
5. **子小题用 \`**(1)**\`、\`**(2)**\`、\`**(3)**\` 这种粗体加括号数字开头**，每个子小题单独成段（用 \\n\\n 分隔）。
6. **选择题选项**：每个选项单独成段，格式 \`(A) 内容\\n\\n(B) 内容\\n\\n(C) 内容\\n\\n(D) 内容\`。**四个选项必须全部转写**，不要在 (C) 后截断。
7. 题号（"21."、"二、"）不要写进去 —— 它们是排版元素，不属于题目内容。
8. 分式优先用 \`\\dfrac\` 而不是 \`\\frac\`（中文教学排版习惯）。
9. 多个公式紧挨着时，用空格分隔保持可读：\`$a_n$, $b_n$\` 而不是 \`$a_n,b_n$\`。
10. 严禁使用 \`\\href\` / \`\\url\` / \`\\includegraphics\` 这类 trust 受限宏。
11. 不要修改、简化、补全图里的内容；不要添加图里没有的话。
12. 如果图里有手写的、模糊的、看不清的字符，按你最高置信度的猜测写出来，不要留空也不要写 "[模糊]"。
13. **【希腊字母必须保留】**希腊字母（α β γ δ ε ζ η θ ι κ λ μ ν ξ ο π ρ σ τ υ φ χ ψ ω 和它们的大写）与拉丁字母外观相近，**绝对不能**把 α 录成 a、β 录成 b、γ 录成 y、ν 录成 v、π 录成 n、ρ 录成 p、χ 录成 x、ω 录成 w 等。任何 Greek letter 都必须用 LaTeX 命令保留：α→\\alpha，β→\\beta，γ→\\gamma，θ→\\theta，π→\\pi，σ→\\sigma，φ→\\phi，ω→\\omega，等等。
14. **【集合补集符号】**中国教材里的补集符号 ∁（如 ∁_U A）必须用 \`\\complement\` 命令转写，**不要**写成 \\mathsf{C}、\\mathbf{C}、\\mathbb{C}、\\mathcal{C} 或裸 C —— 这些都不是补集符号。正确写法：\`\\complement_I S\`，错误：\`\\mathsf{C}_I S\`、\`C_I S\`。

输出示例（图形完全跳过，只转写文字+公式）：
{"markdown":"如图, $A_1B_1C_1\\\\text{-}ABC$ 是直三棱柱, $\\\\angle BCA=90^\\\\circ$，点 $D_1, F_1$ 分别是 $A_1B_1, A_1C_1$ 的中点，若 $BC=CA=CC_1$，则 $BD_1$ 与 $AF_1$ 所成的角的余弦值是\\n\\n(A) $\\\\dfrac{\\\\sqrt{30}}{10}$\\n\\n(B) $\\\\dfrac{1}{2}$\\n\\n(C) $\\\\dfrac{\\\\sqrt{30}}{15}$\\n\\n(D) $\\\\dfrac{\\\\sqrt{15}}{10}$"}`;

interface ModelOutput {
  markdown: unknown;
}

function safeParseModelJson(raw: string): ModelOutput | null {
  // The model is instructed not to fence, but Gemini sometimes still wraps the
  // payload — strip a single ```json…``` shell defensively before parsing.
  const trimmed = raw.trim().replace(/^```(?:json)?\s*|\s*```$/g, '');
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (parsed && typeof parsed === 'object') return parsed as ModelOutput;
  } catch {
    /* fallthrough */
  }
  return null;
}

export async function extractLatexFromImage(
  imageBase64: string,
  mimeType: string,
): Promise<ExtractLatexResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return { success: false, error: '服务端配置缺失：GEMINI_API_KEY 未设置' };
  }

  if (!SUPPORTED_MIME.has(mimeType)) {
    return {
      success: false,
      error: `不支持的图片类型：${mimeType}（仅支持 PNG / JPEG / WebP / GIF）`,
    };
  }

  // Base64 → byte-count: every 4 chars decode to 3 bytes; trailing padding
  // throws this off by 1–2 bytes, fine as a guard rail.
  const approxBytes = (imageBase64.length * 3) / 4;
  if (approxBytes > MAX_IMAGE_BYTES) {
    return {
      success: false,
      error: `图片超出 ${(MAX_IMAGE_BYTES / 1024 / 1024).toFixed(0)}MB 上限`,
    };
  }

  let raw: string;
  try {
    // 硬超时：@google/genai 默认不超时，重图卡住会让弹窗一直转圈；90s 后快速失败成可读错误。
    const client = new GoogleGenAI({ apiKey, httpOptions: { timeout: 90_000 } });
    const result = await client.models.generateContent({
      // Flash handles full-question transcription fine; Pro adds latency
      // without meaningfully better LaTeX for typical problem screenshots.
      model: 'gemini-2.5-flash',
      contents: [{
        role: 'user',
        parts: [
          { inlineData: { mimeType: mimeType as 'image/png', data: imageBase64 } },
          { text: '请按系统指令把这张题目截图原样转写为 Markdown + 内嵌 LaTeX。' },
        ],
      }],
      config: {
        systemInstruction: SYSTEM_PROMPT,
        responseMimeType: 'application/json',
        // Disable thinking — transcription is perception, not reasoning;
        // thinking tokens just pad latency.
        thinkingConfig: { thinkingBudget: 0 },
        maxOutputTokens: 8192,
      },
    });
    raw = result.text ?? '';
  } catch (e) {
    return {
      success: false,
      error: `Gemini 调用失败：${e instanceof Error ? e.message : String(e)}`,
    };
  }

  if (!raw) {
    return { success: false, error: '模型未返回任何内容' };
  }

  const parsed = safeParseModelJson(raw);
  if (!parsed) {
    return {
      success: false,
      error: '模型返回的内容不是合法 JSON',
      rawModelOutput: raw,
    };
  }

  const markdown =
    typeof parsed.markdown === 'string' ? parsed.markdown.trim() : '';

  if (!markdown) {
    return {
      success: false,
      error: '图中未识别到可用内容',
      rawModelOutput: raw,
    };
  }

  return { success: true, markdown, rawModelOutput: raw };
}
