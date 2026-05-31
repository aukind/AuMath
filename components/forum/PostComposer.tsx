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
import { $convertFromMarkdownString, $convertToMarkdownString } from '@lexical/markdown';
import { $getRoot } from 'lexical';
import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ImageIcon, Loader2 } from 'lucide-react';
import { MathPlugin } from '@/components/editor/MathPlugin';
import { MathToolbarButton } from '@/components/editor/MathToolbarButton';
import { ScreenshotToLatexButton } from '@/components/admin/ScreenshotToLatexButton';
import { createForumPost } from '@/app/actions/forum';
import { uploadForumImage } from '@/app/actions/forum-image';
import { buildReplyEditorConfig, FORUM_TRANSFORMERS } from './lexicalConfig';

// 工具栏按钮统一样式（暗色极客风，与 Σ公式 一致）
const TOOLBAR_BTN =
  'inline-flex h-7 items-center gap-1 rounded border border-zinc-300 bg-white px-2 text-xs font-medium ' +
  'text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 ' +
  'dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800';

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

  // 把一段 Markdown 追加进编辑器：整体 round-trip（含已嵌图片/公式），光标落到末尾。
  const insertMarkdown = useCallback(
    (md: string) => {
      editor.update(() => {
        const cur = $convertToMarkdownString(FORUM_TRANSFORMERS).trim();
        $convertFromMarkdownString(cur ? `${cur}\n\n${md}` : md, FORUM_TRANSFORMERS);
      });
    },
    [editor],
  );

  // 截图识别插入：若有原图，先上传并把原图嵌在转写文字之上（保留几何图）。
  const handleScreenshotInsert = useCallback(
    async (markdown: string, file: File | null) => {
      if (file) {
        const t = toast.loading('上传原图中…');
        try {
          const fd = new FormData();
          fd.append('file', file);
          const { url } = await uploadForumImage(fd);
          insertMarkdown(`![题目原图](${url})\n\n${markdown}`);
          toast.success('已插入原图与识别文字', { id: t });
          return;
        } catch (e) {
          toast.error(e instanceof Error ? e.message : '原图上传失败，已仅插入文字', { id: t });
        }
      }
      insertMarkdown(markdown);
    },
    [insertMarkdown],
  );

  // 纯上传图片（补几何图 / 手写）
  const [uploadingImage, setUploadingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploadingImage(true);
    const t = toast.loading('上传图片中…');
    try {
      const fd = new FormData();
      fd.append('file', file);
      const { url } = await uploadForumImage(fd);
      insertMarkdown(`![图片](${url})`);
      toast.success('已插入图片', { id: t });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '图片上传失败', { id: t });
    } finally {
      setUploadingImage(false);
    }
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
        <div className="flex flex-wrap items-center gap-2 border-t border-zinc-200 px-3 py-2 dark:border-zinc-800">
          <MathToolbarButton className={TOOLBAR_BTN} />
          <ScreenshotToLatexButton onInsert={handleScreenshotInsert} className={TOOLBAR_BTN} />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadingImage}
            className={TOOLBAR_BTN}
            title="上传图片（直接嵌入帖子，可保留几何图/手写）"
          >
            {uploadingImage ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImageIcon className="h-3.5 w-3.5" />}
            <span>上传图片</span>
          </button>
          <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={handleImageFile} />
          <span className="ml-auto text-xs text-zinc-400">截图自动转公式 · 或直接传图 · 支持 $公式$</span>
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
