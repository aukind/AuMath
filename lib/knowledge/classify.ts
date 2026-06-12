// Gemini 文本分类：给存量题（或单题）从受控词表里标 1-4 个知识点。
//
// 与试卷提取（process-paper 在 OCR 同一次调用里顺带标注）互补：
// 这里只吃纯文本（题面+解析摘要），供「存量回填」与录题表单「AI 识别」复用。
// 设计原则同 embeddings.ts：无 key / 超时 / 输出损坏一律降级为空，绝不抛错连累主流程。

import { GoogleGenAI } from '@google/genai';
import { KP_PROMPT_LIST, sanitizeKnowledgePoints } from '@/lib/knowledge/taxonomy';

const KP_MODEL = 'gemini-2.5-flash';
const KP_TIMEOUT_MS = 45_000;
const KP_CHUNK_SIZE = 15; // 单次调用题数：纯文本分类很快，15 题一批稳在数秒内

const KP_SYSTEM_INSTRUCTION = `你是中国高考数学知识点标注引擎。给定一批题目（含题面与可选的解析），为每道题从下方受控词表中选出 1-4 个最贴切的知识点。

═══ 受控词表（只能使用这些精确名称，一字不差；绝不允许自创、改写、合并名称）═══
${KP_PROMPT_LIST}

═══ 标注规则 ═══
1. 跨章节综合题必须把每个实际考查到的知识点都标出来。例：概率大题里用数列递推求第 n 次的概率 → 同时标「概率与数列递推」「数列递推」；解析几何大题用基本不等式求最值 → 同时标「弦长与面积」「基本不等式」。
2. 第一个知识点必须是该题最核心的考点。
3. 小题（选择/填空）通常 1-2 个；解答大题通常 2-4 个。宁缺毋滥，确实考到才标。
4. 输出 ONLY 原始 JSON，无解释无 Markdown 围栏：
{"items":[{"id":"<原样返回的题目id>","knowledge_points":["...","..."]}]}`;

export interface ClassifyItem {
  id: string;
  /** 题面（可拼接解析片段提升准确率），调用方自行截断 */
  text: string;
}

/**
 * 批量标注。返回 id → 词表内知识点名（已清洗）。
 * 失败的批次静默跳过，对应 id 不出现在结果里。
 */
export async function classifyKnowledgePoints(items: ClassifyItem[]): Promise<Map<string, string[]>> {
  const result = new Map<string, string[]>();
  const apiKey = process.env.GEMINI_API_KEY;
  const valid = items.filter(it => it.id && it.text.trim());
  if (!apiKey || !valid.length) return result;

  const client = new GoogleGenAI({ apiKey, httpOptions: { timeout: KP_TIMEOUT_MS } });

  for (let i = 0; i < valid.length; i += KP_CHUNK_SIZE) {
    const chunk = valid.slice(i, i + KP_CHUNK_SIZE);
    try {
      const payload = JSON.stringify({
        questions: chunk.map(it => ({ id: it.id, text: it.text.slice(0, 4000) })),
      });
      const res = await client.models.generateContent({
        model: KP_MODEL,
        contents: [{ role: 'user', parts: [{ text: payload }] }],
        config: {
          systemInstruction: KP_SYSTEM_INSTRUCTION,
          responseMimeType: 'application/json',
          maxOutputTokens: 8192,
          thinkingConfig: { thinkingBudget: 0 },
        },
      });
      const text = (res.text ?? '').replace(/^```(?:json)?\s*|\s*```$/g, '').trim();
      const parsed = JSON.parse(text) as { items?: { id?: unknown; knowledge_points?: unknown }[] };
      for (const item of parsed.items ?? []) {
        const id = String(item.id ?? '');
        const points = sanitizeKnowledgePoints(item.knowledge_points);
        if (id && points.length) result.set(id, points);
      }
    } catch (e) {
      console.warn('[classifyKnowledgePoints] 批次失败（已跳过）：', (e as Error).message);
    }
  }
  return result;
}
