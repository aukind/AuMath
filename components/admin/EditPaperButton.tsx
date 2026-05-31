'use client';

// 管理员：编辑试卷信息（标题 / 年份 / 类型 / 学段）。弹窗表单，提交后刷新。
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { updatePaper } from '@/app/actions/process-paper';
import type { PaperRow } from '@/types/database';

const GRADES: { value: 'high_school_1' | 'high_school_2' | 'high_school_3'; label: string }[] = [
  { value: 'high_school_1', label: '高一' },
  { value: 'high_school_2', label: '高二' },
  { value: 'high_school_3', label: '高三' },
];

export default function EditPaperButton({ paper }: { paper: PaperRow }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const [title, setTitle] = useState(paper.title);
  const [year, setYear] = useState(paper.year ? String(paper.year) : '');
  const [type, setType] = useState<'real' | 'mock'>(paper.type ?? 'real');
  const [grade, setGrade] = useState<'high_school_1' | 'high_school_2' | 'high_school_3'>(
    (paper.grade as 'high_school_1' | 'high_school_2' | 'high_school_3' | null) ?? 'high_school_3',
  );

  function reset() {
    setTitle(paper.title);
    setYear(paper.year ? String(paper.year) : '');
    setType(paper.type ?? 'real');
    setGrade((paper.grade as typeof grade | null) ?? 'high_school_3');
  }

  function handleSave() {
    if (!title.trim()) { toast.error('试卷标题不能为空'); return; }
    startTransition(async () => {
      const r = await updatePaper(paper.id, {
        title: title.trim(),
        year: year ? parseInt(year, 10) : null,
        type,
        grade: type === 'mock' ? grade : null,
      });
      if (r.success) {
        toast.success('试卷信息已更新');
        setOpen(false);
        router.refresh();
      } else {
        toast.error(r.error ?? '更新失败');
      }
    });
  }

  return (
    <>
      <button
        onClick={() => { reset(); setOpen(true); }}
        className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 text-xs text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
      >
        <Pencil size={12} /> 编辑试卷信息
      </button>

      {open && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div className="relative bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl w-full max-w-md p-6 border border-zinc-200 dark:border-zinc-800">
            <button
              onClick={() => setOpen(false)}
              className="absolute top-4 right-4 p-1 rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            >
              <X size={16} />
            </button>
            <h2 className="font-semibold text-zinc-900 dark:text-zinc-100 mb-5">编辑试卷信息</h2>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400">试卷标题</label>
                <input
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  maxLength={200}
                  placeholder="如：2024年新高考一卷"
                  className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/60 px-3 py-2 text-sm text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400">年份</label>
                  <input
                    type="number"
                    value={year}
                    onChange={e => setYear(e.target.value)}
                    min={1977} max={2100}
                    placeholder="2024"
                    className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/60 px-3 py-2 text-sm text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400">类型</label>
                  <select
                    value={type}
                    onChange={e => setType(e.target.value as 'real' | 'mock')}
                    className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/60 px-3 py-2 text-sm text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="real">真题</option>
                    <option value="mock">模拟</option>
                  </select>
                </div>
              </div>

              {type === 'mock' && (
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400">学段（模拟卷）</label>
                  <select
                    value={grade}
                    onChange={e => setGrade(e.target.value as typeof grade)}
                    className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/60 px-3 py-2 text-sm text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {GRADES.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}
                  </select>
                </div>
              )}
            </div>

            <div className="mt-6 flex gap-2.5">
              <button
                onClick={() => setOpen(false)}
                disabled={isPending}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors disabled:opacity-60"
              >
                取消
              </button>
              <button
                onClick={handleSave}
                disabled={isPending}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 active:scale-95 transition-all disabled:opacity-60 flex items-center justify-center gap-1.5"
              >
                {isPending ? <><Loader2 size={14} className="animate-spin" /> 保存中…</> : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
