import { describe, it, expect } from 'vitest';
import { createEditor } from 'lexical';
import { registerMarkdownShortcuts } from '@lexical/markdown';
import { buildReplyEditorConfig, FORUM_TRANSFORMERS } from '../lexicalConfig';

// 回归测试：编辑器注册的节点必须覆盖所有 markdown 转换器声明的依赖。
// 否则 MarkdownShortcutPlugin 启动时会抛
// "MarkdownShortcuts: missing dependency <x> for transformer"（曾导致发帖/回复页崩溃）。
describe('forum lexical editor config', () => {
  function makeEditor() {
    const cfg = buildReplyEditorConfig('test');
    return createEditor({
      namespace: 'test',
      nodes: cfg.nodes,
      onError: (e) => {
        throw e;
      },
    });
  }

  it('registers markdown shortcuts without missing-node-dependency errors', () => {
    const editor = makeEditor();
    expect(() => {
      const cleanup = registerMarkdownShortcuts(editor, FORUM_TRANSFORMERS);
      cleanup();
    }).not.toThrow();
  });

  it('every transformer dependency is a registered node', () => {
    const editor = makeEditor();
    for (const t of FORUM_TRANSFORMERS) {
      const deps = (t as { dependencies?: unknown[] }).dependencies ?? [];
      // hasNodes 接受节点类（构造函数）数组；缺一个即视为配置不一致。
      expect(editor.hasNodes(deps as never[])).toBe(true);
    }
  });
});
