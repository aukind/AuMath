'use client';

// 新建笔记：弹出标题输入 → createNote → 跳转到详情页（进入编辑态）。
import { useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Plus, X } from 'lucide-react';
import { createNote } from '@/app/actions/notes';

export default function NewNoteButton() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // 命令面板「新建笔记」会带 ?new=1 软导航过来，进场即弹出对话框（渲染期初始化，不用 effect）。
  const [open, setOpen] = useState(searchParams.get('new') === '1');
  const [title, setTitle] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = () => {
    const t = title.trim();
    if (!t) { setError('标题不能为空'); return; }
    setError(null);
    startTransition(async () => {
      const res = await createNote({ title: t });
      if (res.ok) {
        setOpen(false);
        setTitle('');
        router.push(`/notes/${res.id}?edit=1`);
      } else {
        setError(res.error);
      }
    });
  };

  return (
    <>
      <button
        onClick={() => { setOpen(true); setError(null); }}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-cyan-600 px-3.5 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-cyan-700"
      >
        <Plus size={16} /> 新建
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setOpen(false)}>
          <div
            className="w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-5 shadow-xl dark:border-zinc-800 dark:bg-zinc-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold text-zinc-900 dark:text-zinc-50">新建笔记</h2>
              <button onClick={() => setOpen(false)} className="text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200">
                <X size={18} />
              </button>
            </div>
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
              placeholder="笔记标题（[[标题]] 可被双链引用）"
              maxLength={120}
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-cyan-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
            />
            {error && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>}
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setOpen(false)}
                className="rounded-lg px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                取消
              </button>
              <button
                onClick={submit}
                disabled={pending}
                className="rounded-lg bg-cyan-600 px-3.5 py-1.5 text-sm font-medium text-white hover:bg-cyan-700 disabled:opacity-60"
              >
                {pending ? '创建中…' : '创建'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
