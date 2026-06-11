'use client';

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
import type { SessionUser } from '@/types/forum';

const TOOLBAR_BTN =
  'inline-flex h-7 items-center gap-1 rounded border border-zinc-300 bg-white px-2 text-xs font-medium ' +
  'text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 ' +
  'dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800';

// 左侧头像组件
function Avatar({ name, url, role }: { name: string; url?: string; role?: string }) {
  const isSpecial = role === 'admin' || name === 'au' || name === 'aumath';
  return (
    <div className="relative inline-flex items-center justify-center shrink-0 mt-1">
      <div className="relative z-10 flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 text-lg font-bold text-white overflow-hidden shadow-sm ring-1 ring-zinc-200 dark:ring-zinc-800">
        {url ? <img src={url} alt={name} className="h-full w-full object-cover" /> : name.slice(0, 1).toUpperCase()}
      </div>
      {isSpecial && (
        <div className="pointer-events-none absolute -inset-[10px] z-20">
          <svg viewBox="0 0 100 100" className="h-full w-full animate-[spin_10s_linear_infinite]" fill="none" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="au-admin-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#818cf8" />
                <stop offset="50%" stopColor="#c084fc" />
                <stop offset="100%" stopColor="#f472b6" />
              </linearGradient>
            </defs>
            <circle cx="50" cy="50" r="47" stroke="url(#au-admin-grad)" strokeWidth="1.5" strokeDasharray="40 10 15 10" strokeLinecap="round" className="opacity-80" />
            <circle cx="10" cy="50" r="2" fill="#818cf8" />
            <circle cx="90" cy="50" r="2" fill="#f472b6" />
          </svg>
        </div>
      )}
    </div>
  );
}

// 注意这里接收了 initialTag
function ComposerInner({ currentUser, initialTag }: { currentUser?: SessionUser; initialTag?: string }) {
  const [editor] = useLexicalComposerContext();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [title, setTitle] = useState('');
  
  // 核心：如果有初始 tag，默认填入
  const [tagsRaw, setTagsRaw] = useState(initialTag ?? '');
  const [bodyEmpty, setBodyEmpty] = useState(true);

  // 判断是否是提建议模式
  const isFeedback = tagsRaw.includes('产品建议');

  useEffect(() => editor.registerUpdateListener(({ editorState }) => {
    editorState.read(() => setBodyEmpty($getRoot().getTextContentSize() === 0));
  }), [editor]);

  const canSubmit = title.trim().length > 0 && !bodyEmpty && !isPending;

  const handleSubmit = () => {
    const content = JSON.stringify(editor.getEditorState().toJSON());
    const tags = tagsRaw.split(/[,，\s]+/).map((t) => t.trim()).filter(Boolean);
    startTransition(async () => {
      try {
        const res = await createForumPost({ title, content, tags });
        if (!res.ok) {
          toast.error(res.error);
          return;
        }
        toast.success('发布成功');
        router.push(`/forum/${res.data.id}`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : '发帖失败，请重试');
      }
    });
  };

  const insertMarkdown = useCallback((md: string) => {
    editor.update(() => {
      const cur = $convertToMarkdownString(FORUM_TRANSFORMERS).trim();
      $convertFromMarkdownString(cur ? `${cur}\n\n${md}` : md, FORUM_TRANSFORMERS);
    });
  }, [editor]);

  const handleScreenshotInsert = useCallback(async (markdown: string, file: File | null) => {
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
  }, [insertMarkdown]);

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
    <div className="flex gap-4 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/60">
      
      {/* 侧边头像（推特灵魂排版） */}
      <div className="hidden sm:block">
        {currentUser && (
          <Avatar name={currentUser.username} url={currentUser.avatarUrl} role={currentUser.role} />
        )}
      </div>

      {/* 主输入区 */}
      <div className="flex-1 min-w-0 space-y-3">
        {/* 动态 Placeholder */}
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={200}
          placeholder={isFeedback ? "用一句话描述你的建议或遇到的问题..." : "标题（必填，1–200 字）"}
          className="w-full bg-transparent text-lg font-bold text-zinc-900 placeholder:text-zinc-400 outline-none dark:text-zinc-50 dark:placeholder:text-zinc-600"
        />

        <input
          value={tagsRaw}
          onChange={(e) => setTagsRaw(e.target.value)}
          placeholder="添加标签（如：每日一题 圆锥曲线）"
          className="w-full bg-transparent text-sm text-indigo-600 placeholder:text-indigo-400/60 outline-none dark:text-indigo-400 dark:placeholder:text-indigo-600"
        />

        <div className="rounded-xl border border-zinc-200 bg-zinc-50/50 dark:border-zinc-700/80 dark:bg-zinc-950/30">
          <div className="relative px-3 py-2">
            <RichTextPlugin
              contentEditable={<ContentEditable className="min-h-[10rem] text-sm outline-none [&_.katex]:text-[0.95em]" aria-label="正文输入框" />}
              ErrorBoundary={LexicalErrorBoundary}
            />
            <HistoryPlugin />
            <MathPlugin />
            <MarkdownShortcutPlugin transformers={FORUM_TRANSFORMERS} />
          </div>
          <div className="flex flex-wrap items-center gap-2 border-t border-zinc-200 px-3 py-2 dark:border-zinc-700/80">
            <MathToolbarButton className={TOOLBAR_BTN} />
            <ScreenshotToLatexButton onInsert={handleScreenshotInsert} className={TOOLBAR_BTN} />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingImage}
              className={TOOLBAR_BTN}
              title="上传图片"
            >
              {uploadingImage ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImageIcon className="h-3.5 w-3.5" />}
              <span>图库</span>
            </button>
            <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={handleImageFile} />
          </div>
        </div>

        <div className="flex items-center justify-between pt-2">
          <span className="text-[11px] text-zinc-400">支持 Markdown 语法与 $公式$</span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => router.push('/forum')}
              className="rounded-full px-4 py-1.5 text-sm font-medium text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800 transition-colors"
            >
              取消
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="rounded-full bg-indigo-600 px-6 py-1.5 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {isPending ? '发布中…' : '发布'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// 接收 initialTag 并传给内部组件
export default function PostComposer({ currentUser, initialTag }: { currentUser?: SessionUser; initialTag?: string }) {
  return (
    <LexicalComposer initialConfig={buildReplyEditorConfig('forum-post')}>
      <ComposerInner currentUser={currentUser} initialTag={initialTag} />
    </LexicalComposer>
  );
}