'use client';

// 我的知识库（「我的题库 › 知识库」标签页内容）。
//   · 汇集两类 PDF：LaTeX 工作室编译产物（source=studio）+ 资源大厅一键收藏（source=library，存引用）。
//   · 卡片网格（封面复用 CoverArt 占位）；点击 → 懒载 ImmersiveReader（复用资源大厅沉浸式阅读器）。
//   · 移除走 removeKnowledgeDoc（乐观删除）；studio 产物会一并回收 Storage 对象。

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { LayoutGroup, motion } from 'framer-motion';
import { toast } from 'sonner';
import { BookMarked, FileCode, Library, Trash2 } from 'lucide-react';
import CoverArt from '@/components/library/CoverArt';
import { coverLayoutId } from '@/components/library/shared';
import { removeKnowledgeDoc } from '@/app/actions/knowledge';
import type { KnowledgeDoc, LibraryItem } from '@/types/library';

const ImmersiveReader = dynamic(() => import('@/components/library/ImmersiveReader'), { ssr: false });

/** KnowledgeDoc → ImmersiveReader 需要的 LibraryItem 投影（其余字段给安全缺省）。 */
function toLibraryItem(doc: KnowledgeDoc): LibraryItem {
  return {
    id: doc.id,
    title: doc.title,
    description: null,
    pdf_url: doc.pdf_url,
    cover_url: doc.cover_url,
    author_id: '',
    is_official: false,
    status: 'published',
    view_count: 0,
    download_count: 0,
    report_count: 0,
    upvote_count: 0,
    tags: [],
    resource_type: '其他',
    edu_stage: '其他',
    created_at: doc.created_at,
  };
}

const SOURCE_META: Record<KnowledgeDoc['source'], { label: string; Icon: typeof FileCode }> = {
  studio: { label: 'LaTeX 工作室', Icon: FileCode },
  library: { label: '资源大厅', Icon: Library },
  upload: { label: '上传', Icon: BookMarked },
};

export default function MyKnowledgeView({ docs: initialDocs }: { docs: KnowledgeDoc[] }) {
  const [docs, setDocs] = useState<KnowledgeDoc[]>(initialDocs);
  const [active, setActive] = useState<KnowledgeDoc | null>(null);

  const remove = async (doc: KnowledgeDoc) => {
    const prev = docs;
    setDocs((d) => d.filter((x) => x.id !== doc.id)); // 乐观
    const res = await removeKnowledgeDoc(doc.id);
    if (!res.success) {
      setDocs(prev); // 回滚
      toast.error(res.error ?? '移除失败，请重试');
      return;
    }
    toast.success('已从知识库移除');
  };

  if (docs.length === 0) {
    return (
      <div className="mx-auto flex max-w-sm flex-col items-center justify-center gap-3 py-24 text-center">
        <div className="text-4xl">📚</div>
        <h2 className="font-semibold text-zinc-700 dark:text-zinc-300">知识库还是空的</h2>
        <p className="text-sm leading-relaxed text-zinc-400">
          逛<a href="/library" className="text-indigo-500 hover:underline">资源大厅</a>时点书签一键收藏 PDF，
          或在 <a href="/studio" className="text-indigo-500 hover:underline">LaTeX 工作室</a> 编译后「导入知识库」。
        </p>
      </div>
    );
  }

  return (
    <div>
      <p className="mb-4 text-xs text-zinc-400">共 {docs.length} 份资料</p>
      <LayoutGroup>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {docs.map((doc) => {
            const { label, Icon } = SOURCE_META[doc.source];
            return (
              <div
                key={doc.id}
                className="group relative overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md hover:ring-1 hover:ring-indigo-500/20 dark:border-zinc-800 dark:bg-zinc-900"
              >
                <button type="button" onClick={() => setActive(doc)} className="block w-full text-left">
                  <motion.div layoutId={coverLayoutId(doc.id)} className="overflow-hidden">
                    <CoverArt item={{ title: doc.title, cover_url: doc.cover_url, resource_type: '其他' }} className="h-36" />
                  </motion.div>
                  <div className="p-3">
                    <span className="line-clamp-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                      {doc.title}
                    </span>
                    <span className="mt-1.5 flex items-center gap-1 text-[11px] text-zinc-400">
                      <Icon size={12} /> {label}
                    </span>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => remove(doc)}
                  title="从知识库移除"
                  className="absolute right-2 top-2 rounded-md bg-black/40 p-1.5 text-white opacity-0 backdrop-blur-sm transition-opacity hover:bg-rose-500/80 group-hover:opacity-100"
                  aria-label="从知识库移除"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            );
          })}
        </div>

        {active && (
          <ImmersiveReader key={active.id} item={toLibraryItem(active)} onClose={() => setActive(null)} />
        )}
      </LayoutGroup>
    </div>
  );
}
