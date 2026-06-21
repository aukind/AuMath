// AI 考点总结卡：把某知识点关联的真题解析 + 定理，归纳成结构化「考点卡」（Markdown）。
// 与 classify.ts 同一 Gemini 范式（@google/genai · gemini-2.5-flash · 无 key/超时/损坏一律降级）。
// 设计核心：grounded 于「你自己题库的真题解析」，不是通用空话；用 [[维基链接]] 接回星图。

import { GoogleGenAI } from '@google/genai';

const MODEL = 'gemini-2.5-flash';
const TIMEOUT_MS = 90_000; // 合成比分类重，给足时间

export interface SynthesisInput {
  topicName: string;
  description?: string | null;
  /** 关联真题样本（题面+解析，调用方已截断） */
  questions: { label: string; content: string; analysis: string }[];
  /** 关联定理名（用于 [[定理]] 引用） */
  theorems: string[];
  /** 子知识点名（用于 [[知识点]] 引用） */
  childTopics: string[];
}

function buildSystemInstruction(topicName: string, theorems: string[], childTopics: string[]): string {
  const thmLine = theorems.length ? theorems.join('、') : '（无）';
  const childLine = childTopics.length ? childTopics.join('、') : '（无）';
  return `你是中国高考数学「考点总结引擎」。任务：把给定的某知识点的真题解析，归纳成一张结构化、可背诵、可复习的「考点卡」（Markdown）。

═══ 铁律 ═══
1. 必须 grounded 于下方提供的真题解析来归纳方法与易错点——这是它的价值所在；不要堆砌与题库无关的通用空话。若解析素材不足，可补该考点的通识方法，但优先复用素材里出现过的思路。
2. 涉及定理时用维基链接 [[定理名]]，只能用这些已存在的定理名：${thmLine}。涉及子知识点用 [[知识点名]]，可用：${childLine}。其它名称不要加 [[]]。
3. LaTeX 公式用 $...$ 包裹（行内）或 $$...$$（独立），符合高考排版。
4. 「代表真题」一节，从提供的题目里挑 3-6 道最典型的，原样列出其标签（如「2024上海卷 第21题」），不要编造不存在的题。
5. 输出纯 Markdown，不要代码围栏，不要额外说明。

═══ 输出结构（严格用这些二级标题）═══
# ${topicName} · 考点卡

## 核心定义与概念
（简明定义/前置概念，必要处给公式）

## 高频题型与方法套路
（按题型分点，每点给「识别特征 → 通用解法步骤」，这是卡片最有价值的部分）

## 常见易错点与陷阱
（从真题解析里提炼的坑，逐条，具体）

## 关联定理
（- [[定理名]] —— 一句话说明在本考点怎么用；无则写「暂无」）

## 代表真题
（- 题目标签，逐行）

## 一句话总结
（一句话点出本考点的核心抓手）`;
}

/** 生成考点卡 Markdown；无 key / 超时 / 输出异常返回 null（调用方降级提示）。 */
export async function synthesizeTopicCard(input: SynthesisInput): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || !input.topicName.trim()) return null;
  if (input.questions.length === 0 && input.theorems.length === 0) return null;

  const client = new GoogleGenAI({ apiKey, httpOptions: { timeout: TIMEOUT_MS } });

  const material = [
    input.description ? `知识点简介：${input.description}` : '',
    '── 关联真题（题面 + 解析）──',
    ...input.questions.map((q, i) =>
      `【${i + 1}｜${q.label}】\n题面：${q.content}\n解析：${q.analysis || '（无解析）'}`),
  ].filter(Boolean).join('\n\n');

  try {
    const res = await client.models.generateContent({
      model: MODEL,
      contents: [{ role: 'user', parts: [{ text: `知识点：${input.topicName}\n\n${material}` }] }],
      config: {
        systemInstruction: buildSystemInstruction(input.topicName, input.theorems, input.childTopics),
        maxOutputTokens: 4096,
      },
    });
    const text = (res.text ?? '').replace(/^```(?:markdown)?\s*|\s*```$/g, '').trim();
    return text.length > 40 ? text : null; // 太短视为失败
  } catch (e) {
    console.warn('[synthesizeTopicCard] 失败（降级）：', (e as Error).message);
    return null;
  }
}
