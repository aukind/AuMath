import {
  DecoratorNode,
  type EditorConfig,
  type LexicalNode,
  type NodeKey,
  type SerializedLexicalNode,
  type Spread,
  type DOMConversionMap,
  type DOMConversionOutput,
  type DOMExportOutput,
  type LexicalEditor,
} from 'lexical';
import { Suspense, lazy, createElement, type JSX } from 'react';

const MathComponent = lazy(() => import('./MathComponent'));

export type SerializedMathNode = Spread<
  {
    equation: string;
    inline: boolean;
  },
  SerializedLexicalNode
>;

function convertMathElement(domNode: HTMLElement): DOMConversionOutput | null {
  const equation = domNode.getAttribute('data-lexical-math');
  const inline = domNode.getAttribute('data-lexical-math-inline') === 'true';
  if (equation === null) return null;
  return { node: $createMathNode(equation, inline) };
}

export class MathNode extends DecoratorNode<JSX.Element> {
  // Immutable payload — never mutate in place. All updates go through getWritable().
  __equation: string;
  __inline: boolean;

  static getType(): string {
    return 'math';
  }

  static clone(node: MathNode): MathNode {
    return new MathNode(node.__equation, node.__inline, node.__key);
  }

  constructor(equation: string, inline: boolean, key?: NodeKey) {
    super(key);
    this.__equation = equation;
    this.__inline = inline;
  }

  static importJSON(serializedNode: SerializedMathNode): MathNode {
    return $createMathNode(serializedNode.equation, serializedNode.inline);
  }

  exportJSON(): SerializedMathNode {
    return {
      equation: this.getEquation(),
      inline: this.isInline(),
      type: MathNode.getType(),
      version: 1,
    };
  }

  static importDOM(): DOMConversionMap | null {
    return {
      span: (node: HTMLElement) => {
        if (!node.hasAttribute('data-lexical-math')) return null;
        return { conversion: convertMathElement, priority: 2 };
      },
      div: (node: HTMLElement) => {
        if (!node.hasAttribute('data-lexical-math')) return null;
        return { conversion: convertMathElement, priority: 2 };
      },
    };
  }

  exportDOM(_editor: LexicalEditor): DOMExportOutput {
    const element = document.createElement(this.__inline ? 'span' : 'div');
    element.setAttribute('data-lexical-math', this.__equation);
    element.setAttribute('data-lexical-math-inline', String(this.__inline));
    element.textContent = this.__equation;
    return { element };
  }

  createDOM(_config: EditorConfig): HTMLElement {
    const element = document.createElement(this.__inline ? 'span' : 'div');
    element.className = this.__inline
      ? 'math-node math-node--inline inline-block align-middle'
      : 'math-node math-node--block my-2 block';
    return element;
  }

  updateDOM(prevNode: MathNode): boolean {
    // Block↔inline switch requires a new host element; otherwise React reconciles.
    return prevNode.__inline !== this.__inline;
  }

  getEquation(): string {
    return this.getLatest().__equation;
  }

  isInline(): boolean {
    return this.getLatest().__inline;
  }

  setEquation(equation: string): void {
    const writable = this.getWritable();
    writable.__equation = equation;
  }

  isIsolated(): boolean {
    return true;
  }

  isInlineNode(): boolean {
    return this.__inline;
  }

  // SSR defense: <MathComponent /> touches `document`/`window` via KaTeX during
  // render; lazy() defers the import until hydration so Next.js's server build
  // never instantiates the leaf. Suspense provides a noop fallback so the
  // editor frame remains stable before hydration completes.
  decorate(_editor: LexicalEditor, _config: EditorConfig): JSX.Element {
    return createElement(
      Suspense,
      {
        fallback: createElement(
          'span',
          { className: 'math-node__fallback opacity-50' },
          '…',
        ),
      },
      createElement(MathComponent, {
        equation: this.__equation,
        inline: this.__inline,
        nodeKey: this.getKey(),
      }),
    );
  }
}

export function $createMathNode(equation: string, inline: boolean): MathNode {
  return new MathNode(equation, inline);
}

export function $isMathNode(
  node: LexicalNode | null | undefined,
): node is MathNode {
  return node instanceof MathNode;
}
