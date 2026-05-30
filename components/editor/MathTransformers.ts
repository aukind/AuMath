import type { TextMatchTransformer } from '@lexical/markdown';
import { $createMathNode, $isMathNode, MathNode } from './MathNode';

/**
 * Block math: `$$equation$$` — single-line form. Multi-line block math (where
 * the delimiters live on their own lines) is intentionally not handled here
 * because a TextMatchTransformer only sees one TextNode at a time; pair this
 * with a Markdown preprocessor if you need fenced multi-line input.
 *
 * Registered BEFORE the inline transformer so `$$x$$` is consumed as block
 * rather than getting eaten as two adjacent `$…$` runs.
 */
export const MATH_BLOCK_TRANSFORMER: TextMatchTransformer = {
  dependencies: [MathNode],

  export: (node) => {
    if (!$isMathNode(node) || node.isInline()) return null;
    // Newlines around the equation keep round-trips stable when this lives
    // inside a paragraph during export.
    return `$$\n${node.getEquation()}\n$$`;
  },

  // Greedy enough to handle `$$ a^2 + b^2 = c^2 $$` but blocks the inline
  // regex below from getting a chance at the same span.
  importRegExp: /\$\$([^$\n]+?)\$\$/,
  regExp: /\$\$([^$\n]+?)\$\$$/,

  replace: (textNode, match) => {
    const equation = match[1].trim();
    if (!equation) return;
    const mathNode = $createMathNode(equation, false);
    textNode.replace(mathNode);
  },

  trigger: '$',
  type: 'text-match',
};

/**
 * Inline math: `$equation$`. The regex deliberately rejects `$` inside the
 * payload so adjacent delimiters can't be misread as a single long run.
 *
 * Note: this does NOT recognise escaped delimiters (`\$`); the surrounding
 * Markdown parser must strip those before the transformer sees the text.
 */
export const MATH_INLINE_TRANSFORMER: TextMatchTransformer = {
  dependencies: [MathNode],

  export: (node) => {
    if (!$isMathNode(node) || !node.isInline()) return null;
    return `$${node.getEquation()}$`;
  },

  importRegExp: /\$([^$\n]+?)\$/,
  regExp: /\$([^$\n]+?)\$$/,

  replace: (textNode, match) => {
    const equation = match[1].trim();
    if (!equation) return;
    const mathNode = $createMathNode(equation, true);
    textNode.replace(mathNode);
  },

  trigger: '$',
  type: 'text-match',
};

/**
 * Ready-to-spread transformer bundle. Drop into a Lexical markdown setup like:
 *
 *   import { TRANSFORMERS } from '@lexical/markdown';
 *   import { MATH_TRANSFORMERS } from '@/components/editor/MathTransformers';
 *
 *   const ALL = [...MATH_TRANSFORMERS, ...TRANSFORMERS];
 *
 * Order matters — keep block before inline.
 */
export const MATH_TRANSFORMERS = [
  MATH_BLOCK_TRANSFORMER,
  MATH_INLINE_TRANSFORMER,
];
