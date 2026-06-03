'use client';

// 首页左栏主体（Linear 风「全局导航 + 语境面板」）。
//   · 顶部全局 nav：社区 / 资源大厅 / 每日一题 / 我的题库（accent 竖条高亮）。
//   · 下方 [资源大厅 | 题库] 外层切换：默认资源大厅导航；切「题库」显原知识点/真题/模拟题树。
//     —— 默认 tab 随 mainView 语境：浏览题库时落「题库」，其余落「资源大厅」。

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  MessagesSquare,
  Library as LibraryIcon,
  CalendarDays,
  BookMarked,
  Orbit,
} from 'lucide-react';
import AnimatedTabs from '@/components/ui/AnimatedTabs';
import SidebarTabs from '@/components/SidebarTabs';
import LibrarySidebar from '@/components/library/LibrarySidebar';
import { useSoftNav, isPlainLeftClick } from '@/components/ui/useSoftNav';
import type { MainView } from '@/components/PageLayout';
import type { TopicWithChildren, PaperRow } from '@/types/database';
import type { LibraryItem } from '@/types/library';

type IconType = React.ComponentType<{ size?: number | string; className?: string; strokeWidth?: number }>;

interface Props {
  topics: TopicWithChildren[];
  papers: PaperRow[];
  selectedTopicId?: string;
  selectedPaperId?: string;
  isAdmin?: boolean;
  libraryHighlights: LibraryItem[];
  mainView: MainView;
  onNavigate?: () => void; // 移动端抽屉内点击后关闭
}

export default function HomeSidebar({
  topics,
  papers,
  selectedTopicId,
  selectedPaperId,
  isAdmin = false,
  libraryHighlights,
  mainView,
  onNavigate,
}: Props) {
  const pathname = usePathname();
  const { navigate, pendingHref } = useSoftNav();
  const [tab, setTab] = useState<'lib' | 'bank'>(mainView === 'browse' ? 'bank' : 'lib');

  const NAV: { id: string; label: string; href: string; icon: IconType; active: boolean }[] = [
    { id: 'community', label: '社区', href: '/', icon: MessagesSquare, active: pathname === '/' && mainView === 'forum' },
    { id: 'library', label: '资源大厅', href: '/library', icon: LibraryIcon, active: pathname.startsWith('/library') },
    { id: 'graph', label: '知识星图', href: '/explore', icon: Orbit, active: pathname.startsWith('/explore') },
    { id: 'daily', label: '每日一题', href: '/daily', icon: CalendarDays, active: pathname.startsWith('/daily') },
    { id: 'mybank', label: '我的题库', href: '/?view=mybank', icon: BookMarked, active: pathname === '/' && mainView === 'mybank' },
  ];

  const go = (href: string) => (e: React.MouseEvent) => {
    if (!isPlainLeftClick(e)) return;
    e.preventDefault();
    onNavigate?.();
    navigate(href);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      {/* 全局导航 */}
      <nav aria-label="主导航" className="flex flex-col gap-0.5">
        {NAV.map(({ id, label, href, icon: Icon, active }) => {
          const loading = pendingHref === href;
          return (
            <Link
              key={id}
              href={href}
              onClick={go(href)}
              aria-current={active ? 'page' : undefined}
              className={[
                'group relative flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors',
                active
                  ? 'bg-zinc-100 font-semibold text-zinc-900 dark:bg-zinc-800/70 dark:text-zinc-50'
                  : 'font-medium text-zinc-600 hover:bg-zinc-100/70 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800/40 dark:hover:text-zinc-200',
              ].join(' ')}
            >
              <span
                aria-hidden
                className={[
                  'absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-indigo-500 transition-opacity',
                  active || loading ? 'opacity-100' : 'opacity-0',
                ].join(' ')}
              />
              <Icon size={16} className={active ? 'text-indigo-600 dark:text-indigo-400' : 'text-zinc-400'} strokeWidth={2} />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* 语境面板：资源大厅 / 题库 */}
      <div className="flex min-h-0 flex-1 flex-col gap-3 border-t border-zinc-200/70 pt-4 dark:border-zinc-800">
        <AnimatedTabs
          tabs={[
            { id: 'lib', label: '资源大厅', icon: <LibraryIcon size={13} /> },
            { id: 'bank', label: '题库', icon: <BookMarked size={13} /> },
          ]}
          activeTab={tab}
          onChange={(id) => setTab(id as 'lib' | 'bank')}
          className="w-full justify-stretch [&>button]:flex-1"
        />
        <div className="min-h-0 flex-1 overflow-y-auto">
          {tab === 'lib' ? (
            <LibrarySidebar highlights={libraryHighlights} />
          ) : (
            <SidebarTabs
              topics={topics}
              papers={papers}
              selectedTopicId={selectedTopicId}
              selectedPaperId={selectedPaperId}
              isAdmin={isAdmin}
            />
          )}
        </div>
      </div>
    </div>
  );
}
