/**
 * Rust→WASM 规范化器 vs TS 实现的**交叉 parity 测试**。
 *
 * 不重复列预期值，而是直接断言 `wasm(input) === ts(input)` —— 只要两者一致，
 * 就证明 WASM 达成与成熟 TS 版的全量 parity。产物未构建时整体跳过，不会变红。
 */
import { describe, it, expect } from "vitest";
import { normalizeLaTeX, canonicalizeMathBody } from "../normalizeLatex";
import {
  isWasmNormalizerAvailable,
  canonicalizeMathBodyWasm,
  normalizeLaTeXWasm,
} from "../wasm/normalizeLatexWasm";

const available = isWasmNormalizerAvailable();

// 覆盖 normalizeLatex.test.ts 的全部公式体用例。
const MATH_BODY_CASES = [
  "x \\, + \\, y",
  "x \\! y",
  "a \\quad b \\qquad c",
  "a \\; b \\: c",
  "\\frac{\\,d^2y\\,}{\\,dx^2\\,}",
  "x \\le y",
  "x \\ge y",
  "x \\ne y",
  "x \\to y",
  "A \\land B \\lor C",
  "x^{2}_{i}",
  "abc^{n}_{k}",
  "x_{i}^{2}",
  "x^{2}",
  "x_{i}",
  "\\frac{x^{2}_{1}}{a^{2}}",
  "1 \\over 2",
  "a+b \\over c+d",
  "\\frac{1}{2}",
  "\\frac 1 2",
  "\\frac{a}{b}",
  "{{x}}",
  "{{{x}}}",
  "{x}",
  "\\frac{d}{dx}\\frac{\\,x^{2}_{i}\\, + 1}{x - 1}",
  "\\frac{x^{2}_{1}}{a^{2}} + \\frac{y^{2}_{1}}{b^{2}} = 1",
];

const FULL_CASES = [
  "已知 $x \\le y$ 且 $y \\ge x$，则 $x \\ne y$。",
  "设椭圆方程为 $$\\frac{x^{2}_{1}}{a^{2}} + \\frac{y^{2}_{1}}{b^{2}} = 1$$ 其中 $a \\ge b > 0$。",
  "圆锥曲线：椭圆、双曲线、抛物线的统称。",
  "价格为 \\$50 和 \\$100",
];

describe.skipIf(!available)("WASM ↔ TS 全量 parity", () => {
  for (const c of MATH_BODY_CASES) {
    it(`canonicalizeMathBody parity: ${JSON.stringify(c)}`, () => {
      expect(canonicalizeMathBodyWasm(c)).toBe(canonicalizeMathBody(c));
    });
  }

  for (const c of FULL_CASES) {
    it(`normalizeLaTeX parity: ${JSON.stringify(c.slice(0, 24))}…`, () => {
      expect(normalizeLaTeXWasm(c)).toBe(normalizeLaTeX(c));
    });
  }

  it("WASM 自身幂等", () => {
    for (const c of MATH_BODY_CASES) {
      const once = canonicalizeMathBodyWasm(c)!;
      expect(canonicalizeMathBodyWasm(once)).toBe(once);
    }
  });
});

if (!available) {
  describe("WASM 规范化器", () => {
    it.skip("产物未构建（npm run build:wasm 后启用）", () => {});
  });
}
