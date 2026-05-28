'use client';

import type { SortOrder } from '@/app/actions/questions';

interface SortSelectProps {
  value: SortOrder;
  topicId?: string;
}

export default function SortSelect({ value, topicId }: SortSelectProps) {
  return (
    <form method="get">
      {topicId && <input type="hidden" name="topic" value={topicId} />}
      <select
        name="sort"
        defaultValue={value}
        onChange={e => (e.currentTarget.form as HTMLFormElement).submit()}
        className="text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-1.5 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        <option value="updated_at_desc">最近更新</option>
        <option value="difficulty_asc">难度从低到高</option>
        <option value="difficulty_desc">难度从高到低</option>
      </select>
    </form>
  );
}
