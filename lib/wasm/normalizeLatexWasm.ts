/**
 * Rust → WASM LaTeX 规范化器的服务端胶水层。
 *
 * - wasm-pack `--target nodejs` 产物是 **同步** 加载的 CJS（require + 同步实例化），
 *   因此这里能提供同步 API，可无缝替换 `lib/normalizeLatex.ts` 的同步调用点。
 * - 产物若尚未构建（未跑 `npm run build:wasm`），加载失败时静默降级（返回 null），
 *   绝不让缺产物拖垮录入流程。
 *
 * ⚠️ 仅服务端：用到 `node:module`。浏览器侧（实时录题校验）需另出 `--target web`
 *    产物 + 异步初始化，见 rust/latex-normalizer/README.md。
 */

import { createRequire } from "node:module";

interface WasmModule {
  normalize_latex: (input: string) => string;
  canonicalize_math_body: (body: string) => string;
}

// undefined = 尚未尝试加载；null = 尝试过但不可用；对象 = 已加载。
let cached: WasmModule | null | undefined;

function loadWasm(): WasmModule | null {
  if (cached !== undefined) return cached;
  try {
    const require = createRequire(import.meta.url);
    // 产物路径：wasm-pack --out-dir 指向 lib/wasm/latex-normalizer/
    cached = require("./latex-normalizer/latex_normalizer.js") as WasmModule;
  } catch {
    cached = null;
  }
  return cached;
}

/** WASM 规范化器是否已构建可用。 */
export function isWasmNormalizerAvailable(): boolean {
  return loadWasm() !== null;
}

/** 整段文本规范化；不可用时返回 null（调用方应降级到 TS 版）。 */
export function normalizeLaTeXWasm(input: string): string | null {
  const m = loadWasm();
  return m ? m.normalize_latex(input) : null;
}

/** 单条公式体规范化；不可用时返回 null。 */
export function canonicalizeMathBodyWasm(body: string): string | null {
  const m = loadWasm();
  return m ? m.canonicalize_math_body(body) : null;
}
