'use client';

import Link from 'next/link';
import { useDroppable } from '@dnd-kit/core';
import { BookOpen, Loader2 } from 'lucide-react';
import { useSoftNav, isPlainLeftClick } from '@/components/ui/useSoftNav';
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
  const { navigate, isPending, pendingHref } = useSoftNav();

  return (
    <nav className="space-y-0.5">
      {CORE_TOPICS.map(name => {
        const id = findIdByName(name, topics);
        const isSelected = !!id && id === selectedId;
        const href = id ? (isSelected ? '/' : `/?topic=${id}`) : undefined;
        // 乐观激活：点击瞬间即高亮，无需等服务端返回
        const isLoading = !!href && isPending && pendingHref === href;
        const active = isSelected || isLoading;

        const onClick = (e: React.MouseEvent) => {
          if (!href || !isPlainLeftClick(e)) return;
          e.preventDefault();
          navigate(href);
        };

        if (isAdmin && id && href) {
          return (
            <DroppableTopicItem
              key={name}
              topicId={id}
              name={name}
              href={href}
              active={active}
              loading={isLoading}
              onClick={onClick}
            />
          );
        }

        return (
          <Link
            key={name}
            href={href ?? '#'}
            onClick={onClick}
            aria-disabled={!href}
            aria-current={active ? 'page' : undefined}
            className={[
              'flex items-center gap-2 rounded-lg py-2 pl-2.5 pr-2 text-sm font-semibold transition-colors',
              active
                ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300'
                : id
                ? 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                : 'text-zinc-400 dark:text-zinc-600 pointer-events-none opacity-50',
            ].join(' ')}
          >
            {isLoading
              ? <Loader2 size={13} className="shrink-0 animate-spin" />
              : <BookOpen size={13} className="shrink-0 opacity-50" />}
            <span className="truncate">{name}</span>
          </Link>
        );
      })}
    </nav>
  );
}

function DroppableTopicItem({
  topicId,
  name,
  href,
  active,
  loading,
  onClick,
}: {
  topicId: string;
  name: string;
  href: string;
  active: boolean;
  loading: boolean;
  onClick: (e: React.MouseEvent) => void;
}) {
  const { isOver, setNodeRef } = useDroppable({
    id: topicId,
    data: { name },
  });

  return (
    <Link
      ref={setNodeRef}
      href={href}
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={[
        'flex items-center gap-2 rounded-lg py-2 pl-2.5 pr-2 text-sm font-semibold transition-all duration-150',
        isOver
          ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 ring-2 ring-blue-400 dark:ring-blue-600 ring-inset scale-[1.02]'
          : active
          ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300'
          : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800',
      ].join(' ')}
    >
      {loading
        ? <Loader2 size={13} className="shrink-0 animate-spin" />
        : <BookOpen size={13} className="shrink-0 opacity-50" />}
      <span className="truncate">{name}</span>
      {isOver && (
        <span className="ml-auto text-[0.625rem] font-bold text-blue-600 dark:text-blue-400 shrink-0">
          放入
        </span>
      )}
    </Link>
  );
}
