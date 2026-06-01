'use server';

// Next.js ↔ 本地/自托管 math-cv-service 的代理层。
// 把后端地址藏在服务端（环境变量），并带上鉴权头；遵循 extract-latex.ts 的
// 判别式返回类型约定。
//
// 为何用 node:http 而非 fetch：dev/start 脚本带 NODE_USE_ENV_PROXY=1，会让
// 全局 fetch(undici) 把请求走 ClashX 代理 —— 包括 localhost:8000，导致连不上。
// node:http/https 不受该开关影响，直连 CV 服务，零额外依赖。

import http from 'node:http';
import https from 'node:https';

import type { FigureBox, PipelineId, ProcessResult, RasterizePage } from '@/types/tikz';

const CV_SERVICE_URL = process.env.CV_SERVICE_URL ?? 'http://127.0.0.1:8000';
const CV_SERVICE_TOKEN = process.env.CV_SERVICE_TOKEN ?? '';
const TIMEOUT_MS = 120_000;

function postJson<T>(path: string, body: unknown): Promise<T> {
  const url = new URL(`${CV_SERVICE_URL}${path}`);
  const payload = JSON.stringify(body);
  const lib = url.protocol === 'https:' ? https : http;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Content-Length': String(Buffer.byteLength(payload)),
  };
  if (CV_SERVICE_TOKEN) headers['X-CV-Token'] = CV_SERVICE_TOKEN;

  return new Promise<T>((resolve, reject) => {
    const req = lib.request(url, { method: 'POST', headers, timeout: TIMEOUT_MS }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        const status = res.statusCode ?? 0;
        if (status < 200 || status >= 300) {
          reject(new Error(`CV 服务 ${status}: ${text.slice(0, 300)}`));
          return;
        }
        try {
          resolve(JSON.parse(text) as T);
        } catch {
          reject(new Error('CV 服务返回非 JSON'));
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('CV 服务超时')));
    req.write(payload);
    req.end();
  });
}

function describeError(err: unknown): string {
  const code = (err as { code?: string })?.code;
  if (code === 'ECONNREFUSED' || code === 'ENOTFOUND') {
    return `连不上 CV 服务（${CV_SERVICE_URL}）—— 确认本地 uvicorn 已启动`;
  }
  return err instanceof Error ? err.message : String(err);
}

// ── PDF 栅格化 ────────────────────────────────────────────────────────────
export type RasterizeActionResult =
  | { success: true; pages: RasterizePage[] }
  | { success: false; error: string };

export async function rasterizePdf(pdfBase64: string): Promise<RasterizeActionResult> {
  try {
    const data = await postJson<{ success: boolean; pages: RasterizePage[]; error?: string }>(
      '/rasterize',
      { pdf_base64: pdfBase64 },
    );
    if (!data.success) return { success: false, error: data.error ?? 'PDF 栅格化失败' };
    return { success: true, pages: data.pages };
  } catch (err) {
    return { success: false, error: describeError(err) };
  }
}

// ── 自动检测几何图（DocLayout-YOLO）─────────────────────────────────────────
export type DetectActionResult =
  | { success: true; figures: FigureBox[] }
  | { success: false; error: string };

export async function detectFigures(imageBase64: string): Promise<DetectActionResult> {
  try {
    const data = await postJson<{ success: boolean; figures: FigureBox[]; error?: string }>(
      '/detect-figures',
      { image_base64: imageBase64 },
    );
    if (!data.success) return { success: false, error: data.error ?? '检测失败' };
    return { success: true, figures: data.figures };
  } catch (err) {
    return { success: false, error: describeError(err) };
  }
}

// ── 整页全自动：检测 + 归属题号 + 还原矢量 + 内联 SVG ─────────────────────────
export interface AutoFigure {
  question_number: number | null;
  crop_base64: string;
  inline_svg: string;
  svg: string;
  labels: { text: string; x_percent: number; y_percent: number; confidence?: number | null }[];
  confidence: number;
  box: number[];
}

export type AutoFiguresActionResult =
  | { success: true; figures: AutoFigure[]; pageWidth: number; pageHeight: number }
  | { success: false; error: string };

export async function autoFigures(imageBase64: string): Promise<AutoFiguresActionResult> {
  try {
    const data = await postJson<{
      success: boolean;
      figures: AutoFigure[];
      page_width: number;
      page_height: number;
      error?: string;
    }>('/auto-figures', { image_base64: imageBase64 });
    if (!data.success) return { success: false, error: data.error ?? '自动识别失败' };
    return { success: true, figures: data.figures, pageWidth: data.page_width, pageHeight: data.page_height };
  } catch (err) {
    return { success: false, error: describeError(err) };
  }
}

/** 整卷自动：后端直接 fetch 签名 URL（PDF 逐页栅格化），返回各图 + 归属题号。 */
export async function autoFiguresFromDoc(
  url: string,
  fileType: 'pdf' | 'image',
  vectorize = true,
): Promise<AutoFiguresActionResult> {
  try {
    const data = await postJson<{ success: boolean; figures: AutoFigure[]; error?: string }>(
      '/auto-figures-doc',
      { url, file_type: fileType, vectorize },
    );
    if (!data.success) return { success: false, error: data.error ?? '自动识别失败' };
    return { success: true, figures: data.figures, pageWidth: 0, pageHeight: 0 };
  } catch (err) {
    return { success: false, error: describeError(err) };
  }
}

// ── 双轨处理 ──────────────────────────────────────────────────────────────
export type ProcessActionResult =
  | { success: true; result: ProcessResult }
  | { success: false; error: string };

export async function processPipeline(
  imageBase64: string,
  pipeline: PipelineId,
  mimeType = 'image/png',
): Promise<ProcessActionResult> {
  const path = pipeline === 'A' ? '/pipeline-a/process' : '/pipeline-b/process';
  try {
    const data = await postJson<ProcessResult>(path, {
      image_base64: imageBase64,
      mime_type: mimeType,
    });
    if (!data.success) return { success: false, error: data.error ?? '处理失败' };
    return { success: true, result: data };
  } catch (err) {
    return { success: false, error: describeError(err) };
  }
}
