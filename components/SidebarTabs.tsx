'use client';

import { useId, useState } from 'react';
import { motion, LayoutGroup } from 'framer-motion';
import KnowledgeTree from '@/components/KnowledgeTree';
import BackfillKnowledgeButton from '@/components/BackfillKnowledgeButton';
import PaperList from '@/components/PaperList';
import MockPapers from '@/components/MockPapers';
import type { TopicWithChildren, PaperRow } from '@/types/database';

type Tab = 'topics' | 'real' | 'mock';

interface SidebarTabsProps {
  topics: TopicWithChildren[];
  papers: PaperRow[];
  selectedTopicId?: string;
  selectedPaperId?: string;
  isAdmin?: boolean;
}

const SPRING = { type: 'spring', stiffness: 500, damping: 30 } as const;

export default function SidebarTabs({
  topics,
  papers,
  selectedTopicId,
  selectedPaperId,
  isAdmin = false,
}: SidebarTabsProps) {
  const [tab, setTab] = useState<Tab>(() => {
    if (selectedPaperId) {
      const p = papers.find(p => p.id === selectedPaperId);
      return p?.type === 'mock' ? 'mock' : 'real';
    }
    return 'topics';
  });

  const groupId = useId();
  const realPapers = papers.filter(p => !p.type || p.type === 'real');
  const mockPapers = papers.filter(p => p.type === 'mock');

  return (
    <div className="flex flex-col gap-3 flex-1 min-h-0">
      {/* ── 3-Tab 切换器（知识点 / 真题 / 模拟题）—— Magic Tab 弹簧滑块 ── */}
      <LayoutGroup id={groupId}>
        <div className="flex rounded-lg bg-zinc-100 dark:bg-zinc-800/80 p-0.5 gap-0.5">
          <TabButton active={tab === 'topics'} indicatorId={`${groupId}-pill`} onClick={() => setTab('topics')}>知识点</TabButton>
          <TabButton active={tab === 'real'}   indicatorId={`${groupId}-pill`} onClick={() => setTab('real')}>真题</TabButton>
          <TabButton active={tab === 'mock'}   indicatorId={`${groupId}-pill`} onClick={() => setTab('mock')}>模拟题</TabButton>
        </div>
      </LayoutGroup>

      {/* ── Tab 内容：三棵子树常驻挂载，仅 hidden 切显隐 → 切换零重建、目录状态保留 ── */}
      <div className="flex-1 overflow-y-auto min-h-0">
        <div className={tab === 'topics' ? '' : 'hidden'}>
          {isAdmin && <BackfillKnowledgeButton />}
          <KnowledgeTree topics={topics} selectedId={selectedTopicId} isAdmin={isAdmin} />
        </div>
        <div className={tab === 'real' ? '' : 'hidden'}>
          <PaperList papers={realPapers} selectedPaperId={selectedPaperId} />
        </div>
        <div className={tab === 'mock' ? '' : 'hidden'}>
          <MockPapers papers={mockPapers} selectedPaperId={selectedPaperId} />
        </div>
      </div>
    </div>
  );
}

function TabButton({
  active,
  indicatorId,
  onClick,
  children,
}: {
  active: boolean;
  indicatorId: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={[
        'relative flex-1 py-1.5 text-[0.6875rem] font-semibold rounded-md transition-colors duration-150 outline-none',
        'focus-visible:ring-2 focus-visible:ring-indigo-500/50',
        active
          ? 'text-zinc-900 dark:text-zinc-100'
          : 'text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300',
      ].join(' ')}
    >
      {active && (
        <motion.span
          aria-hidden
          layoutId={indicatorId}
          transition={SPRING}
          className="absolute inset-0 -z-10 rounded-md bg-white shadow-sm dark:bg-zinc-700"
        />
      )}
      <span className="relative z-10">{children}</span>
    </button>
  );
}
