'use server';

// 录题作图：浏览器写 TikZ → 服务端 node-tikzjax 编译成自包含 SVG → 预览 / 入题。
// 仅登录用户可用（编译有算力成本、上传写公共桶）。编译产物用既有图片管线落库
// （uploadFigureSvg → paper-figures 桶 → 题面以 ![](url) 引用，<img> 原生渲染）。

import { createClient } from '@/lib/supabase/server';
import { uploadFigureSvg } from '@/app/actions/figure-image';
import { renderTikz, sanitizeTikzSvg, type TikzTexOptions } from '@/lib/latex/tikz-render';

export type CompileTikzResult =
  | { success: true; svg: string }
  | { success: false; error: string };

async function requireUser(): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ? { ok: true } : { ok: false, error: '请先登录后再使用作图编译' };
}

/** 把 TeX 引擎抛出的错误转成对录题者友好的中文摘要。 */
function friendlyError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (/render failed/i.test(msg)) {
    return '编译失败：TikZ 源码有误，或用到未预载的宏包/库。请检查语法（如括号、分号、\\begin/\\end 配对）。';
  }
  return `编译失败：${msg.slice(0, 200)}`;
}

/** 编译 TikZ 源码为自包含 SVG（用于实时预览，不落库）。 */
export async function compileTikzAction(
  source: string,
  options: TikzTexOptions = {},
): Promise<CompileTikzResult> {
  const auth = await requireUser();
  if (!auth.ok) return { success: false, error: auth.error };
  if (!source.trim()) return { success: false, error: '请输入 TikZ 源码' };
  if (source.length > 50_000) return { success: false, error: '源码过长（上限 5 万字符）' };

  try {
    const { svg } = await renderTikz(source, options);
    return { success: true, svg };
  } catch (err) {
    return { success: false, error: friendlyError(err) };
  }
}

export type UploadTikzResult =
  | { success: true; url: string }
  | { success: false; error: string };

/**
 * 把已编译好的 SVG 上传为 .svg 文件，返回公开 URL（供题面 ![](url) 引用）。
 * 服务端再消毒一遍，不信任客户端传来的 SVG。
 */
export async function uploadTikzFigureAction(svg: string): Promise<UploadTikzResult> {
  const auth = await requireUser();
  if (!auth.ok) return { success: false, error: auth.error };
  if (!/^\s*<svg[\s>]/i.test(svg)) return { success: false, error: '无效的 SVG' };
  if (svg.length > 6_000_000) return { success: false, error: 'SVG 过大' };

  const clean = sanitizeTikzSvg(svg);
  return uploadFigureSvg(clean);
}
