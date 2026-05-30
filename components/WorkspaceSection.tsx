'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { WorkspaceType, WorkspaceCounts } from '@/types/database';

interface WorkspaceSectionProps {
  counts: WorkspaceCounts;
  isLoggedIn: boolean;
  activeWorkspace?: string;
}

const ITEMS: { key: WorkspaceType; icon: string; label: string }[] = [
  { key: 'favorites', icon: '⭐', label: '我的收藏' },
  { key: 'errors',    icon: '✗',  label: '我的错题' },
  { key: 'history',   icon: '🕒', label: '最近浏览' },
];

export default function WorkspaceSection({ counts, isLoggedIn, activeWorkspace }: WorkspaceSectionProps) {
  const router = useRouter();
  const [hintVisible, setHintVisible] = useState(false);

  // If the server already returned non-zero counts, the user IS authenticated —
  // the prop may be briefly falsy during portal hydration (vaul Drawer.Portal SSR).
  const authenticated = isLoggedIn || Object.values(counts).some(c => c > 0);

  function handleClick(key: WorkspaceType) {
    if (!authenticated) {
      setHintVisible(true);
      setTimeout(() => setHintVisible(false), 3000);
      return;
    }
    router.push(`/?workspace=${key}`);
  }

  const countMap: Record<WorkspaceType, number> = {
    favorites: counts.favorites,
    errors:    counts.errors,
    history:   counts.history,
  };

  return (
    <div>
      <p className="px-1 mb-1 text-[0.6rem] font-semibold text-zinc-400 dark:text-zinc-600 uppercase tracking-wider select-none">
        个人工作区
      </p>
      <div className="space-y-0.5">
        {ITEMS.map(({ key, icon, label }) => {
          const count = countMap[key];
          const isActive = activeWorkspace === key;
          return (
            <button
              key={key}
              onClick={() => handleClick(key)}
              className={[
                'flex items-center gap-2 w-full text-left rounded-lg py-1.5 pl-2.5 pr-2 text-xs transition-colors',
                isActive
                  ? 'bg-violet-50 dark:bg-violet-950/30 text-violet-700 dark:text-violet-300'
                  : 'text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-700 dark:hover:text-zinc-200',
              ].join(' ')}
            >
              <span className="shrink-0 w-3.5 text-center text-[0.7rem] leading-none">{icon}</span>
              <span className="flex-1 truncate">{label}</span>
              {count > 0 && (
                <span className="text-[0.6rem] text-zinc-400 dark:text-zinc-500 tabular-nums shrink-0">
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>
      {hintVisible && !authenticated && (
        <p className="mt-1 px-1 text-[0.625rem] text-zinc-400 dark:text-zinc-500 leading-snug">
          请先登录以使用个性化功能
        </p>
      )}
      <div className="mt-2 mb-1 border-t border-zinc-100 dark:border-zinc-800" />
    </div>
  );
}
