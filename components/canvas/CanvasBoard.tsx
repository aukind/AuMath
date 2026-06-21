'use client';

// 薄包装：以 dynamic(ssr:false) 加载 CanvasEditor，避免 @xyflow/react 在服务端渲染
// （与 KnowledgeCanvas → ForceGraph2DClient 同约定）。
import dynamic from 'next/dynamic';
import { Loader2 } from 'lucide-react';
import type { CanvasDoc } from '@/types/canvas';

const CanvasEditor = dynamic(() => import('./CanvasEditor'), {
  ssr: false,
  loading: () => (
    <div className="flex h-dvh w-full items-center justify-center bg-zinc-50 dark:bg-zinc-950">
      <Loader2 className="animate-spin text-zinc-400" />
    </div>
  ),
});

export default function CanvasBoard({ doc, notes }: { doc: CanvasDoc; notes: { id: string; title: string }[] }) {
  return <CanvasEditor doc={doc} notes={notes} />;
}
