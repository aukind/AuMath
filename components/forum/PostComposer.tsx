'use client';

// 发帖编辑器（独立页面 /forum/new）。
// 复用与回复编辑器相同的 Lexical + Math 基座（components/editor），
// 提供标题 + 标签 + 正文（支持 $LaTeX$）三段，提交后跳转到新帖详情页。

import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary';
import { MarkdownShortcutPlugin } from '@lexical/react/LexicalMarkdownShortcutPlugin';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $getRoot } from 'lexical';
import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { MathPlugin } from '@/components/editor/MathPlugin';
import { MathToolbarButton } from '@/components/editor/MathToolbarButton';
import { createForumPost } from '@/app/actions/forum';
import { buildReplyEditorConfig, FORUM_TRANSFORMERS } from './lexicalConfig';

function ComposerInner() {
  const [editor] = useLexicalComposerContext();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [title, setTitle] = useState('');
  const [tagsRaw, setTagsRaw] = useState('');
  const [bodyEmpty, setBodyEmpty] = useState(true);

  useEffect(
    () =>
      editor.registerUpdateListener(({ editorState }) => {
        editorState.read(() => setBodyEmpty($getRoot().getTextContentSize() === 0));
      }),
    [editor],
  );

  const canSubmit = title.trim().length > 0 && !bodyEmpty && !isPending;

  const handleSubmit = () => {
    const content = JSON.stringify(editor.getEditorState().toJSON());
    const tags = tagsRaw
      .split(/[,，\s]+/)
      .map((t) => t.trim())
      .filter(Boolean);

    startTransition(async () => {
      try {
        const { id } = await createForumPost({ title, content, tags });
        toast.success('发布成功');
        router.push(`/forum/${id}`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : '发帖失败，请重试');
      }
    });
  };

  return (
    <div className="space-y-3">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        maxLength={200}
        placeholder="标题（必填，1–200 字）"
        className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-base font-medium outline-none focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-900"
      />

      <input
        value={tagsRaw}
        onChange={(e) => setTagsRaw(e.target.value)}
        placeholder="标签，用逗号或空格分隔（如：圆锥曲线 每日一题）"
        className="w-full rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-900"
      />

      <div className="rounded-md border border-zinc-300 dark:border-zinc-700">
        <div className="relative px-3 py-2">
          <RichTextPlugin
            contentEditable={
              <ContentEditable
                className="min-h-[10rem] text-sm outline-none [&_.katex]:text-[0.95em]"
                aria-label="正文输入框"
              />
            }
            ErrorBoundary={LexicalErrorBoundary}
          />
          <HistoryPlugin />
          <MathPlugin />
          <MarkdownShortcutPlugin transformers={FORUM_TRANSFORMERS} />
        </div>
        <div className="flex items-center justify-between border-t border-zinc-200 px-3 py-2 dark:border-zinc-800">
          <MathToolbarButton />
          <span className="text-xs text-zinc-400">支持 $行内$ 与 $$块级$$ 公式</span>
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={() => router.push('/forum')}
          className="rounded-md border border-zinc-300 px-4 py-1.5 text-sm text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          取消
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="rounded-md bg-blue-600 px-5 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending ? '发布中…' : '发布主题'}
        </button>
      </div>
    </div>
  );
}

export default function PostComposer() {
  return (
    <LexicalComposer initialConfig={buildReplyEditorConfig('forum-post')}>
      <ComposerInner />
    </LexicalComposer>
  );
}
