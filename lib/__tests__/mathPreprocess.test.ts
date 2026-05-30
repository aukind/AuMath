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
