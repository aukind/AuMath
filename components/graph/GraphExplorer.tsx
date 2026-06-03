'use client';

// 知识星图编排层：Server Component 不能持有交互 state，故由此 client 件统管选中态，
// 组合全屏画布 KnowledgeCanvas + 右侧抽屉 SidePeekDrawer，并叠加顶栏与染色图例。
import { useState } from 'react';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import ThemeToggle from '@/components/ThemeToggle';
import KnowledgeCanvas from '@/components/graph/KnowledgeCanvas';
import SidePeekDrawer from '@/components/graph/SidePeekDrawer';
import type { GraphDataPayload } from '@/types/graph';

interface Props {
  data: GraphDataPayload;
}

const LEGEND: { color: string; label: string }[] = [
  { color: '#6366f1', label: '知识点' },
  { color: '#a1a1aa', label: '未做' },
  { color: '#ef4444', label: '错题' },
  { color: '#10b981', label: '已掌握' },
];

export default function GraphExplorer({ data }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const topicCount = data.nodes.filter(n => n.type === 'topic').length;
  const questionCount = data.nodes.length - topicCount;
  const isEmpty = data.nodes.length === 0;

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-zinc-50 dark:bg-zinc-950">
      {isEmpty ? (
        <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
          <p className="text-base font-medium text-zinc-700 dark:text-zinc-200">星图暂为空</p>
          <p className="text-sm text-zinc-400 dark:text-zinc-500">
            题库尚无已发布且关联知识点的题目，录入后将在此汇成星河。
          </p>
        </div>
      ) : (
        <KnowledgeCanvas data={data} onQuestionClick={setSelectedId} />
      )}

      {/* 顶栏：返回 + 标题（左）／主题切换（右），悬浮于画布之上 */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-center justify-between px-4 py-3">
        <div className="pointer-events-auto flex items-center gap-2">
          <Link
            href="/"
            className="flex items-center gap-1 rounded-lg bg-white/80 px-2.5 py-1.5 text-sm font-medium text-zinc-600 shadow-sm backdrop-blur transition-colors hover:text-zinc-900 dark:bg-zinc-900/80 dark:text-zinc-300 dark:hover:text-zinc-50"
          >
            <ChevronLeft size={15} /> 返回首页
          </Link>
          <div className="hidden rounded-lg bg-white/80 px-3 py-1.5 shadow-sm backdrop-blur sm:block dark:bg-zinc-900/80">
            <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">知识星图</span>
            <span className="ml-2 text-xs text-zinc-400 dark:text-zinc-500">
              {topicCount} 知识点 · {questionCount} 题
            </span>
          </div>
        </div>
        <div className="pointer-events-auto rounded-lg bg-white/80 shadow-sm backdrop-blur dark:bg-zinc-900/80">
          <ThemeToggle />
        </div>
      </div>

      {/* 染色图例：左下角 */}
      <div className="pointer-events-none absolute bottom-4 left-4 z-20 flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-lg bg-white/80 px-3.5 py-2 shadow-sm backdrop-blur dark:bg-zinc-900/80">
        {LEGEND.map(({ color, label }) => (
          <span key={label} className="flex items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-300">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
            {label}
          </span>
        ))}
      </div>

      {/* 右侧抽屉：点击题目节点弹出，不路由跳转 */}
      <SidePeekDrawer questionId={selectedId} onClose={() => setSelectedId(null)} />
    </div>
  );
}
