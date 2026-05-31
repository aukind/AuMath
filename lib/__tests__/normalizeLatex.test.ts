import { describe, it, expect } from "vitest";
import { normalizeLaTeX, canonicalizeMathBody } from "../normalizeLatex";

// ─── Helper ───────────────────────────────────────────────────────────────────
// Shorthand: compare only the formula body (strips outer $…$ from both sides)
function math(input: string): string {
  return canonicalizeMathBody(input);
}

// ─── 1. Spacing macro stripping ───────────────────────────────────────────────

describe("spacing macro stripping", () => {
  it("removes \\, between operands", () => {
    expect(math("x \\, + \\, y")).toBe("x + y");
  });

  it("removes \\! (negative thin space)", () => {
    expect(math("x \\! y")).toBe("x y");
  });

  it("removes \\quad and \\qquad", () => {
    expect(math("a \\quad b \\qquad c")).toBe("a b c");
  });

  it("removes \\; and \\:", () => {
    expect(math("a \\; b \\: c")).toBe("a b c");
  });

  it("strips spacing macros inside \\frac arguments", () => {
    // Unbraced script args inside a macro argument are normalised to braced
    // form by unified-latex's parser: d^2 → d^{2}.
    expect(math("\\frac{\\,d^2y\\,}{\\,dx^2\\,}")).toBe("\\frac{d^{2}y}{dx^{2}}");
  });
});

// ─── 2. Command synonyms ──────────────────────────────────────────────────────

describe("command synonym normalisation", () => {
  it("\\le → \\leq", () => {
    expect(math("x \\le y")).toBe("x \\leq y");
  });

  it("\\ge → \\geq", () => {
    expect(math("x \\ge y")).toBe("x \\geq y");
  });

  it("\\ne → \\neq", () => {
    expect(math("x \\ne y")).toBe("x \\neq y");
  });

  it("\\to → \\rightarrow", () => {
    expect(math("x \\to y")).toBe("x \\rightarrow y");
  });

  it("\\land → \\wedge, \\lor → \\vee", () => {
    expect(math("A \\land B \\lor C")).toBe("A \\wedge B \\vee C");
  });
});

// ─── 3. Script order normalisation ────────────────────────────────────────────

describe("script order normalisation (brace form)", () => {
  it("swaps x^{a}_{b} → x_{b}^{a}", () => {
    expect(math("x^{2}_{i}")).toBe("x_{i}^{2}");
  });

  it("handles multi-char base: abc^{n}_{k}", () => {
    // In the AST "abc^" is one string token; base becomes "abc_"
    expect(math("abc^{n}_{k}")).toBe("abc_{k}^{n}");
  });

  it("leaves already-correct order unchanged: x_{i}^{2}", () => {
    expect(math("x_{i}^{2}")).toBe("x_{i}^{2}");
  });

  it("does not disturb superscript-only: x^{2}", () => {
    expect(math("x^{2}")).toBe("x^{2}");
  });

  it("does not disturb subscript-only: x_{i}", () => {
    expect(math("x_{i}")).toBe("x_{i}");
  });

  it("reorders inside \\frac numerator", () => {
    // x^{2}_{1} inside frac arg
    expect(math("\\frac{x^{2}_{1}}{a^{2}}")).toBe("\\frac{x_{1}^{2}}{a^{2}}");
  });
});

// ─── 4. \\over rewrite ────────────────────────────────────────────────────────

describe("\\over → \\frac rewrite", () => {
  it("converts top-level 1 \\over 2", () => {
    expect(math("1 \\over 2")).toBe("\\frac{1}{2}");
  });

  it("converts multi-token numerator and denominator", () => {
    expect(math("a+b \\over c+d")).toBe("\\frac{a+b}{c+d}");
  });

  it("is idempotent: \\frac{1}{2} is unchanged", () => {
    expect(math("\\frac{1}{2}")).toBe("\\frac{1}{2}");
  });
});

// ─── 5. \\frac argument normalisation ─────────────────────────────────────────

describe("\\frac argument normalisation", () => {
  it("\\frac 1 2 → \\frac{1}{2} (handled by parser)", () => {
    expect(math("\\frac 1 2")).toBe("\\frac{1}{2}");
  });

  it("\\frac{a}{b} is already canonical", () => {
    expect(math("\\frac{a}{b}")).toBe("\\frac{a}{b}");
  });
});

// ─── 6. Redundant group flattening ────────────────────────────────────────────

describe("redundant nested group flattening", () => {
  it("{{x}} → {x}", () => {
    expect(math("{{x}}")).toBe("{x}");
  });

  it("{{{x}}} → {x}", () => {
    expect(math("{{{x}}}")).toBe("{x}");
  });

  it("{x} (single level) is unchanged", () => {
    expect(math("{x}")).toBe("{x}");
  });
});

