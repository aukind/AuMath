'use client';

// 资源大厅·期刊视图。高考研究报告/方法文章：只存元数据 + 外链（规避知网/维普付费墙与版权）。
// 数据来自 journal_articles 表（迁移 025）+ python 元数据爬虫；按 tags[0] 主题做二级筛选。
import { useMemo, useState } from 'react';
import { Newspaper, ExternalLink } from 'lucide-react';

export interface JournalArticle {
  id: string;
  title: string;
  authors: string[] | null;
  journal_name: string | null;
  issue: string | null;
  abstract: string | null;
  source_url: string | null;
  published_on: string | null;
  tags?: string[] | null;
}

// 主题二级筛选维度（与 journals_crawl.py 的 classify_topic 对齐）
const TOPICS = ['解题研究', '专题突破', '一题多解', '方法精进', '模拟背景'] as const;

export default function JournalList({ articles = [] }: { articles?: JournalArticle[] }) {
  const [topic, setTopic] = useState<string | null>(null);

  // 仅展示实际出现过的主题 chip，避免空筛选
  const presentTopics = useMemo(() => {
    const set = new Set<string>();
    for (const a of articles) for (const t of a.tags ?? []) if ((TOPICS as readonly string[]).includes(t)) set.add(t);
    return TOPICS.filter((t) => set.has(t));
  }, [articles]);

  const visible = useMemo(
    () => (topic ? articles.filter((a) => (a.tags ?? []).includes(topic)) : articles),
    [articles, topic],
  );

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <div className="mb-4 flex items-center gap-2">
        <Newspaper size={18} className="text-indigo-500" />
        <h1 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">期刊</h1>
        <span className="text-xs text-zinc-400">高考数学研究报告 / 解题研究（元数据 + 外链）</span>
      </div>

      {/* 主题二级筛选 chips */}
      {presentTopics.length > 0 && (
        <div className="mb-5 flex flex-wrap items-center gap-1.5">
          <Chip label="全部" active={topic === null} onClick={() => setTopic(null)} />
          {presentTopics.map((t) => (
            <Chip key={t} label={t} active={topic === t} onClick={() => setTopic((cur) => (cur === t ? null : t))} />
          ))}
        </div>
      )}

      {visible.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-300 py-16 text-center text-sm text-zinc-400 dark:border-zinc-700">
          {articles.length === 0 ? '期刊研究报告正在接入中，敬请期待。' : '该主题下暂无文章。'}
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map((a) => (
            <article
              key={a.id}
              className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
            >
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{a.title}</h2>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-zinc-400">
                {a.journal_name && <span>{a.journal_name}</span>}
                {a.issue && <span>· {a.issue}</span>}
                {a.authors?.length ? <span>· {a.authors.join('、')}</span> : null}
                {a.published_on && <span>· {a.published_on}</span>}
                {a.tags?.[0] && (
                  <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-[0.7rem] font-medium text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-300">
                    {a.tags[0]}
                  </span>
                )}
              </div>
              {a.abstract && (
                <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
                  {a.abstract}
                </p>
              )}
              {a.source_url && (
                <a
                  href={a.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2.5 inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400"
                >
                  去原站阅读 <ExternalLink size={12} />
                </a>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function Chip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
        active
          ? 'bg-indigo-600 text-white'
          : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700'
      }`}
    >
      {label}
    </button>
  );
}
