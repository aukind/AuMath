'use client';

// 知识点 Inspector：Obsidian 式双向链接面板（点击恒星节点从右侧滑入）。
// 结构：面包屑层级 → 简介/统计 → 双向链接（手动双链+共现推导）→ 反向链接（子知识点+关联题目）。
// 管理员可在此增删手动双链；普通用户只读。数据走 getTopicInspector，不携带 LaTeX 正文。
import { useEffect, useRef, useState, useTransition } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Link2, Sparkles, ChevronRight, CornerDownRight,
  Crosshair, Plus, Trash2, CircleDot,
} from 'lucide-react';
import { getTopicInspector, addTopicLink, removeTopicLink } from '@/app/actions/graph';
import type { TopicInspectorData, NodeStatus } from '@/types/graph';

interface Props {
  topicId: string | null;
  onClose: () => void;
  /** 点击关联知识点 → 切换 Inspector 到该知识点并在画布上聚焦 */
  onNavigate: (topicId: string) => void;
  /** 「局部图谱」按钮 → 进入聚焦模式 */
  onFocusLocal: (topicId: string) => void;
  /** 点击关联题目 → 打开题目抽屉 */
  onQuestionClick: (questionId: string) => void;
  /** 双链增删成功后通知编排层刷新全图数据 */
  onLinksChanged: () => void;
  /** 全部知识点（admin 添加双链的候选） */
  allTopics: { id: string; name: string }[];
}

const STATUS_DOT: Record<NodeStatus, string> = {
  unattempted: 'bg-zinc-400 dark:bg-zinc-600',
  error_prone: 'bg-red-500 dark:bg-red-400',
  mastered:    'bg-emerald-500 dark:bg-emerald-400',
};

