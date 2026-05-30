'use client';

import { useDroppable } from '@dnd-kit/core';
import { BookOpen } from 'lucide-react';
import type { TopicWithChildren } from '@/types/database';

const CORE_TOPICS = ['数列', '三角', '函数与导数', '解析几何', '立体几何', '概率统计'] as const;

function findIdByName(name: string, topics: TopicWithChildren[]): string | undefined {
  for (const t of topics) {
    if (t.name === name) return t.id;
    const hit = findIdByName(name, t.children);
    if (hit) return hit;
  }
}

interface TopicCategoriesProps {
  topics: TopicWithChildren[];
  selectedId?: string;
  isAdmin?: boolean;
}

export default function TopicCategories({ topics, selectedId, isAdmin = false }: TopicCategoriesProps) {
  return (
    <nav className="space-y-0.5">
      {CORE_TOPICS.map(name => {
        const id = findIdByName(name, topics);
        const isSelected = !!id && id === selectedId;
        const href = id ? (isSelected ? '/' : `/?topic=${id}`) : undefined;

        if (isAdmin && id) {
          return (
            <DroppableTopicItem
              key={name}
              topicId={id}
              name={name}
              href={href ?? '#'}
              isSelected={isSelected}
            />
          );
        }

        return (
          <a
            key={name}
            href={href ?? '#'}
            aria-disabled={!href}
            className={[
              'flex items-center gap-2 rounded-lg py-2 pl-2.5 pr-2 text-sm font-semibold transition-colors',
              isSelected
                ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300'
                : id
                ? 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                : 'text-zinc-400 dark:text-zinc-600 pointer-events-none opacity-50',
            ].join(' ')}
          >
            <BookOpen size={13} className="shrink-0 opacity-50" />
            <span className="truncate">{name}</span>
          </a>
        );
      })}
    </nav>
  );
}

function DroppableTopicItem({
  topicId,
  name,
  href,
  isSelected,
}: {
  topicId: string;
  name: string;
  href: string;
  isSelected: boolean;
}) {
  const { isOver, setNodeRef } = useDroppable({
    id: topicId,
    data: { name },
  });

  return (
    <a
      ref={setNodeRef}
      href={href}
      className={[
        'flex items-center gap-2 rounded-lg py-2 pl-2.5 pr-2 text-sm font-semibold transition-all duration-150',
        isOver
          ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 ring-2 ring-blue-400 dark:ring-blue-600 ring-inset scale-[1.02]'
          : isSelected
          ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300'
          : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800',
      ].join(' ')}
    >
      <BookOpen size={13} className="shrink-0 opacity-50" />
      <span className="truncate">{name}</span>
      {isOver && (
        <span className="ml-auto text-[0.625rem] font-bold text-blue-600 dark:text-blue-400 shrink-0">
          放入
        </span>
      )}
    </a>
  );
}
