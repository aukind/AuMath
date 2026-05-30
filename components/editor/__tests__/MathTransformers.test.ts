import {
  $convertFromMarkdownString,
  $convertToMarkdownString,
  TRANSFORMERS,
} from '@lexical/markdown';
import { $getRoot, createEditor, type LexicalEditor } from 'lexical';
import { describe, expect, it } from 'vitest';
import { $isMathNode, MathNode } from '../MathNode';
import { MATH_TRANSFORMERS } from '../MathTransformers';

const ALL = [...MATH_TRANSFORMERS, ...TRANSFORMERS];

function makeEditor(): LexicalEditor {
  return createEditor({
    namespace: 'transformer-test',
    nodes: [MathNode],
    onError: (err) => {
      throw err;
    },
  });
}

// Snapshot every MathNode as a plain object — node refs become unusable
// outside read()/update() blocks, so we extract primitives here.
type MathSnapshot = { equation: string; inline: boolean };
function collectMathNodes(editor: LexicalEditor): MathSnapshot[] {
  const out: MathSnapshot[] = [];
  editor.getEditorState().read(() => {
    const visit = (n: unknown): void => {
      if ($isMathNode(n as never)) {
        const mn = n as MathNode;
        out.push({ equation: mn.getEquation(), inline: mn.isInline() });
      }
      const node = n as { getChildren?: () => unknown[] };
      if (typeof node.getChildren === 'function')
        for (const c of node.getChildren()) visit(c);
    };
    visit($getRoot());
  });
  return out;
}

function importMarkdown(editor: LexicalEditor, md: string): void {
  editor.update(
    () => {
      $convertFromMarkdownString(md, ALL);
    },
    { discrete: true },
  );
}

function exportMarkdown(editor: LexicalEditor): string {
  let out = '';
  editor.getEditorState().read(() => {
    out = $convertToMarkdownString(ALL);
  });
  return out;
}

describe('Markdown import', () => {
  it('parses inline $…$ into an inline MathNode', () => {
    const editor = makeEditor();
    importMarkdown(editor, 'Euler wrote $e^{i\\pi}+1=0$ here.');

    const math = collectMathNodes(editor);
    expect(math).toHaveLength(1);
    expect(math[0].equation).toBe('e^{i\\pi}+1=0');
    expect(math[0].inline).toBe(true);
  });

  it('parses block $$…$$ into a non-inline MathNode', () => {
    const editor = makeEditor();
    importMarkdown(editor, '$$\\int_0^1 x\\,dx$$');

    const math = collectMathNodes(editor);
    expect(math).toHaveLength(1);
    expect(math[0].equation).toBe('\\int_0^1 x\\,dx');
    expect(math[0].inline).toBe(false);
  });

  it('prefers block over inline when both could match', () => {
    // `$$x$$` is a strict superset that the inline pattern could match twice.
    // Registering block first must shadow the inline pattern.
    const editor = makeEditor();
    importMarkdown(editor, '$$x^2$$');

    const math = collectMathNodes(editor);
    expect(math).toHaveLength(1);
    expect(math[0].inline).toBe(false);
    expect(math[0].equation).toBe('x^2');
  });

  it('parses multiple inline equations in a single paragraph', () => {
    const editor = makeEditor();
    importMarkdown(editor, '$a$ and $b$ and $c$');

    const equations = collectMathNodes(editor).map((n) => n.equation);
    expect(equations).toEqual(['a', 'b', 'c']);
  });

  it('ignores a lone unmatched $ (no closing delimiter)', () => {
    const editor = makeEditor();
    importMarkdown(editor, 'Price is $5 USD.');
    expect(collectMathNodes(editor)).toHaveLength(0);
  });
});

describe('Markdown export', () => {
  it('serializes inline MathNode back to $…$', () => {
    const editor = makeEditor();
    importMarkdown(editor, 'See $a^2+b^2=c^2$ here.');
    const md = exportMarkdown(editor);
    expect(md).toContain('$a^2+b^2=c^2$');
  });

  it('round-trips inline math unchanged', () => {
    const editor = makeEditor();
    const original = 'Inline $x_1 + x_2$ test.';
    importMarkdown(editor, original);
    expect(exportMarkdown(editor)).toBe(original);
  });

  it('serializes block MathNode with $$ delimiters', () => {
    const editor = makeEditor();
    importMarkdown(editor, '$$\\sum_{i=1}^n i$$');
    const md = exportMarkdown(editor);
    expect(md).toMatch(/\$\$[\s\S]*\\sum_\{i=1\}\^n i[\s\S]*\$\$/);
  });
});
