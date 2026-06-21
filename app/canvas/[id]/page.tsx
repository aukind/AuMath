// 白板编辑器页（RSC 壳）。取白板 + 我的笔记（供笔记卡选择器），交客户端 CanvasBoard 渲染。
import { notFound, redirect } from 'next/navigation';
import CanvasBoard from '@/components/canvas/CanvasBoard';
import { getCanvas } from '@/app/actions/canvas';
import { getCommandIndex } from '@/app/actions/command-palette';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function CanvasEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?redirectTo=/canvas/${id}`);

  const [doc, index] = await Promise.all([getCanvas(id), getCommandIndex()]);
  if (!doc) notFound();

  return (
    <CanvasBoard
      doc={doc}
      notes={index.notes.map((n) => ({ id: n.id, title: n.title }))}
      theorems={index.theorems.map((t) => ({ id: t.id, title: t.name }))}
    />
  );
}
