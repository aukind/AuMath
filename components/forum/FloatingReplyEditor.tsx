'use client';

// 单例浮动回复编辑器
//
// 整个论坛详情页只挂载这一个 Lexical 实例（见 ReplyContext 的设计说明）。
// 它常驻在视口底部，replyTarget 为空时收起、非空时升起，并据目标渲染
// 「回复 @某人 / 回复主贴」的上下文提示，从而实现「移动输入框」而非重建编辑器。
//
// 提交流程对接乐观更新：onSubmit 由父级（ForumThread）提供，内部完成
// 立即上屏 + 失败回滚 + Toast，本组件只负责「拿到序列化 JSON 并交出去」。

import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary';
import { MarkdownShortcutPlugin } from '@lexical/react/LexicalMarkdownShortcutPlugin';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $getRoot } from 'lexical';
import { useEffect, useState, useTransition } from 'react';
import { MathPlugin } from '@/components/editor/MathPlugin';
import { MathToolbarButton } from '@/components/editor/MathToolbarButton';
import { useReply } from './ReplyContext';
import { buildReplyEditorConfig, FORUM_TRANSFORMERS } from './lexicalConfig';
import type { ReplyTarget } from '@/types/forum';

/** 据回复目标生成占位提示。 */
function placeholderFor(target: ReplyTarget): string {
  switch (target.kind) {
    case 'post':
      return '写下你的解答或探讨……（支持 $LaTeX$ 公式）';
    case 'comment':
      return target.replyToUsername
        ? `回复 @${target.replyToUsername}：`
        : '追问这条解答……';
    case 'sub':
      return `回复 @${target.replyToUsername}：`;
  }
}

/**
 * 编辑器内部桥接：访问 Lexical 上下文，处理「目标切换时清空+聚焦」与「提交时取序列化」。
 * 必须作为 LexicalComposer 的子组件才能拿到 context。
 */
function EditorBridge({
  target,
  onSubmit,
  onCancel,
}: {
  target: ReplyTarget;
  onSubmit: (serializedJson: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [editor] = useLexicalComposerContext();
  const [isPending, startTransition] = useTransition();
  const [empty, setEmpty] = useState(true);

  // 目标切换 = 输入框「移动」到了新楼层：清空上一条草稿并聚焦，避免串内容。
  // 用 target 的稳定标识做依赖，确保同一目标内不会反复清空用户正在打的字。
  const targetKey =
    target.kind === 'post'
      ? `post:${target.postId}`
      : `${target.kind}:${target.parentId}:${'replyToUserId' in target ? target.replyToUserId : ''}`;

  useEffect(() => {
    // 清空动作本身会触发下方的 updateListener，empty 会被重新算成 true，
    // 故此处无需再手动 setEmpty，避免在 effect 内同步 setState。
    editor.update(() => $getRoot().clear());
    // 让升起动画稳定后再聚焦
    const t = setTimeout(() => editor.focus(), 50);
    return () => clearTimeout(t);
  }, [editor, targetKey]);

  // 追踪是否为空，禁用空提交
  useEffect(
    () =>
      editor.registerUpdateListener(({ editorState }) => {
        editorState.read(() => setEmpty($getRoot().getTextContentSize() === 0));
      }),
    [editor],
  );

  const handleSubmit = () => {
    const serialized = JSON.stringify(editor.getEditorState().toJSON());
    startTransition(async () => {
      // onSubmit 负责乐观更新 + 回滚；失败时由其抛出 Toast，这里保持编辑器内容不清空，
      // 方便用户修改后重试。
      await onSubmit(serialized);
    });
  };

  return (
    <div className="rounded-lg border border-zinc-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
      <div className="flex items-center justify-between border-b border-zinc-100 px-3 py-1.5 dark:border-zinc-800">
        <span className="text-xs font-medium text-zinc-500">{placeholderFor(target)}</span>
        <button
          type="button"
          onClick={onCancel}
          className="text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
        >
          收起 ✕
        </button>
      </div>

      <div className="relative px-3 py-2">
        <RichTextPlugin
          contentEditable={
            <ContentEditable
              className="max-h-40 min-h-[3rem] overflow-y-auto text-sm outline-none [&_.katex]:text-[0.95em]"
              aria-label="回复输入框"
            />
          }
          ErrorBoundary={LexicalErrorBoundary}
        />
        <HistoryPlugin />
        <MathPlugin />
        <MarkdownShortcutPlugin transformers={FORUM_TRANSFORMERS} />
      </div>

      <div className="flex items-center justify-between border-t border-zinc-100 px-3 py-2 dark:border-zinc-800">
        <MathToolbarButton />
        <button
          type="button"
          onClick={handleSubmit}
          disabled={empty || isPending}
          className="rounded-md bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending ? '发布中…' : '发布'}
        </button>
      </div>
    </div>
  );
}

interface FloatingReplyEditorProps {
  /**
   * 提交回调。接收序列化后的 Lexical JSON，由父级完成乐观更新；
   * 成功后应自行 closeReply。抛错表示发布失败（编辑器内容保留）。
   */
  onSubmit: (target: ReplyTarget, serializedJson: string) => Promise<void>;
}

export default function FloatingReplyEditor({ onSubmit }: FloatingReplyEditorProps) {
  const { replyTarget, closeReply } = useReply();

  // 收起时彻底不渲染编辑器，连那唯一的实例也卸载，零常驻开销。
  // 升起时挂载——全页同一时刻至多一个实例，满足「单例」约束。
  if (!replyTarget) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-3 pb-3">
      <div className="pointer-events-auto w-full max-w-2xl">
        {/*
          key=replyTarget 标识：当回复目标在「楼」与「楼中楼」之间切换时强制重建一次组合器，
          确保 history 栈、草稿不会跨目标污染。同一目标内（key 不变）则保持单一实例。
        */}
        <LexicalComposer
          key={replyTarget.kind === 'post' ? 'post' : `${replyTarget.kind}:${replyTarget.parentId}`}
          initialConfig={buildReplyEditorConfig('forum-reply')}
        >
          <EditorBridge
            target={replyTarget}
            onSubmit={(json) => onSubmit(replyTarget, json)}
            onCancel={closeReply}
          />
        </LexicalComposer>
      </div>
    </div>
  );
}
