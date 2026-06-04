'use server';

// 截图 → TikZ：把用户上传/粘贴的图发给 HF 上的 nllg/DeTikZify Space（专为图→TikZ 的生成模型），
// 取回 TikZ 源码，供 TikZ 作图工作台填入编辑器→编译预览→插入题面。
//
// 直连 Gradio Space（不经本地 math-cv-service，可部署/普通用户可用）。配置 HF_TOKEN（付费）则
// 走 ZeroGPU 优先、免排队；缺省则匿名（能用但会排队、较慢）。

import { Client, handle_file } from '@gradio/client';
import { createClient } from '@/lib/supabase/server';

const SPACE = 'nllg/DeTikZify';
const MODEL = 'nllg/detikzify-v2.5-8b';
const API = '/generate';
const RETRIES = 3; // 经代理到 HF 偶发 SSL EOF / ZeroGPU 抖动，重试常能过

export type ScreenshotTikzResult =
  | { success: true; tikz: string; libraries: string }
  | { success: false; error: string };

/** DeTikZify 输出是整篇文档；抽取 tikzpicture 环境 + \usetikzlibrary（作图工作台只吃 tikzpicture，库走 libs 字段）。 */
function extractTikz(full: string): { tikz: string; libraries: string } {
  const pics = full.match(/\\begin\{tikzpicture\}[\s\S]*?\\end\{tikzpicture\}/g);
  const tikz = (pics && pics.length ? pics.join('\n\n') : full).trim();
  const libs = new Set<string>();
  for (const m of full.matchAll(/\\usetikzlibrary\{([^}]*)\}/g)) {
    for (const l of m[1].split(',')) {
      const t = l.trim();
      if (t) libs.add(t);
    }
  }
  return { tikz, libraries: [...libs].join(',') };
}

export async function screenshotToTikz(
  imageBase64: string,
  mime: string = 'image/png',
): Promise<ScreenshotTikzResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: '请先登录后再使用截图转 TikZ' };

  let bytes: Buffer;
  try {
    bytes = Buffer.from(imageBase64, 'base64');
  } catch {
    return { success: false, error: '无效的图片数据' };
  }
  if (bytes.length === 0) return { success: false, error: '图片为空' };
  if (bytes.length > 8 * 1024 * 1024) return { success: false, error: '图片过大（上限 8MB）' };

  const token = process.env.HF_TOKEN;
  const connectOpts = (token ? { hf_token: token as `hf_${string}` } : {}) as Parameters<
    typeof Client.connect
  >[1];

  let lastErr: unknown;
  for (let attempt = 0; attempt < RETRIES; attempt++) {
    try {
      const app = await Client.connect(SPACE, connectOpts);
      const blob = new Blob([new Uint8Array(bytes)], { type: mime });
      const img = { background: handle_file(blob), layers: [], composite: handle_file(blob) };
      // /generate 签名：model, image, temp, top_p, top_k, penalty, timeout, expand, preprocess, alg
      const res = await app.predict(API, [
        MODEL,
        img,
        0.8,
        0.95,
        0,
        0.6,
        10,
        false,
        true,
        'sampling',
      ]);
      const data = res.data as unknown;
      const raw = Array.isArray(data) ? data[0] : data;
      const full = typeof raw === 'string' ? raw : '';
      if (!full || !/tikzpicture/.test(full)) {
        lastErr = new Error('模型未能从图中识别出图形');
        continue;
      }
      return { success: true, ...extractTikz(full) };
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
  const msg = lastErr instanceof Error ? lastErr.message : String(lastErr);
  return { success: false, error: `识别失败（${RETRIES} 次重试）：${msg.slice(0, 200)}。云端排队/抖动可稍后重试。` };
}
