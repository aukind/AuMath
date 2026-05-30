'use client';

import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $insertNodeToNearestRoot, $wrapNodeInElement } from '@lexical/utils';
import {
  $createParagraphNode,
  $getSelection,
  $insertNodes,
  $isRootOrShadowRoot,
  COMMAND_PRIORITY_EDITOR,
  createCommand,
  type LexicalCommand,
} from 'lexical';
import { useEffect } from 'react';
import { $createMathNode, MathNode } from './MathNode';

export type InsertMathPayload = {
  equation: string;
  inline: boolean;
};

export const INSERT_MATH_COMMAND: LexicalCommand<InsertMathPayload> =
  createCommand('INSERT_MATH_COMMAND');

export function MathPlugin(): null {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    if (!editor.hasNodes([MathNode])) {
      // Fail loud: a missing node registration silently drops every math
      // insertion, which is painful to debug from the UI alone.
      throw new Error(
        'MathPlugin: MathNode is not registered on the editor. ' +
          'Add `nodes: [MathNode]` to your LexicalComposer config.',
      );
    }

    return editor.registerCommand<InsertMathPayload>(
      INSERT_MATH_COMMAND,
      ({ equation, inline }) => {
        const mathNode = $createMathNode(equation, inline);

        if (inline) {
          // Inline math splices into the current text run at the caret.
          $insertNodes([mathNode]);
        } else {
          // Block math must live as a sibling of paragraphs, not inside one.
          $insertNodeToNearestRoot(mathNode);
          // If we landed directly under the root, wrap so the caret has a
          // logical paragraph to settle into after insertion.
          const selection = $getSelection();
          if (selection && $isRootOrShadowRoot(mathNode.getParentOrThrow())) {
            $wrapNodeInElement(mathNode, $createParagraphNode).selectEnd();
          }
        }
        return true;
      },
      COMMAND_PRIORITY_EDITOR,
    );
  }, [editor]);

  return null;
}
