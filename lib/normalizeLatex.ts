/**
 * LaTeX canonicalization pipeline — AST-based, never pure regex on nested content.
 *
 * Uses @unified-latex/unified-latex-util-parse for AST construction and
 * @unified-latex/unified-latex-util-print-raw for round-trip serialization.
 * All structural transformations (script order, group flattening, \over rewrite)
 * operate on the AST node tree, not on raw strings.
 */

import { parseMath as parse } from "@unified-latex/unified-latex-util-parse";
import { printRaw } from "@unified-latex/unified-latex-util-print-raw";

// ─── Minimal node types (mirrors @unified-latex/unified-latex-types) ──────────

/** A single node in the unified-latex AST. */
interface UNode {
  type: string;
  /** String content for "string", "whitespace", "comment" nodes;
   *  or macro name for "macro" nodes;
   *  or child-node array for "group", "root", "inlinemath", "displaymath" nodes. */
  content?: string | UNode[];
  /** Parsed arguments for macro nodes (e.g. \frac takes two). */
  args?: UArg[] | null;
  /** Allow extra keys added by unified-latex (position, _renderInfo, …) */
  [k: string]: unknown;
}

interface UArg {
  type: "argument";
  content: UNode[];
  openMark: string;
  closeMark: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * Semantic-free spacing macros in math mode.
 * These are represented as macro nodes whose `content` is the name after `\`.
 */
const SPACING_MACROS = new Set([
  ",",            // \,   thin space
  "!",            // \!   negative thin space
  ";",            // \;   thick space
  ":",            // \:   medium space
  " ",            // \    control space
  "quad",         // \quad
  "qquad",        // \qquad
  "thinspace",
  "negthinspace",
  "thickspace",
  "enspace",
  "medskip",
  "bigskip",
  "smallskip",
]);

/** Synonym commands → their canonical equivalents. */
const SYNONYMS: Record<string, string> = {
  le:          "leq",
  ge:          "geq",
  ne:          "neq",
  to:          "rightarrow",
  gets:        "leftarrow",
  iff:         "Leftrightarrow",
  implies:     "Rightarrow",
  land:        "wedge",
  lor:         "vee",
  lnot:        "neg",
  owns:        "ni",
};

// ─── Math region extractor ────────────────────────────────────────────────────

type Region =
  | { kind: "text";    raw:  string }
  | { kind: "inline";  body: string }
  | { kind: "display"; body: string };

/**
 * Split a mixed text+LaTeX string into typed segments.
 *
 * Uses a character-level scan rather than regex so that nested structures and
 * escaped dollars are handled without catastrophic backtracking risk.
 */
function extractRegions(input: string): Region[] {
  const regions: Region[] = [];
  let i = 0;
  let textStart = 0;

  const pushText = (end: number) => {
    if (end > textStart) regions.push({ kind: "text", raw: input.slice(textStart, end) });
  };

  while (i < input.length) {
    // Skip \$ (escaped dollar)
    if (input[i] === "\\" && i + 1 < input.length && input[i + 1] === "$") {
      i += 2;
      continue;
    }

    // Display math: $$...$$
    if (input[i] === "$" && input[i + 1] === "$") {
      pushText(i);
      i += 2;
      const start = i;
      while (i < input.length && !(input[i] === "$" && input[i + 1] === "$")) {
        if (input[i] === "\\" && i + 1 < input.length) i++; // skip escaped char
        i++;
      }
      regions.push({ kind: "display", body: input.slice(start, i) });
      i += 2;
      textStart = i;
      continue;
    }

    // Inline math: $...$
    if (input[i] === "$") {
      pushText(i);
      i++;
      const start = i;
      while (i < input.length && input[i] !== "$") {
        if (input[i] === "\\" && i + 1 < input.length) i++;
        i++;
      }
      regions.push({ kind: "inline", body: input.slice(start, i) });
      i++;
      textStart = i;
      continue;
    }

    i++;
  }
  pushText(i);
  return regions;
}

// ─── Type guards ──────────────────────────────────────────────────────────────

function isStringNode(n: UNode): n is UNode & { content: string } {
  return n.type === "string" && typeof n.content === "string";
}

function isWhitespaceNode(n: UNode): boolean {
  return n.type === "whitespace";
}

function isMacroNode(n: UNode, name?: string): boolean {
  return n.type === "macro" && (name === undefined || n.content === name);
}

function isGroupNode(n: UNode): n is UNode & { content: UNode[] } {
  return n.type === "group" && Array.isArray(n.content);
}

function childNodes(n: UNode): UNode[] {
  return Array.isArray(n.content) ? (n.content as UNode[]) : [];
}

// ─── Transformation passes (operate on a flat sibling array) ─────────────────

/**
 * Remove semantic-free spacing macros (\, \! \; \: \quad \qquad …).
 */
function stripSpacingMacros(nodes: UNode[]): UNode[] {
  return nodes.filter(n => !(isMacroNode(n) && SPACING_MACROS.has(n.content as string)));
}

/**
 * Collapse consecutive whitespace nodes into a single one.
 *
 * Whitespace nodes are NOT removed entirely — they are required to prevent
 * macro-name extension when serialising back (e.g. `\leq y` must not become
 * `\leqy`). We only deduplicate runs of multiple spaces.
 */
function collapseWhitespace(nodes: UNode[]): UNode[] {
  const out: UNode[] = [];
  let lastWasWS = false;
  for (const n of nodes) {
    if (isWhitespaceNode(n)) {
      if (!lastWasWS) out.push(n);
      lastWasWS = true;
    } else {
      lastWasWS = false;
      out.push(n);
    }
  }
  return out;
}

/**
 * Replace synonym command names with their canonical form.
 * E.g. \le → \leq, \ge → \geq, \to → \rightarrow.
 */
function normalizeCommandSynonyms(nodes: UNode[]): UNode[] {
  return nodes.map(n => {
    if (isMacroNode(n) && typeof n.content === "string" && SYNONYMS[n.content]) {
      return { ...n, content: SYNONYMS[n.content] };
    }
    return n;
  });
}

/**
 * Normalize superscript / subscript order so that subscript always precedes
 * superscript in the node sequence.
 *
 * unified-latex produces two distinct AST representations depending on parse context:
 *
 * STRING FORM (top-level math body):
 *   `x^{a}_{b}` → [string:"x^", group:[a], string:"_", group:[b]]
 *   The `^` is absorbed into the preceding string token by the tokeniser.
 *
 * MACRO FORM (inside known-macro arguments such as \frac{…}{…}):
 *   `x^{a}_{b}` → [string:"x", macro:"^":{a}, macro:"_":{b}]
 *   Here `^` and `_` are bare macro nodes (escapeToken:"") with their own args.
 *
 * Both forms are handled: string form by a 4-token splice, macro form by a
 * simple adjacent-pair swap.
 */
function normalizeScriptOrder(nodes: UNode[]): UNode[] {
  const result = [...nodes];

  // Pass 1 — string form: "x^" {a} "_" {b}  →  "x_" {b} "^" {a}
  let i = 0;
  while (i <= result.length - 4) {
    const n = result[i];
    if (
      isStringNode(n) &&
      (n.content as string).endsWith("^") &&
      result[i + 1].type === "group" &&
      isStringNode(result[i + 2]) &&
      result[i + 2].content === "_" &&
      result[i + 3].type === "group"
    ) {
      const base   = (n.content as string).slice(0, -1);
      const supGrp = result[i + 1];
      const subGrp = result[i + 3];
      result.splice(
        i, 4,
        { type: "string", content: base + "_" } as UNode,
        subGrp,
        { type: "string", content: "^"        } as UNode,
        supGrp,
      );
      // Don't advance i: reordered block could follow another "^"
    } else {
      i++;
    }
  }

  // Pass 2 — macro form: macro:"^":{a} macro:"_":{b}  →  macro:"_":{b} macro:"^":{a}
  // Swap every adjacent (sup, sub) macro pair.
  let j = 0;
  while (j < result.length - 1) {
    if (isMacroNode(result[j], "^") && isMacroNode(result[j + 1], "_")) {
      const sup = result[j];
      result[j]     = result[j + 1];
      result[j + 1] = sup;
      // Advance past the now-correct pair
      j += 2;
    } else {
      j++;
    }
  }

  return result;
}

/**
 * Strip whitespace nodes that immediately follow a `macro:"^"` or `macro:"_"` node.
 *
 * When unified-latex serialises script macros (e.g. `x_{i}^{2} + 1`) and the
 * result is re-parsed, the space between the closing `}` of the script arg and
 * the next token is silently dropped by the parser (TeX ignores spaces after `}`
 * in math mode). This makes round-trips non-idempotent. Stripping that whitespace
 * here ensures the canonical form never contains it in the first place.
 */
function stripWhitespaceAfterScriptMacros(nodes: UNode[]): UNode[] {
  return nodes.filter((n, i) => {
    if (!isWhitespaceNode(n) || i === 0) return true;
    const prev = nodes[i - 1];
    return !(isMacroNode(prev, "^") || isMacroNode(prev, "_"));
  });
}

/**
 * Flatten one level of redundant double-nested groups: {{x}} → {x}.
 *
 * A group whose entire content is a single inner group is replaced by that
 * inner group. Repeated application (via recursion) handles deeper nesting.
 */
function flattenRedundantGroups(nodes: UNode[]): UNode[] {
  return nodes.map(n => {
    if (isGroupNode(n)) {
      const inner = n.content as UNode[];
      if (inner.length === 1 && isGroupNode(inner[0])) {
        return inner[0]; // drop outer wrapper
      }
    }
    return n;
  });
}

/**
 * Convert the TeX primitive `a \over b` to the LaTeX2e form `\frac{a}{b}`.
 *
 * `\over` may appear at the top level of a math expression or inside a group.
 * In both contexts `transformNodes` calls this on the content array, so the
 * transform fires at the right level.
 */
function rewriteOver(nodes: UNode[]): UNode[] {
  const idx = nodes.findIndex(n => isMacroNode(n, "over"));
  if (idx === -1) return nodes;

  const numerNodes = nodes.slice(0, idx).filter(n => !isWhitespaceNode(n));
  const denomNodes = nodes.slice(idx + 1).filter(n => !isWhitespaceNode(n));

  const fracNode: UNode = {
    type:    "macro",
    content: "frac",
    args: [
      { type: "argument", content: numerNodes, openMark: "{", closeMark: "}" },
      { type: "argument", content: denomNodes, openMark: "{", closeMark: "}" },
    ] as UArg[],
  };
  return [fracNode];
}

// ─── Recursive AST transformer ────────────────────────────────────────────────

/**
 * Recursively transform a node: first descend into children, then apply all
 * sibling-level passes on the resulting child array.
 */
function transformNode(node: UNode): UNode {
  switch (node.type) {
    case "root":
    case "inlinemath":
    case "displaymath":
    case "group":
      return { ...node, content: transformNodes(childNodes(node)) };

    case "macro": {
      if (!node.args) return node;
      const transformedArgs = (node.args as UArg[]).map(arg => ({
        ...arg,
        content: transformNodes(arg.content),
      }));
      return { ...node, args: transformedArgs };
    }

    case "environment":
      return { ...node, content: transformNodes(childNodes(node)) };

    default:
      return node;
  }
}

/**
 * Apply the full transformation pipeline to a sibling node array.
 * Children are recursively transformed first (bottom-up), then sibling-level
 * passes run on the resulting array (top-down application).
 */
function transformNodes(nodes: UNode[]): UNode[] {
  // 1. Recurse into each node's children
  const deep = nodes.map(transformNode);

  // 2. Sibling-level passes (order matters)
  let n = deep;
  n = rewriteOver(n);          // \over → \frac  (before whitespace removal)
  n = stripSpacingMacros(n);   // remove \, \! \quad …
  n = normalizeCommandSynonyms(n); // \le → \leq, etc.
  n = collapseWhitespace(n);   // keep one WS between tokens
  n = normalizeScriptOrder(n); // x^{a}_{b} → x_{b}^{a}
  n = stripWhitespaceAfterScriptMacros(n); // drop non-idempotent WS after ^ / _
  n = flattenRedundantGroups(n); // {{x}} → {x}
  return n;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Parse, transform, and re-serialise a raw LaTeX math body string
 * (content between `$` delimiters, without the delimiters themselves).
 *
 * Exported so individual formula strings can be unit-tested directly.
 */
export function canonicalizeMathBody(body: string): string {
  // `parseMath` 在当前 @unified-latex 版本里直接返回**节点数组**（UNode[]），
  // 不再包成 { type: "root", content: [...] }。两种形态都兼容：数组直接进 transformNodes，
  // 根节点则取其 children。早前误把数组当成单节点传给 transformNode → 命中 default 分支
  // → 整个规范化静默失效（间距宏/同义词/上下标排序全没生效）。
  const parsed = parse(body) as unknown;
  const nodes: UNode[] = Array.isArray(parsed)
    ? (parsed as UNode[])
    : childNodes(parsed as UNode);
  const xnodes = transformNodes(nodes);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return printRaw(xnodes as any);
}

/**
 * Normalise all LaTeX formulas in a string that may contain mixed Chinese/English
 * prose and `$…$` / `$$…$$` math regions.
 *
 * Plain text regions are returned **unchanged**; only formula bodies are processed.
 *
 * Transformations applied inside each formula:
 * | Input form           | Canonical form      |
 * |----------------------|---------------------|
 * | `\,` `\!` `\quad`…  | removed             |
 * | `\le` / `\ge` / `\to`| `\leq` / `\geq` / `\rightarrow` |
 * | `x^{a}_{b}`          | `x_{b}^{a}`         |
 * | `{{x}}`              | `{x}`               |
 * | `a \over b`          | `\frac{a}{b}`       |
 * | `\frac 1 2`          | `\frac{1}{2}`       |
 *
 * The function is **idempotent**: `normalize(normalize(x)) === normalize(x)`.
 */
export function normalizeLaTeX(input: string): string {
  return extractRegions(input)
    .map(region => {
      if (region.kind === "text") return region.raw;
      const canonical = canonicalizeMathBody(region.body);
      return region.kind === "display"
        ? `$$${canonical}$$`
        : `$${canonical}$`;
    })
    .join("");
}
