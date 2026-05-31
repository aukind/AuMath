import {
  DecoratorNode,
  type LexicalNode,
  type NodeKey,
  type SerializedLexicalNode,
  type Spread,
} from 'lexical';
import { createElement, type JSX } from 'react';

export type SerializedImageNode = Spread<
  { src: string; altText: string },
  SerializedLexicalNode
>;

/**
 * 论坛配图节点（块级 DecoratorNode）。仅承载 src/alt，渲染一张图片。
 * 配合 ImageTransformers 与 `![alt](src)` Markdown 双向转换，
 * 并由 lib/forum/lexicalSerialize.ts 的 case 'image' 在展示侧产出受信任的图片 Markdown。
 */
export class ImageNode extends DecoratorNode<JSX.Element> {
  __src: string;
  __altText: string;

  static getType(): string {
    return 'image';
  }

  static clone(node: ImageNode): ImageNode {
    return new ImageNode(node.__src, node.__altText, node.__key);
  }

  constructor(src: string, altText: string, key?: NodeKey) {
    super(key);
    this.__src = src;
    this.__altText = altText;
  }

  static importJSON(serialized: SerializedImageNode): ImageNode {
    return $createImageNode(serialized.src, serialized.altText);
  }

  exportJSON(): SerializedImageNode {
    return {
      src: this.__src,
      altText: this.__altText,
      type: ImageNode.getType(),
      version: 1,
    };
  }

  createDOM(): HTMLElement {
    const el = document.createElement('div');
    el.className = 'my-2';
    return el;
  }

  updateDOM(): boolean {
    return false;
  }

  getSrc(): string {
    return this.getLatest().__src;
  }

  getAltText(): string {
    return this.getLatest().__altText;
  }

  isInline(): boolean {
    return false;
  }

  isIsolated(): boolean {
    return true;
  }

  decorate(): JSX.Element {
    // createElement 而非 JSX：避开 @next/next/no-img-element，且本就是编辑器内预览。
    return createElement('img', {
      src: this.__src,
      alt: this.__altText || '配图',
      className:
        'max-h-96 max-w-full rounded-lg border border-zinc-200 dark:border-zinc-700',
    });
  }
}

export function $createImageNode(src: string, altText = ''): ImageNode {
  return new ImageNode(src, altText);
}

export function $isImageNode(node: LexicalNode | null | undefined): node is ImageNode {
  return node instanceof ImageNode;
}
