import type { TopicWithChildren } from '@/types/database';
import { BookOpen, ChevronRight } from 'lucide-react';

interface TopicTreeProps {
  topics: TopicWithChildren[];
  selectedId?: string;
}

export default function TopicTree({ topics, selectedId }: TopicTreeProps) {
  if (topics.length === 0) {
    return (
      <p className="text-xs text-zinc-400 px-3 py-2">暂无知识点</p>
    );
  }

  return (
    <nav className="space-y-0.5">
      {topics.map(topic => (
        <TopicNode key={topic.id} topic={topic} selectedId={selectedId} depth={0} />
      ))}
    </nav>
  );
}

function TopicNode({
  topic,
  selectedId,
  depth,
}: {
  topic: TopicWithChildren;
  selectedId?: string;
  depth: number;
}) {
  const isSelected = topic.id === selectedId;

  return (
    <div>
      <a
        href={isSelected ? '/' : `/?topic=${topic.id}`}
        className={[
          'flex items-center gap-2 rounded-lg py-1.5 text-sm transition-colors',
          depth === 0 ? 'font-semibold' : 'font-normal text-[0.8125rem]',
          isSelected
            ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300'
            : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800',
        ].join(' ')}
        style={{ paddingLeft: `${0.625 + depth * 0.875}rem`, paddingRight: '0.625rem' }}
      >
        {depth === 0 ? (
          <BookOpen size={13} className="shrink-0 opacity-50" />
        ) : (
          <ChevronRight size={11} className="shrink-0 opacity-35" />
        )}
        <span className="truncate">{topic.name}</span>
      </a>

      {topic.children.length > 0 && (
        <div>
          {topic.children.map(child => (
            <TopicNode key={child.id} topic={child} selectedId={selectedId} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}
