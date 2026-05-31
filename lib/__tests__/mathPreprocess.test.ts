import { describe, it, expect } from "vitest";
import katex from "katex";
import { preprocessMathContent } from "../utils/mathPreprocess";

// Extract every $…$ / $$…$$ body from a processed string and assert it parses.
function assertAllRender(processed: string): void {
  const bodies = [
    ...processed.matchAll(/\$\$([\s\S]+?)\$\$/g),
    ...processed.matchAll(/(?<!\$)\$([^$\n]+?)\$(?!\$)/g),
  ].map(m => m[1]);
  for (const body of bodies) {
    expect(() =>
      katex.renderToString(body, { throwOnError: true, strict: "ignore" }),
    ).not.toThrow();
  }
}

describe("repairDegenerateScripts (via preprocessMathContent)", () => {
  it("repairs the OCR fill-in-blank garbage that used to render red", () => {
    // 2001 上海卷理 第2题 — the blank was OCR'd into a bare subscript.
    const raw = "则 $a_{1} + a_{2} + \\dots + a_{10}=_{ {{{ {_}}}}}$.";
    const out = preprocessMathContent(raw);
    expect(out).not.toMatch(/_}/); // no dangling subscript before a closing brace
    assertAllRender(out);
  });

  it("fixes a subscript dangling at end of body", () => {
    assertAllRender(preprocessMathContent("$x_$"));
  });

  it("fixes a superscript with no operand", () => {
    assertAllRender(preprocessMathContent("$a^{}+b^$"));
  });

  it("leaves healthy scripts untouched", () => {
    const out = preprocessMathContent("$x_{i}^{2} + a^{2}_{3}$");
    expect(out).toContain("x_{i}^{2}");
    expect(out).toContain("a^{2}_{3}");
    assertAllRender(out);
  });

  it("does not touch a literal \\_ underscore", () => {
    const out = preprocessMathContent("$\\text{a\\_b}$");
    expect(out).toContain("\\_");
  });

  it("repairs degenerate scripts inside display math too", () => {
    assertAllRender(preprocessMathContent("$$y =_{ {_}}$$"));
  });
});

describe("limits injection + vectors (via preprocessMathContent)", () => {
  it("does NOT corrupt \\limits when injecting (the \\sum\\lim\\limitsits bug)", () => {
    // 题20：\lim 曾匹配到 \limits 前缀 → \sum\limits 被毁成 \sum\lim\limitsits
    const out = preprocessMathContent("$\\sum\\limits_{i=1}^{n} V_i$");
    expect(out).toContain("\\sum\\limits_{i=1}^{n}");
    expect(out).not.toMatch(/\\limitsits/);
    assertAllRender(out);
  });

  it("injects \\limits on a bare \\sum exactly once (idempotent, no corruption)", () => {
    const out = preprocessMathContent("$\\sum_{i=1}^{n} V_i$");
    expect(out).toContain("\\sum\\limits_{i=1}^{n}");
    expect(out).not.toMatch(/\\limitsits/);
    assertAllRender(out);
  });

  it("does not corrupt \\limits inside display math either", () => {
    const out = preprocessMathContent("$$\\sum\\limits_{i=1}^n a_i$$");
    expect(out).not.toMatch(/\\limitsits/);
    assertAllRender(out);
  });

  it("rewrites two-point vectors \\vec{MP} → \\overrightarrow{MP}", () => {
    // 题22：两点向量必须用贯穿两字母的长箭头
    const out = preprocessMathContent("$\\vec{MP}\\cdot\\vec{MN}$");
    expect(out).toContain("\\overrightarrow{MP}");
    expect(out).toContain("\\overrightarrow{MN}");
    expect(out).not.toMatch(/\\vec\{MP\}/);
    assertAllRender(out);
  });

  it("leaves single-letter vectors \\vec{a} as a short hat", () => {
    const out = preprocessMathContent("$\\vec{a}+\\vec{b}$");
    expect(out).toContain("\\vec{a}");
    expect(out).not.toMatch(/overrightarrow/);
    assertAllRender(out);
  });
});

