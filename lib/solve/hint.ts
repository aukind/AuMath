// 渐进式解题提示（Socratic hint）的 Gemini 调用。
//
// 设计原则同 lib/knowledge/classify.ts、lib/.../embeddings：无 key / 超时 / 输出损坏
// 一律降级返回 null，绝不抛错连累主流程；鉴权与落库在 app/actions/solve.ts。
//
// 关键约束：服务端持有「完整标准解 + 答案」用于「锚定」提示的正确性，但系统指令
// 强制「绝不泄露最终答案/数值结果」——这是和「直接给解析」最本质的区别，也是
// 对标 Brilliant Koji 的核心：在学生卡住的那一刻给「刚好够往前一步」的推力。

import { GoogleGenAI } from '@google/genai';

const HINT_MODEL = 'gemini-2.5-flash';
const HINT_TIMEOUT_MS = 30_000;

/** 提示分级：每级递进一层，绝不跨级泄底。 */
export type HintLevel = 1 | 2 | 3;

const LEVEL_BRIEF: Record<HintLevel, string> = {
  1: '【L1·定向】只点明这道题考查的方向/模型，并抛出一个学生此刻该自问的问题。绝不给出具体方法或公式。',
  2: '【L2·方法】指出解题的关键方法、变形或思路（例如「联立后用韦达定理表示弦长」），但绝不代入数字、绝不展开计算。',
  3: '【L3·关键步】把学生最可能卡住的那一步讲透（可写出该步的关系式/方程），但必须停在得出最终答案之前，绝不给出最终结果或数值。',
};

function buildSystemInstruction(level: HintLevel): string {
  return `你是一位顶尖的中国高中数学竞赛/高考压轴题教练，正在学生「卡住」的那一刻给他提示。

你的唯一目标：给出**刚好够让学生自己往前走一步**的提示，而不是替他解题。

${LEVEL_BRIEF[level]}

═══ 铁律（违反即失败）═══
1. 绝对禁止泄露最终答案、最终数值、最终结论，或能让学生直接抄写得到答案的完整推导。
2. 我会在输入里给你「标准解与答案」，那只是供你**确保提示方向正确**，绝不可照搬或透露其结论。
3. 提示要简短（中文，1-3 句话，≤120 字），像老师在旁边点一句，而不是写一段解析。
4. 用 LaTeX 写公式（行内用单美元符号 $...$）。
5. 如果学生提供了「我卡在哪」的描述，针对他的卡点给提示，而不是泛泛而谈。
6. 只输出原始 JSON，无解释无 Markdown 围栏：{"hint":"<提示文本>"}`;
}

export interface HintInput {
  content: string;            // 题面
  analysis?: string | null;   // 解析（思路）
  answer?: string | null;     // 答案
  solution?: string | null;   // 标准解
  level: HintLevel;
  studentContext?: string;    // 「我卡在哪」自由文本（可选；二期可接 OCR 演算文本）
}

/**
 * 生成单条渐进提示。失败（无 key/超时/解析损坏）一律返回 null，由调用方降级。
 */
export async function generateProgressiveHint(input: HintInput): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || !input.content.trim()) return null;

  const client = new GoogleGenAI({ apiKey, httpOptions: { timeout: HINT_TIMEOUT_MS } });

  // 「标准解/答案」仅供模型锚定，截断防超长；学生卡点描述也截断。
  const grounding = [
    `【题面】\n${input.content.slice(0, 4000)}`,
    input.analysis?.trim() ? `【解析(仅供你锚定，勿泄露)】\n${input.analysis.slice(0, 2500)}` : '',
    input.solution?.trim() ? `【标准解(仅供你锚定，勿泄露)】\n${input.solution.slice(0, 2500)}` : '',
    input.answer?.trim() ? `【最终答案(严禁透露)】\n${input.answer.slice(0, 500)}` : '',
    input.studentContext?.trim() ? `【学生说他卡在哪】\n${input.studentContext.slice(0, 800)}` : '',
  ].filter(Boolean).join('\n\n');

  try {
    const res = await client.models.generateContent({
      model: HINT_MODEL,
      contents: [{ role: 'user', parts: [{ text: grounding }] }],
      config: {
        systemInstruction: buildSystemInstruction(input.level),
        responseMimeType: 'application/json',
        maxOutputTokens: 1024,
        temperature: 0.4,
        thinkingConfig: { thinkingBudget: 0 },
      },
    });
    const text = (res.text ?? '').replace(/^```(?:json)?\s*|\s*```$/g, '').trim();
    const parsed = JSON.parse(text) as { hint?: unknown };
    const hint = typeof parsed.hint === 'string' ? parsed.hint.trim() : '';
    return hint || null;
  } catch (e) {
    console.warn('[generateProgressiveHint] 失败（已降级）：', (e as Error).message);
    return null;
  }
}
