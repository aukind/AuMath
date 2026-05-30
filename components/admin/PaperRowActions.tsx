'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { deletePaperWithQuestions } from '@/app/actions/process-paper';

interface Props {
  paperId: string;
  title:   string;
}

export default function PaperRowActions({ paperId, title }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleDelete() {
    startTransition(async () => {
      const r = await deletePaperWithQuestions(paperId);
      if (r.success) {
        toast.success(`已删除试卷《${title}》及 ${r.deletedQuestions ?? 0} 道题`);
        setOpen(false);
        router.refresh();
      } else {
        toast.error(`删除失败：${r.error}`);
      }
    });
  }

  return (
    <>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}
        title="删除整套试卷（含所有题目）"
        className="ml-1 flex items-center gap-1 px-2.5 py-1 rounded-md border border-zinc-200 dark:border-zinc-700 text-xs text-zinc-500 hover:text-red-600 hover:border-red-300 dark:hover:text-red-400 dark:hover:border-red-700 transition-colors opacity-0 group-hover:opacity-100"
      >
        <Trash2 size={12} /> 删除
      </button>

      {open && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4" onClick={(e) => e.stopPropagation()}>
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div className="relative bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl w-full max-w-sm p-6 border border-zinc-200 dark:border-zinc-800">
            <button
              onClick={() => setOpen(false)}
              className="absolute top-4 right-4 p-1 rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            >
              <X size={16} />
            </button>
            <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-red-50 dark:bg-red-950/40 mb-4 mx-auto">
              <Trash2 size={22} className="text-red-600 dark:text-red-400" />
            </div>
            <h2 className="text-center font-semibold text-zinc-900 dark:text-zinc-100 mb-1">
              删除整套试卷
            </h2>
            <p className="text-center text-sm text-zinc-500 dark:text-zinc-400 mb-6 leading-relaxed">
              将永久删除《{title}》及其下所有题目。<br />
              此操作不可撤销。
            </p>
            <div className="flex gap-2.5">
              <button
                onClick={() => setOpen(false)}
                disabled={isPending}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors disabled:opacity-60"
              >
                取消
              </button>
              <button
                onClick={handleDelete}
                disabled={isPending}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-red-600 text-white hover:bg-red-700 active:scale-95 transition-all disabled:opacity-60 flex items-center justify-center gap-1.5"
              >
                {isPending ? <><Loader2 size={14} className="animate-spin" /> 删除中…</> : '确认删除'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
