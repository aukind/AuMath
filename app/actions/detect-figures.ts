'use server';

// 试卷页面几何图「检测调度器」：优先用自托管的 DocLayout-YOLO 服务（figure-detect，
// 部署在 Fly），未配置时回退 Gemini 视觉（detect-figures-gemini）。
//
// 为何要 YOLO：通用 VLM（Gemini）的 bbox 偏松、会把图形上下的题面/选项文字一起圈进裁剪；
// DocLayout-YOLO 是专训版面分割模型，图/文切得很紧——复刻旧本地 cv-service 的画质。
//
// 客户端（lib/paper/figure-extract.ts）只认归一化 [ymin,xmin,ymax,xmax] 0–1000（PageFigureBox），
// 而检测服务返回的是**像素** [x1,y1,x2,y2] + page_width/height，故在此换算，客户端裁剪零改动。
//
// 为何用 node:http 而非 fetch：dev/start 脚本带 NODE_USE_ENV_PROXY=1，会让全局 fetch(undici)
// 把请求走 ClashX 代理（含内网/自托管地址）导致连不上；node:http 不受该开关影响。

import http from 'node:http';
import https from 'node:https';

import {
  detectFiguresOnPage,
  type DetectFiguresResult,
  type PageFigureBox,
} from '@/app/actions/detect-figures-gemini';

const FIGURE_DETECT_URL = process.env.FIGURE_DETECT_URL ?? '';
const CV_SERVICE_TOKEN = process.env.CV_SERVICE_TOKEN ?? '';
const TIMEOUT_MS = 120_000;

interface CvFigureBox {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  confidence?: number;
}
interface CvDetectResponse {
  success: boolean;
  figures?: CvFigureBox[];
  page_width?: number;
  page_height?: number;
  error?: string;
}

function clamp1000(n: number): number {
  return Math.max(0, Math.min(1000, Math.round(n)));
}

/** 像素框 [x1,y1,x2,y2]（相对 w×h）→ 归一化 [ymin,xmin,ymax,xmax] 0–1000；无效/过小返回 null。 */
function toNormBox(
  f: CvFigureBox,
  w: number,
  h: number,
): [number, number, number, number] | null {
  if (!(w > 0) || !(h > 0)) return null;
  let ymin = clamp1000((f.y1 / h) * 1000);
  let xmin = clamp1000((f.x1 / w) * 1000);
  let ymax = clamp1000((f.y2 / h) * 1000);
  let xmax = clamp1000((f.x2 / w) * 1000);
  if (ymax < ymin) [ymin, ymax] = [ymax, ymin];
  if (xmax < xmin) [xmin, xmax] = [xmax, xmin];
  if (ymax - ymin < 8 || xmax - xmin < 8) return null;
  return [ymin, xmin, ymax, xmax];
}

function postJson<T>(url: string, body: unknown): Promise<T> {
  const u = new URL(url);
  const payload = JSON.stringify(body);
  const lib = u.protocol === 'https:' ? https : http;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Content-Length': String(Buffer.byteLength(payload)),
  };
  if (CV_SERVICE_TOKEN) headers['X-CV-Token'] = CV_SERVICE_TOKEN;

  return new Promise<T>((resolve, reject) => {
    const req = lib.request(u, { method: 'POST', headers, timeout: TIMEOUT_MS }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        const status = res.statusCode ?? 0;
        if (status < 200 || status >= 300) {
          reject(new Error(`检测服务 ${status}: ${text.slice(0, 300)}`));
          return;
        }
        try {
          resolve(JSON.parse(text) as T);
        } catch {
          reject(new Error('检测服务返回非 JSON'));
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('检测服务超时')));
    req.write(payload);
    req.end();
  });
}

/**
 * 检测一页里的所有配图。配了 FIGURE_DETECT_URL 走 DocLayout-YOLO，否则回退 Gemini。
 * 返回类型与 detectFiguresOnPage 完全一致，调用方（PaperUploadWorkflow）无感切换。
 */
export async function detectPageFigures(
  imageBase64: string,
  mimeType: string,
): Promise<DetectFiguresResult> {
  if (!FIGURE_DETECT_URL) {
    return detectFiguresOnPage(imageBase64, mimeType); // 未部署检测服务 → Gemini 回退
  }

  let data: CvDetectResponse;
  try {
    data = await postJson<CvDetectResponse>(
      `${FIGURE_DETECT_URL.replace(/\/$/, '')}/detect-figures`,
      { image_base64: imageBase64 },
    );
  } catch (e) {
    return { success: false, error: `检测服务调用失败：${e instanceof Error ? e.message : String(e)}` };
  }

  if (!data.success) return { success: false, error: data.error ?? '检测失败' };

  const w = data.page_width ?? 0;
  const h = data.page_height ?? 0;
  const figures: PageFigureBox[] = [];
  for (const f of data.figures ?? []) {
    const box = toNormBox(f, w, h);
    if (box) figures.push({ box, kind: '几何图' });
  }

  // YOLO 召回兜底：DocLayout-YOLO 的 figure 类按学术图表/照片训练，对密集文字里的
  // **小幅几何线条图**（正方体/三角形/坐标系等）召回很弱，常整页返回 0 框 → 图丢失。
  // 这种页改用 Gemini 视觉兜底：它语义上认得「立体图/几何图」，召回高得多（框稍松，
  // 但漏图远比框松糟糕）。只在 YOLO 空手时触发，保留 YOLO 能用时的紧框，成本也低。
  if (figures.length === 0) {
    const gem = await detectFiguresOnPage(imageBase64, mimeType);
    if (gem.success && gem.figures.length > 0) return gem;
  }

  return { success: true, figures };
}
