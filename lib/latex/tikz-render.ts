import 'server-only';

/**
 * 服务端 TikZ → 自包含 SVG 编译（录题作图，无需 AI、无需管理员密钥）。
 *
 * 引擎：node-tikzjax —— 同 tikzjax.com 上游的 WASM TeX + dvi2svg，但把全部宏包/格式
 * 预载进内存（非按需拉取，故可靠），纯 JS+WASM、无原生二进制、无 TeX Live，可直接跑在
 * 普通 Vercel Node 函数里。沙箱 WASM + 固定宏包集 + 无 shell-escape ⇒ 无 RCE 面。
 * 支持 tikz / pgfplots / circuitikz / chemfig / tikz-cd / tikz-3dplot 等。
 *
 * 产物处理：dvi2svg 的文字是 `<text font-family="cmr10">` 引用 Computer Modern 网络字体。
 * 为让图形在 `<img src=.svg>`（题卡/讲义 PDF 管线都走 <img>）下也能正确显示字形，这里把
 * 用到的 BaKoMa 字体以 data-URI `@font-face` 内嵌进 SVG —— 经实测 <img> 会应用内嵌
 * data-URI 字体。如此每张图自包含、可上传为 .svg 文件、用既有图片管线 ![](url) 入题，
 * 不必内联进题面文本，也就不需要放宽 rehype-sanitize 的 SVG 白名单（更安全）。
 */

import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import * as tikzNs from 'node-tikzjax';

export interface TikzTexOptions {
  /** 额外宏包：{ pgfplots: '', amsmath: 'intlimits' } → \usepackage[intlimits]{amsmath} */
  texPackages?: Record<string, string>;
  /** 额外 TikZ 库，逗号分隔：'arrows.meta,calc' */
  tikzLibraries?: string;
  /** 追加到导言区的任意 LaTeX */
  addToPreamble?: string;
}

type Tex2Svg = (input: string, options?: Record<string, unknown>) => Promise<string>;
// node-tikzjax 是 CJS（exports.default=tex2svg 且 __exportStar 了具名导出）。在不同打包/
// interop 形态下 default 可能是函数本身或外层对象，这里统一解析。
const resolvedDefault: unknown = (tikzNs as unknown as { default?: unknown }).default ?? tikzNs;
const tex2svg: Tex2Svg =
  typeof resolvedDefault === 'function'
    ? (resolvedDefault as Tex2Svg)
    : ((resolvedDefault as { default: Tex2Svg }).default);

// node-tikzjax 共享一份模块级内存文件系统，并发编译会互相踩踏 → 串行化。
let chain: Promise<unknown> = Promise.resolve();
function runExclusive<T>(fn: () => Promise<T>): Promise<T> {
  const next = chain.then(fn, fn);
  chain = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

// BaKoMa TTF 目录（node-tikzjax 自带），用于把字体内嵌进 SVG。
let fontDir: string | null = null;
function getFontDir(): string {
  if (fontDir) return fontDir;
  const req = createRequire(join(process.cwd(), 'index.js'));
  fontDir = join(dirname(req.resolve('node-tikzjax/package.json')), 'css', 'bakoma', 'ttf');
  return fontDir;
}

const fontCache = new Map<string, string | null>();
async function fontDataUri(fam: string): Promise<string | null> {
  if (fontCache.has(fam)) return fontCache.get(fam) ?? null;
  // 仅允许 CM 字体名（字母数字），杜绝路径穿越。
  if (!/^[A-Za-z0-9]+$/.test(fam)) {
    fontCache.set(fam, null);
    return null;
  }
  try {
    const buf = await readFile(join(getFontDir(), `${fam}.ttf`));
    const uri = `data:font/ttf;base64,${buf.toString('base64')}`;
    fontCache.set(fam, uri);
    return uri;
  } catch {
    fontCache.set(fam, null);
    return null;
  }
}

async function embedFonts(svg: string): Promise<string> {
  const fams = [
    ...new Set([...svg.matchAll(/font-family\s*[:=]\s*["']?([A-Za-z0-9]+)/g)].map((m) => m[1])),
  ];
  if (fams.length === 0) return svg;
  let faces = '';
  for (const fam of fams) {
    const uri = await fontDataUri(fam);
    if (uri) faces += `@font-face{font-family:'${fam}';src:url(${uri}) format('truetype');}`;
  }
  if (!faces) return svg;
  return svg.replace(/(<svg[^>]*>)/, `$1<style>${faces}</style>`);
}

// 纵深防御：node-tikzjax 已用 JSDOM 消毒，但 SVG 来自用户 LaTeX，仍剥脚本/事件/危险 href。
// 最终图以 <img> 渲染（脚本本就不执行），这里再兜一层。导出以便上传动作复用。
export function sanitizeTikzSvg(svg: string): string {
  return svg
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, '')
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/(?:xlink:)?href\s*=\s*("\s*javascript:[^"]*"|'\s*javascript:[^']*')/gi, '');
}

function wrapDocument(src: string): string {
  const t = src.trim();
  if (/\\begin\s*\{document\}/.test(t)) return t;
  return `\\begin{document}\n${t}\n\\end{document}`;
}

export interface TikzResult {
  svg: string;
}

/**
 * 编译一段 TikZ 源码（通常是 \begin{tikzpicture}…\end{tikzpicture}，会自动包进
 * \begin{document}）为自包含 SVG。编译失败抛错（含 TeX 报错摘要）。
 */
export async function renderTikz(source: string, options: TikzTexOptions = {}): Promise<TikzResult> {
  const input = wrapDocument(source);
  const svg = await runExclusive(() =>
    tex2svg(input, {
      texPackages: options.texPackages ?? {},
      tikzLibraries: options.tikzLibraries ?? '',
      addToPreamble: options.addToPreamble ?? '',
      showConsole: false,
      embedFontCss: false, // 不用其远程 @import；改由本模块内嵌 data-URI 字体
    }),
  );
  return { svg: await embedFonts(sanitizeTikzSvg(svg)) };
}
