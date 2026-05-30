'use client';

import { useState } from 'react';
import TopicCategories from '@/components/TopicCategories';
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

  const realPapers = papers.filter(p => !p.type || p.type === 'real');
  const mockPapers = papers.filter(p => p.type === 'mock');

  return (
    <div className="flex flex-col gap-3 flex-1 min-h-0">
      {/* ── 3-Tab 切换器（知识点 / 真题 / 模拟题）── */}
      <div className="flex rounded-lg bg-zinc-100 dark:bg-zinc-800/80 p-0.5 gap-0.5">
        <TabButton active={tab === 'topics'} onClick={() => setTab('topics')}>知识点</TabButton>
        <TabButton active={tab === 'real'}   onClick={() => setTab('real')}>真题</TabButton>
        <TabButton active={tab === 'mock'}   onClick={() => setTab('mock')}>模拟题</TabButton>
      </div>

      {/* ── Tab 内容 ── */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {tab === 'topics' && (
          <TopicCategories topics={topics} selectedId={selectedTopicId} isAdmin={isAdmin} />
        )}
        {tab === 'real' && (
          <PaperList papers={realPapers} selectedPaperId={selectedPaperId} />
        )}
        {tab === 'mock' && (
          <MockPapers papers={mockPapers} selectedPaperId={selectedPaperId} />
        )}
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={[
        'flex-1 py-1.5 text-[0.6875rem] font-semibold rounded-md transition-all duration-150',
        active
          ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm'
          : 'text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300',
      ].join(' ')}
    >
      {children}
    </button>
  );
}
