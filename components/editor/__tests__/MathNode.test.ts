import {
  $getRoot,
  $createParagraphNode,
  createEditor,
  type LexicalEditor,
} from 'lexical';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  $createMathNode,
  $isMathNode,
  MathNode,
  type SerializedMathNode,
} from '../MathNode';

// Helper: run an update synchronously and surface any thrown error.
function update(editor: LexicalEditor, fn: () => void) {
  let captured: unknown = null;
  editor.update(
    () => {
      try {
        fn();
      } catch (e) {
        captured = e;
      }
    },
    { discrete: true },
  );
  if (captured) throw captured;
}

function makeEditor(): LexicalEditor {
  return createEditor({
    namespace: 'test',
    nodes: [MathNode],
    onError: (err) => {
      throw err;
    },
  });
}

describe('MathNode construction', () => {
  it('stores equation and inline as the immutable payload', () => {
    const editor = makeEditor();
    update(editor, () => {
      const node = $createMathNode('a^2 + b^2 = c^2', true);
      expect(node.getEquation()).toBe('a^2 + b^2 = c^2');
      expect(node.isInline()).toBe(true);
    });
  });

  it('block math has inline=false', () => {
    const editor = makeEditor();
    update(editor, () => {
      const node = $createMathNode('\\int_0^1 x\\,dx', false);
      expect(node.isInline()).toBe(false);
    });
  });

  it('$isMathNode narrows correctly', () => {
    const editor = makeEditor();
    update(editor, () => {
      const math = $createMathNode('x', true);
      const para = $createParagraphNode();
      expect($isMathNode(math)).toBe(true);
      expect($isMathNode(para)).toBe(false);
      expect($isMathNode(null)).toBe(false);
      expect($isMathNode(undefined)).toBe(false);
    });
  });
});

describe('MathNode.clone', () => {
  it('clone preserves equation, inline, and key', () => {
    const editor = makeEditor();
    update(editor, () => {
      const node = $createMathNode('\\sqrt{2}', true);
      const clone = MathNode.clone(node);
      expect(clone.getEquation()).toBe('\\sqrt{2}');
      expect(clone.isInline()).toBe(true);
      // Identity preservation across writable splits is what makes the node
      // addressable across editor versions.
      expect(clone.getKey()).toBe(node.getKey());
    });
  });
});

describe('MathNode JSON round-trip', () => {
  it('exportJSON emits version + type + payload', () => {
    const editor = makeEditor();
    update(editor, () => {
      const node = $createMathNode('e^{i\\pi} + 1 = 0', true);
      const json: SerializedMathNode = node.exportJSON();
      expect(json.type).toBe('math');
      expect(json.version).toBe(1);
      expect(json.equation).toBe('e^{i\\pi} + 1 = 0');
      expect(json.inline).toBe(true);
    });
  });

  it('importJSON reconstructs an equivalent node', () => {
    const editor = makeEditor();
    update(editor, () => {
      const original = $createMathNode('\\frac{1}{2}', false);
      const rebuilt = MathNode.importJSON(original.exportJSON());
      expect(rebuilt.getEquation()).toBe('\\frac{1}{2}');
      expect(rebuilt.isInline()).toBe(false);
    });
  });

  it('survives an editorState round-trip', () => {
    const editor = makeEditor();
    update(editor, () => {
      const para = $createParagraphNode();
      para.append($createMathNode('x^2', true));
      $getRoot().append(para);
    });

    // Snapshot → serialize → parse → re-apply, mimicking SSR hydration or
    // Supabase persistence.
    const json = JSON.stringify(editor.getEditorState().toJSON());
    const restored = makeEditor();
    const state = restored.parseEditorState(json);
    restored.setEditorState(state);

    let found: { eq: string; inline: boolean } | null = null;
    restored.getEditorState().read(() => {
      const root = $getRoot();
      const mathNodes: MathNode[] = [];
      const walk = (n: unknown) => {
        if ($isMathNode(n as never)) mathNodes.push(n as MathNode);
        const node = n as { getChildren?: () => unknown[] };
        const children =
          typeof node.getChildren === 'function' ? node.getChildren() : [];
        for (const c of children) walk(c);
      };
      walk(root);
      const node = mathNodes[0];
      if (node) found = { eq: node.getEquation(), inline: node.isInline() };
    });

    expect(found).toEqual({ eq: 'x^2', inline: true });
  });
});

describe('MathNode writable semantics', () => {
  let editor: LexicalEditor;
  let key: string;

  beforeEach(() => {
    editor = makeEditor();
    update(editor, () => {
      const node = $createMathNode('a', true);
      $getRoot().append($createParagraphNode().append(node));
      key = node.getKey();
    });
  });

  it('setEquation produces a new latest version, leaving the original frozen', () => {
    update(editor, () => {
      const node = editor._editorState._nodeMap.get(key) as MathNode;
      const equationBefore = node.__equation;
      node.setEquation('b');
      // The original reference is the stale, pre-write version — `__equation`
      // on it MUST NOT have been mutated in place.
      expect(node.__equation).toBe(equationBefore);
      // getLatest() returns the writable clone with the new payload.
      expect(node.getLatest().getEquation()).toBe('b');
    });

    editor.getEditorState().read(() => {
      const latest = editor._editorState._nodeMap.get(key) as MathNode;
      expect(latest.getEquation()).toBe('b');
    });
  });

  it('sequential updates last-write-wins (Lexical default merge policy)', () => {
    update(editor, () => {
      const node = editor._editorState._nodeMap.get(key) as MathNode;
      node.setEquation('first');
    });
    update(editor, () => {
      const node = editor._editorState._nodeMap.get(key) as MathNode;
      node.setEquation('second');
    });

    editor.getEditorState().read(() => {
      const latest = editor._editorState._nodeMap.get(key) as MathNode;
      expect(latest.getEquation()).toBe('second');
    });
  });

  it('two writes inside the same update collapse to the final value', () => {
    update(editor, () => {
      const node = editor._editorState._nodeMap.get(key) as MathNode;
      node.setEquation('mid');
      node.getLatest().setEquation('final');
    });

    editor.getEditorState().read(() => {
      const latest = editor._editorState._nodeMap.get(key) as MathNode;
      expect(latest.getEquation()).toBe('final');
    });
  });
});

describe('MathNode isolation flags', () => {
  it('isIsolated returns true so the decorator never accepts cursor positions', () => {
    const editor = makeEditor();
    update(editor, () => {
      const node = $createMathNode('x', true);
      expect(node.isIsolated()).toBe(true);
    });
  });

  it('isInlineNode mirrors the inline payload', () => {
    const editor = makeEditor();
    update(editor, () => {
      expect($createMathNode('x', true).isInlineNode()).toBe(true);
      expect($createMathNode('x', false).isInlineNode()).toBe(false);
    });
  });
});
