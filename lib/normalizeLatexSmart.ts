/**
 * 规范化入口：默认走成熟的 TS AST 版（`normalizeLaTeX`），
 * 置环境变量 `USE_WASM_NORMALIZER=1` 时优先用 Rust→WASM 版。
 *
 * 设计为 `normalizeLaTeX` 的**同步 drop-in 替换**，便于在录入流程里逐点切换、
 * 随时回退。WASM 版当前仅覆盖词法子集（同义词/间距宏/冗余括号），
 * 上下标重排与 \over→\frac 仍以 TS 版为准——所以生产默认保持 TS。
 */

import { normalizeLaTeX } from "./normalizeLatex";
import { normalizeLaTeXWasm } from "./wasm/normalizeLatexWasm";

const PREFER_WASM = process.env.USE_WASM_NORMALIZER === "1";

export function normalizeLaTeXSmart(input: string): string {
  if (PREFER_WASM) {
    const out = normalizeLaTeXWasm(input);
    if (out !== null) return out; // WASM 可用 → 用之；否则透明降级
  }
  return normalizeLaTeX(input);
}
