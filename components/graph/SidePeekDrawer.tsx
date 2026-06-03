'use client';

// 点击题目节点后从右侧滑出的浮层：按 id 拉取单题详情并复用 QuestionCard 渲染（含 LaTeX/选项/解析）。
// 受控开合——open 由 questionId 是否存在驱动；关闭(遮罩/Esc/右划)回调 onClose。严禁路由跳转。
import { useEffect, useState } from 'react';
import { Drawer } from 'vaul';
import { X } from 'lucide-react';
import QuestionCard from '@/components/QuestionCard';
import { getQuestionForGraph } from '@/app/actions/graph';
import type { QuestionWithTopics } from '@/types/database';

interface Detail {
  question: QuestionWithTopics;
  isLoggedIn: boolean;
  favorited: boolean;
  errored: boolean;
  myRating: number | null;
}

interface Props {
  questionId: string | null;
  onClose: () => void;
}

export default function SidePeekDrawer({ questionId, onClose }: Props) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!questionId) return;
    let cancelled = false;
    setLoading(true);
    setDetail(null);
    getQuestionForGraph(questionId)
      .then(res => {
        if (!cancelled) {
          setDetail(res);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [questionId]);

  return (
    <Drawer.Root
      direction="right"
      open={!!questionId}
      onOpenChange={open => {
        if (!open) onClose();
      }}
    >
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-[90] bg-black/40 backdrop-blur-[2px]" />
        <Drawer.Content
          className={[
            'fixed right-0 top-0 z-[100] h-full w-[480px] max-w-[92vw] flex flex-col',
            'bg-white dark:bg-zinc-950 shadow-2xl outline-none border-l border-zinc-200 dark:border-zinc-800',
          ].join(' ')}
        >
          {/* 顶栏 */}
          <div className="flex items-center justify-between px-4 h-14 border-b border-zinc-200 dark:border-zinc-800 shrink-0">
            <Drawer.Title className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              题目详情
            </Drawer.Title>
            <button
              onClick={onClose}
              aria-label="关闭"
              className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            >
              <X size={16} />
            </button>
          </div>

          {/* 可滚动内容区：data-vaul-no-drag 防止内部滚动触发关闭手势 */}
          <div
            className="flex-1 overflow-y-auto p-4"
            data-vaul-no-drag
            style={{ WebkitOverflowScrolling: 'touch' }}
          >
            {loading && <DrawerSkeleton />}

            {!loading && detail && (
              <QuestionCard
                question={detail.question}
                isLoggedIn={detail.isLoggedIn}
                initialFavorited={detail.favorited}
                initialErrored={detail.errored}
                initialMyRating={detail.myRating}
              />
            )}

            {!loading && !detail && questionId && (
              <p className="px-2 py-10 text-center text-sm text-zinc-400 dark:text-zinc-500">
                题目不存在或已下架。
              </p>
            )}
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

function DrawerSkeleton() {
  return (
    <div className="animate-pulse space-y-3 rounded-2xl border border-zinc-100 dark:border-zinc-800 p-5">
      <div className="h-4 w-1/3 rounded bg-zinc-200 dark:bg-zinc-800" />
      <div className="h-3 w-full rounded bg-zinc-200 dark:bg-zinc-800" />
      <div className="h-3 w-11/12 rounded bg-zinc-200 dark:bg-zinc-800" />
      <div className="h-3 w-5/6 rounded bg-zinc-200 dark:bg-zinc-800" />
      <div className="h-24 w-full rounded bg-zinc-100 dark:bg-zinc-800/60" />
    </div>
  );
}