// ─── 7. Required scenario: nested-fraction derivative equation ─────────────────

describe("scenario: derivative with nested fractions", () => {
  it("strips spacing macros and normalises scripts inside nested fracs", () => {
    // Multi-level fraction: d/dx · (x²ᵢ + 1)/(x − 1)
    // Uses \, for cosmetic spacing in the source, and ^{2}_{i} subscript order
    const input  = "\\frac{d}{dx}\\frac{\\,x^{2}_{i}\\, + 1}{x - 1}";
    const output = math(input);

    // \, stripped, script reordered.
    // Note: TeX drops spaces after closing } in math mode, so the canonical form
    // has no space between the script close and the following operator.
    expect(output).toBe("\\frac{d}{dx}\\frac{x_{i}^{2}+ 1}{x - 1}");
  });

  it("is idempotent on the result", () => {
    const once  = math("\\frac{d}{dx}\\frac{\\,x^{2}_{i}\\, + 1}{x - 1}");
    const twice = math(once);
    expect(twice).toBe(once);
  });
});

// ─── 8. Required scenario: conic-section with inverted scripts ────────────────

describe("scenario: conic section equation with script reordering", () => {
  it("normalises x^{2}_{1}/a^{2} + y^{2}_{1}/b^{2} = 1", () => {
    // Standard ellipse/hyperbola: x₁²/a² + y₁²/b² = 1
    const input  = "\\frac{x^{2}_{1}}{a^{2}} + \\frac{y^{2}_{1}}{b^{2}} = 1";
    const output = math(input);
    // 注：parseMath 会丢弃花括号参数 `}` 之后的空格（TeX 数学模式本就忽略），故 `+`/`=`
    // 前的空格不在规范形里——纯属外观，KaTeX 渲染完全一致。脚标重排 x^{2}_{1}→x_{1}^{2} 正确。
    expect(output).toBe("\\frac{x_{1}^{2}}{a^{2}}+ \\frac{y_{1}^{2}}{b^{2}}= 1");
  });

  it("is idempotent", () => {
    const once  = math("\\frac{x^{2}_{1}}{a^{2}} + \\frac{y^{2}_{1}}{b^{2}} = 1");
    const twice = math(once);
    expect(twice).toBe(once);
  });
});

// ─── 9. Required scenario: mixed Chinese text + formulas ─────────────────────

describe("scenario: mixed Chinese prose and LaTeX formulas", () => {
  it("normalises inline formulas while preserving surrounding text", () => {
    const input    = "已知 $x \\le y$ 且 $y \\ge x$，则 $x \\ne y$。";
    const expected = "已知 $x \\leq y$ 且 $y \\geq x$，则 $x \\neq y$。";
    expect(normalizeLaTeX(input)).toBe(expected);
  });

  it("handles mixed display and inline math in the same string", () => {
    const input = "设椭圆方程为 $$\\frac{x^{2}_{1}}{a^{2}} + \\frac{y^{2}_{1}}{b^{2}} = 1$$ " +
                  "其中 $a \\ge b > 0$，离心率 $e = \\frac{c}{a}$，且 $c^2 = a^2 - b^2$。";
    const result = normalizeLaTeX(input);

    // Chinese text preserved verbatim
    expect(result).toContain("设椭圆方程为");
    expect(result).toContain("其中");
    expect(result).toContain("离心率");
    // Scripts normalised inside display math
    expect(result).toContain("x_{1}^{2}");
    expect(result).toContain("y_{1}^{2}");
    // Synonym normalised
    expect(result).toContain("\\geq");
    expect(result).not.toContain("\\ge ");
  });

  it("preserves plain text that contains no math", () => {
    const plain = "圆锥曲线：椭圆、双曲线、抛物线的统称。";
    expect(normalizeLaTeX(plain)).toBe(plain);
  });

  it("handles escaped \\$ inside text gracefully", () => {
    // \$ should not be treated as a math delimiter
    const input = "价格为 \\$50 和 \\$100";
    expect(normalizeLaTeX(input)).toBe(input);
  });
});

// ─── 10. Idempotency (global) ─────────────────────────────────────────────────

describe("idempotency", () => {
  const cases = [
    "x \\le y",
    "\\frac{1}{2}",
    "1 \\over 2",
    "x^{2}_{i}",
    "{{x+y}}",
    "x \\, + \\quad y",
  ];

  for (const c of cases) {
    it(`normalize(normalize("${c}")) === normalize("${c}")`, () => {
      const once  = math(c);
      const twice = math(once);
      expect(twice).toBe(once);
    });
  }
});
