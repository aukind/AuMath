'use server';

// 试卷页面几何图检测（纯 Vercel，复用 Gemini 密钥，替代本地 cv-service 的 DocLayout-YOLO）。
// 给一张试卷页面图 → Gemini 视觉返回每张配图的边界框（归一化 0–1000）。
// 裁剪与页面光栅化在客户端用 pdf.js/canvas 完成（见 lib/paper/figure-extract.ts）。

import { GoogleGenAI } from '@google/genai';

/** Gemini 标准 bbox 顺序：[ymin, xmin, ymax, xmax]，归一化 0–1000。 */
export interface PageFigureBox {
  box: [number, number, number, number];
  kind?: string;
}

export type DetectFiguresResult =
  | { success: true; figures: PageFigureBox[] }
  | { success: false; error: string };

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const SUPPORTED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);

const SYSTEM_PROMPT = `你是试卷版面分析助手。给你一张试卷页面图片，找出页面上所有"配图"——
几何图形 / 立体图 / 函数图象 / 坐标系 / 三视图 / 统计图（柱状图/折线图/扇形图/散点图）/ 电路图 / 示意图。

**不要**框：正文文字、数学公式、表格、题号、页眉页脚、斜向半透明水印、机构 logo、二维码、实拍照片。

对每张配图给出：
- box：紧致边界框，格式 [ymin, xmin, ymax, xmax]，数值为相对整张图的**千分比整数 0–1000**（y 纵向、x 横向，原点在左上）。框要贴紧图形、尽量不含周边文字。
- kind：简短类型，如 "几何图"/"立体图"/"函数图象"/"三视图"/"统计图"/"电路图"。

只输出严格 JSON（不要 code fence、不要解释）：
{"figures":[{"box":[ymin,xmin,ymax,xmax],"kind":"..."}]}

要点：
- 一道题配多张小图（如三视图的三个视图、或四个选项各一张图）→ 每张各给一个框。
- 紧挨成组、共用一个外框的整体图 → 给一个框。
- 页面没有任何配图 → 返回 {"figures":[]}。`;

interface RawOut {
  figures?: { box?: unknown; kind?: unknown }[];
}

function clamp1000(n: number): number {
  return Math.max(0, Math.min(1000, Math.round(n)));
}

/** 校验并规整一个 box 为 [ymin,xmin,ymax,xmax]（0–1000，且 min<max）。无效返回 null。 */
function normBox(raw: unknown): [number, number, number, number] | null {
  if (!Array.isArray(raw) || raw.length !== 4 || raw.some((v) => typeof v !== 'number' || !isFinite(v))) {
    return null;
  }
  let [y0, x0, y1, x1] = (raw as number[]).map(clamp1000);
  if (y1 < y0) [y0, y1] = [y1, y0];
  if (x1 < x0) [x0, x1] = [x1, x0];
  if (y1 - y0 < 8 || x1 - x0 < 8) return null; // 太小，多半是误检
  return [y0, x0, y1, x1];
}

export async function detectFiguresOnPage(
  imageBase64: string,
  mimeType: string,
): Promise<DetectFiguresResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return { success: false, error: '服务端配置缺失：GEMINI_API_KEY 未设置' };
  if (!SUPPORTED_MIME.has(mimeType)) return { success: false, error: `不支持的图片类型：${mimeType}` };
  if ((imageBase64.length * 3) / 4 > MAX_IMAGE_BYTES) return { success: false, error: '页面图过大' };

  let raw: string;
  try {
    const client = new GoogleGenAI({ apiKey, httpOptions: { timeout: 90_000 } });
    const result = await client.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        {
          role: 'user',
          parts: [
            { inlineData: { mimeType: mimeType as 'image/png', data: imageBase64 } },
            { text: '请框出这张试卷页面里的所有配图，按系统指令返回 JSON。' },
          ],
        },
      ],
      config: {
        systemInstruction: SYSTEM_PROMPT,
        responseMimeType: 'application/json',
        thinkingConfig: { thinkingBudget: 0 },
        maxOutputTokens: 4096,
      },
    });
    raw = result.text ?? '';
  } catch (e) {
    return { success: false, error: `Gemini 调用失败：${e instanceof Error ? e.message : String(e)}` };
  }

  let parsed: RawOut | null = null;
  try {
    parsed = JSON.parse(raw.trim().replace(/^```(?:json)?\s*|\s*```$/g, '')) as RawOut;
  } catch {
    return { success: false, error: '模型返回的内容不是合法 JSON' };
  }

  const figures: PageFigureBox[] = [];
  for (const f of parsed?.figures ?? []) {
    const box = normBox(f?.box);
    if (box) figures.push({ box, kind: typeof f?.kind === 'string' ? f.kind : undefined });
  }
  return { success: true, figures };
}
