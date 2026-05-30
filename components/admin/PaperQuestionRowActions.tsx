'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { deleteQuestion } from '@/app/actions/questions';

interface Props {
  questionId:     string;
  questionNumber: number;
}

export default function PaperQuestionRowActions({ questionId, questionNumber }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleDelete() {
    if (!confirm(`确定删除第 ${questionNumber} 题？此操作不可撤销。`)) return;
    startTransition(async () => {
      const r = await deleteQuestion(questionId);
      if (r.success) {
        toast.success(`已删除第 ${questionNumber} 题`);
        router.refresh();
      } else {
        toast.error(`删除失败：${r.error}`);
      }
    });
  }

  return (
    <button
      onClick={handleDelete}
      disabled={isPending}
      className="flex items-center gap-1 px-2.5 py-1 rounded-md border border-zinc-200 dark:border-zinc-700 text-xs text-zinc-500 hover:text-red-600 hover:border-red-300 dark:hover:text-red-400 dark:hover:border-red-700 transition-colors disabled:opacity-60"
    >
      {isPending ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />}
      删除
    </button>
  );
}
