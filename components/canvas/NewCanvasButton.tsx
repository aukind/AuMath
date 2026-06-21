'use client';

// 新建白板：直接创建一张空白板并跳转到编辑器。
import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { createCanvas } from '@/app/actions/canvas';

export default function NewCanvasButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const create = () => {
    startTransition(async () => {
      const res = await createCanvas();
      if (res.ok) router.push(`/canvas/${res.id}`);
      else alert(res.error);
    });
  };

  return (
    <button
      onClick={create}
      disabled={pending}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-rose-500 px-3.5 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-rose-600 disabled:opacity-60"
    >
      <Plus size={16} /> {pending ? '创建中…' : '新建白板'}
    </button>
  );
}