describe("wrapOrphanLatex (via preprocessMathContent)", () => {
  it("wraps a bare \\underline{\\qquad} fill-in blank sitting in prose", () => {
    // 2003 广东卷 第13题 —— 横线漏成字面量的真实案例
    const out = preprocessMathContent("不等式 $\\sqrt{4x-x^2}<x$ 的解集是 \\underline{\\qquad}.");
    // 横线被补进 $...$，不再以字面量出现在文本里
    expect(out).toMatch(/\$\\underline\{\\qquad\}\$/);
    // 题干里原有的公式没有被破坏
    expect(out).toContain("\\sqrt{4x-x^2}");
    assertAllRender(out);
  });

  it("wraps a trailing blank after an inline formula (第14题)", () => {
    const out = preprocessMathContent(
      "$(x^2-\\frac{1}{x})^9$ 的展开式中 $x$ 系数是 \\underline{\\qquad}.",
    );
    expect(out).toMatch(/\$\\underline\{\\qquad\}\$/);
    assertAllRender(out);
  });

  it("handles nested braces like \\underline{\\hspace{2em}}", () => {
    const out = preprocessMathContent("结果是 \\underline{\\hspace{2em}}。");
    expect(out).toMatch(/\$\\underline\{\\hspace\{2em\}\}\$/);
    assertAllRender(out);
  });

  it("wraps bare \\qquad / merges adjacent blank macros", () => {
    const out = preprocessMathContent("答案 \\quad\\quad 。");
    expect(out).toMatch(/\$\\quad\\quad\$/);
    assertAllRender(out);
  });

  it("does NOT double-wrap a blank already inside math", () => {
    const out = preprocessMathContent("则 $a_{10}=\\underline{\\qquad}$.");
    // 仍是单层 $...$，没有出现 $$ 或重复的 $
    expect(out).not.toMatch(/\$\$/);
    expect(out).toContain("\\underline{\\qquad}");
    assertAllRender(out);
  });

  it("leaves a normal $...$ formula untouched", () => {
    const out = preprocessMathContent("设 $f(x)=x^2+1$ 在 $\\mathbb{R}$ 上递增。");
    expect(out).toContain("f(x)=x^2+1");
    assertAllRender(out);
  });

  it("does not invent math from plain Chinese prose (no backslash → no change)", () => {
    const raw = "已知点 A、B、C 三点共线，求证它们的关系。";
    expect(preprocessMathContent(raw)).toBe(raw);
  });

  it("wraps orphaned formula fragments in an option (题10 \\rho=\\cos\\theta)", () => {
    const out = preprocessMathContent(
      "极坐标方程 \\rho = \\cos\\theta 与 \\rho\\cos\\theta = \\dfrac{1}{2} 的图形 A",
    );
    expect(out).toContain("$\\rho = \\cos\\theta$");
    expect(out).toContain("$\\rho\\cos\\theta = \\dfrac{1}{2}$");
    // 中文「与」「的图形 A」保持在公式外
    expect(out).toContain("$ 与 $");
    expect(out).toMatch(/\$ 的图形 A$/);
    assertAllRender(out);
  });

  it("wraps an orphaned complement (∁ unicode) and normalises it", () => {
    const out = preprocessMathContent("则 ∁_I B 是补集");
    expect(out).toContain("$\\complement_I B$"); // ∁ 入数学模式后被归一为 \complement
    assertAllRender(out);
  });

  it("wraps an orphaned \\complement command form", () => {
    const out = preprocessMathContent("结果为 \\complement_{U} A 。");
    expect(out).toMatch(/\$\\complement_\{U\} A\$/);
    assertAllRender(out);
  });

  it("does not touch a literal escaped \\n / markdown bold in prose", () => {
    const raw = "**5.** 设 $f(x)$ 满足条件\\n\\n(1) 求值";
    expect(preprocessMathContent(raw)).toBe(raw);
  });

  it("keeps \\text{中文} together inside a wrapped run (brace-aware CJK)", () => {
    const out = preprocessMathContent("当 \\text{当且仅当} a>0 时成立");
    expect(out).toContain("\\text{当且仅当}");
    assertAllRender(out);
  });
});