export default function TopicInspector({
  topicId, onClose, onNavigate, onFocusLocal, onQuestionClick, onLinksChanged, allTopics,
}: Props) {
  const [data, setData] = useState<TopicInspectorData | null>(null);
  const [loading, setLoading] = useState(false);
  const [linkQuery, setLinkQuery] = useState('');
  const [linkError, setLinkError] = useState<string | null>(null);
  const [mutating, startMutation] = useTransition();
  const reqSeq = useRef(0);

  // 渲染期调整（仓库约定：set-state-in-effect 会卡 build）：topicId 变更时同步重置面板态。
  const [prevTopicId, setPrevTopicId] = useState<string | null>(null);
  if (topicId !== prevTopicId) {
    setPrevTopicId(topicId);
    if (topicId) {
      setLoading(true);
      setLinkQuery('');
      setLinkError(null);
    }
  }

  useEffect(() => {
    if (!topicId) return;
    const seq = ++reqSeq.current;
    getTopicInspector(topicId)
      .then(res => {
        if (reqSeq.current === seq) {
          setData(res);
          setLoading(false);
        }
      })
      .catch(() => {
        if (reqSeq.current === seq) setLoading(false);
      });
  }, [topicId]);

  const refetch = () => {
    if (!topicId) return;
    getTopicInspector(topicId).then(res => setData(res)).catch(() => {});
  };

  const handleAddLink = () => {
    if (!data) return;
    const name = linkQuery.trim();
    const target = allTopics.find(t => t.name === name);
    if (!target) {
      setLinkError('请从候选中选择一个知识点');
      return;
    }
    if (target.id === data.id) {
      setLinkError('不能链接到自身');
      return;
    }
    setLinkError(null);
    startMutation(async () => {
      const res = await addTopicLink(data.id, target.id);
      if (res.ok) {
        setLinkQuery('');
        refetch();
        onLinksChanged();
      } else {
        setLinkError(res.error);
      }
    });
  };

  const handleRemoveLink = (otherId: string) => {
    if (!data) return;
    startMutation(async () => {
      const res = await removeTopicLink(data.id, otherId);
      if (res.ok) {
        refetch();
        onLinksChanged();
      } else {
        setLinkError(res.error);
      }
    });
  };

  const masteredCount = data?.questions.filter(q => q.status === 'mastered').length ?? 0;
  const errorCount = data?.questions.filter(q => q.status === 'error_prone').length ?? 0;
  const total = data?.questions.length ?? 0;

  return (
    <AnimatePresence>
      {topicId && (
        <motion.aside
          key="topic-inspector"
          initial={{ x: 420, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 420, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 320, damping: 32 }}
          data-lenis-prevent
          className="absolute right-3 top-16 bottom-3 z-30 flex w-[360px] max-w-[88vw] flex-col overflow-hidden rounded-2xl border border-zinc-200/70 bg-white/75 shadow-2xl shadow-indigo-500/10 backdrop-blur-xl dark:border-zinc-700/60 dark:bg-zinc-900/70"
        >
          {/* 顶栏 */}
          <div className="flex shrink-0 items-center justify-between border-b border-zinc-200/60 px-4 py-3 dark:border-zinc-800/60">
            <span className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-indigo-500 dark:text-indigo-400">
              <Sparkles size={13} /> 知识点
            </span>
            <button
              onClick={onClose}
              aria-label="关闭"
              className="rounded-lg p-1.5 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
            >
              <X size={15} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-4" style={{ WebkitOverflowScrolling: 'touch' }}>
            {loading && <InspectorSkeleton />}

            {!loading && !data && (
              <p className="py-10 text-center text-sm text-zinc-400 dark:text-zinc-500">知识点不存在。</p>
            )}

            {!loading && data && (
              <div className="space-y-5">
                {/* 面包屑 + 标题 */}
                <div>
                  {data.ancestors.length > 0 && (
                    <div className="mb-1 flex flex-wrap items-center gap-0.5 text-xs text-zinc-400 dark:text-zinc-500">
                      {data.ancestors.map(a => (
                        <span key={a.id} className="flex items-center gap-0.5">
                          <button
                            onClick={() => onNavigate(a.id)}
                            className="rounded px-0.5 transition-colors hover:text-indigo-500 dark:hover:text-indigo-400"
                          >
                            {a.name}
                          </button>
                          <ChevronRight size={11} className="opacity-60" />
                        </span>
                      ))}
                    </div>
                  )}
                  <h2 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">{data.name}</h2>
                  {data.description && (
                    <p className="mt-1.5 text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">{data.description}</p>
                  )}
                </div>

                {/* 掌握度统计条 */}
                {total > 0 && (
                  <div>
                    <div className="mb-1.5 flex items-baseline justify-between text-xs text-zinc-500 dark:text-zinc-400">
                      <span>{total} 道关联题</span>
                      <span>
                        <span className="text-emerald-600 dark:text-emerald-400">{masteredCount} 已掌握</span>
                        {' · '}
                        <span className="text-red-500 dark:text-red-400">{errorCount} 错题</span>
                      </span>
                    </div>
                    <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-zinc-200/80 dark:bg-zinc-800">
                      <div className="bg-emerald-500 transition-all" style={{ width: `${(masteredCount / total) * 100}%` }} />
                      <div className="bg-red-500 transition-all" style={{ width: `${(errorCount / total) * 100}%` }} />
                    </div>
                  </div>
                )}

                {/* 局部图谱聚焦 */}
                <button
                  onClick={() => onFocusLocal(data.id)}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-indigo-200/70 bg-indigo-50/70 px-3 py-2 text-sm font-medium text-indigo-600 transition-all hover:scale-[1.015] hover:bg-indigo-100/80 active:scale-[0.985] dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-300 dark:hover:bg-indigo-500/20"
                >
                  <Crosshair size={15} /> 进入局部图谱
                </button>

                {/* 双向链接 */}
                <section>
                  <SectionTitle icon={<Link2 size={13} />} text="双向链接" count={data.related.length} />
                  {data.related.length === 0 && (
                    <p className="text-xs text-zinc-400 dark:text-zinc-500">暂无关联知识点。</p>
                  )}
                  <div className="flex flex-wrap gap-1.5">
                    {data.related.map(r => (
                      <span
                        key={r.id}
                        className={[
                          'group inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                          r.via === 'manual'
                            ? 'border-amber-300/70 bg-amber-50/80 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300'
                            : 'border-violet-200/70 bg-violet-50/70 text-violet-700 dark:border-violet-500/25 dark:bg-violet-500/10 dark:text-violet-300',
                        ].join(' ')}
                      >
                        <button onClick={() => onNavigate(r.id)} className="transition-opacity hover:opacity-70">
                          {r.via === 'manual' ? '🔗 ' : ''}{r.name}
                        </button>
                        {r.via === 'cooccur' && r.sharedCount != null && (
                          <span className="rounded-full bg-violet-200/70 px-1 text-[10px] leading-4 text-violet-700 dark:bg-violet-500/25 dark:text-violet-200" title={`共现于 ${r.sharedCount} 道题`}>
                            {r.sharedCount}
                          </span>
                        )}
                        {r.via === 'manual' && data.canEdit && (
                          <button
                            onClick={() => handleRemoveLink(r.id)}
                            disabled={mutating}
                            aria-label={`删除与 ${r.name} 的双链`}
                            className="hidden text-amber-500 hover:text-red-500 group-hover:inline-block"
                          >
                            <Trash2 size={11} />
                          </button>
                        )}
                      </span>
                    ))}
                  </div>

                  {/* admin：添加手动双链 */}
                  {data.canEdit && (
                    <div className="mt-2.5">
                      <div className="flex gap-1.5">
                        <input
                          list="topic-link-candidates"
                          value={linkQuery}
                          onChange={e => setLinkQuery(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && handleAddLink()}
                          placeholder="链接到知识点…"
                          className="min-w-0 flex-1 rounded-lg border border-zinc-200 bg-white/80 px-2.5 py-1.5 text-xs text-zinc-800 outline-none transition-colors placeholder:text-zinc-400 focus:border-indigo-400 dark:border-zinc-700 dark:bg-zinc-800/80 dark:text-zinc-100 dark:focus:border-indigo-500"
                        />
                        <datalist id="topic-link-candidates">
                          {allTopics.filter(t => t.id !== data.id).map(t => (
                            <option key={t.id} value={t.name} />
                          ))}
                        </datalist>
                        <button
                          onClick={handleAddLink}
                          disabled={mutating || !linkQuery.trim()}
                          className="flex items-center gap-1 rounded-lg bg-indigo-500 px-2.5 py-1.5 text-xs font-medium text-white transition-all hover:bg-indigo-600 disabled:opacity-40"
                        >
                          <Plus size={12} /> 双链
                        </button>
                      </div>
                      {linkError && <p className="mt-1 text-xs text-red-500">{linkError}</p>}
                    </div>
                  )}
                </section>

                {/* 反向链接：子知识点 */}
                {data.children.length > 0 && (
                  <section>
                    <SectionTitle icon={<CornerDownRight size={13} />} text="子知识点" count={data.children.length} />
                    <div className="flex flex-wrap gap-1.5">
                      {data.children.map(c => (
                        <button
                          key={c.id}
                          onClick={() => onNavigate(c.id)}
                          className="rounded-full border border-sky-200/70 bg-sky-50/70 px-2.5 py-1 text-xs font-medium text-sky-700 transition-colors hover:bg-sky-100/80 dark:border-sky-500/25 dark:bg-sky-500/10 dark:text-sky-300 dark:hover:bg-sky-500/20"
                        >
                          {c.name}
                        </button>
                      ))}
                    </div>
                  </section>
                )}

                {/* 反向链接：关联题目 */}
                <section>
                  <SectionTitle icon={<CircleDot size={13} />} text="反向链接 · 题目" count={total} />
                  {total === 0 && <p className="text-xs text-zinc-400 dark:text-zinc-500">暂无已发布题目挂靠。</p>}
                  <ul className="space-y-0.5">
                    {data.questions.map(q => (
                      <li key={q.id}>
                        <button
                          onClick={() => onQuestionClick(q.id)}
                          className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-zinc-600 transition-colors hover:bg-zinc-100/80 hover:text-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800/70 dark:hover:text-zinc-50"
                        >
                          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${STATUS_DOT[q.status]}`} />
                          <span className="truncate">{q.name}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              </div>
            )}
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}

function SectionTitle({ icon, text, count }: { icon: React.ReactNode; text: string; count: number }) {
  return (
    <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
      {icon} {text}
      <span className="rounded-full bg-zinc-100 px-1.5 text-[10px] leading-4 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">{count}</span>
    </h3>
  );
}

function InspectorSkeleton() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="h-3 w-1/3 rounded bg-zinc-200 dark:bg-zinc-800" />
      <div className="h-6 w-2/3 rounded bg-zinc-200 dark:bg-zinc-800" />
      <div className="h-3 w-full rounded bg-zinc-200 dark:bg-zinc-800" />
      <div className="h-9 w-full rounded-xl bg-zinc-100 dark:bg-zinc-800/60" />
      <div className="h-3 w-1/4 rounded bg-zinc-200 dark:bg-zinc-800" />
      <div className="flex gap-1.5">
        <div className="h-6 w-16 rounded-full bg-zinc-100 dark:bg-zinc-800/60" />
        <div className="h-6 w-20 rounded-full bg-zinc-100 dark:bg-zinc-800/60" />
        <div className="h-6 w-14 rounded-full bg-zinc-100 dark:bg-zinc-800/60" />
      </div>
      <div className="h-24 w-full rounded-xl bg-zinc-100 dark:bg-zinc-800/60" />
    </div>
  );
}
