// Gemini 定理识别：判断每道题「用到了」受控词表里的哪些定理。镜像 lib/knowledge/classify.ts。
// 与知识点标注的区别：知识点回答「这题考什么章节考点」，定理回答「解这题动用了哪些定理工具」。
// 设计原则一致：无 key / 超时 / 输出损坏一律降级为空，绝不抛错连累回填主流程。

import { GoogleGenAI } from '@google/genai';
import { THEOREM_PROMPT_LIST, sanitizeTheoremNames } from '@/lib/theorems/taxonomy';

const TH_MODEL = 'gemini-2.5-flash';
const TH_TIMEOUT_MS = 45_000;
const TH_CHUNK_SIZE = 12;

const TH_SYSTEM_INSTRUCTION = `你是中国高考/竞赛数学的「定理使用」标注引擎。给定一批题目（含题面与可选解析），
判断解出每道题**实际动用了**下方受控词表中的哪些定理。

═══ 受控词表（只能使用这些精确名称，一字不差；绝不自创/改写/合并）═══
${THEOREM_PROMPT_LIST}

═══ 标注规则 ═══
1. 标「解题真正用到的工具」，不是「题目所属章节」。例：解析几何题联立直线与椭圆后用根与系数关系 → 标「韦达定理」；求最值用到 $\\frac{a+b}{2}\\ge\\sqrt{ab}$ → 标「基本不等式」。
2. 一题通常 0–3 个。**宁缺毋滥**：词表里没有真正贴切的就返回空数组，绝不硬凑。
3. 只看是否用到该定理本身，别因为出现相关字眼就标。
4. 输出 ONLY 原始 JSON，无解释无 Markdown 围栏：
{"items":[{"id":"<原样返回的题目id>","theorems":["...","..."]}]}`;

export interface ClassifyTheoremItem {
  id: string;
  text: string;
}

/**
 * 批量识别定理使用。返回 id → 词表内定理名（已清洗）。失败批次静默跳过。
 */
export async function classifyTheorems(items: ClassifyTheoremItem[]): Promise<Map<string, string[]>> {
  const result = new Map<string, string[]>();
  const apiKey = process.env.GEMINI_API_KEY;
  const valid = items.filter(it => it.id && it.text.trim());
  if (!apiKey || !valid.length) return result;

  const client = new GoogleGenAI({ apiKey, httpOptions: { timeout: TH_TIMEOUT_MS } });

  for (let i = 0; i < valid.length; i += TH_CHUNK_SIZE) {
    const chunk = valid.slice(i, i + TH_CHUNK_SIZE);
    try {
      const payload = JSON.stringify({
        questions: chunk.map(it => ({ id: it.id, text: it.text.slice(0, 4000) })),
      });
      const res = await client.models.generateContent({
        model: TH_MODEL,
        contents: [{ role: 'user', parts: [{ text: payload }] }],
        config: {
          systemInstruction: TH_SYSTEM_INSTRUCTION,
          responseMimeType: 'application/json',
          maxOutputTokens: 8192,
          thinkingConfig: { thinkingBudget: 0 },
        },
      });
      const text = (res.text ?? '').replace(/^```(?:json)?\s*|\s*```$/g, '').trim();
      const parsed = JSON.parse(text) as { items?: { id?: unknown; theorems?: unknown }[] };
      for (const item of parsed.items ?? []) {
        const id = String(item.id ?? '');
        const names = sanitizeTheoremNames(item.theorems);
        if (id && names.length) result.set(id, names);
      }
    } catch (e) {
      console.warn('[classifyTheorems] 批次失败（已跳过）：', (e as Error).message);
    }
  }
  return result;
}
