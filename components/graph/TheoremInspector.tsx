'use client';

// 定理 Inspector：点击定理（金色菱形）节点从右侧滑入。定理库 ⟷ 知识星图的联动面板。
// 结构：陈述（LaTeX）→ 证明（可折叠）→ 局部图谱 → 所属知识点 → 反向链接·题目。
// 只读（定理内容由 AI 回填 / 管理员维护，不在此编辑）。数据走 getTheoremInspector。
import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Sigma, Crosshair, Sparkles, CircleDot, ChevronDown } from 'lucide-react';
import { getTheoremInspector } from '@/app/actions/graph';
import type { TheoremInspectorData, NodeStatus } from '@/types/graph';
import ClientMath from '@/components/solve/ClientMath';

interface Props {
  theoremId: string | null;
  onClose: () => void;
  /** 点击所属知识点 → 切到 TopicInspector 并聚焦 */
  onNavigateTopic: (topicId: string) => void;
  /** 点击关联题目 → 打开题目抽屉 */
  onQuestionClick: (questionId: string) => void;
  /** 「局部图谱」按钮 → 以该定理为根进入聚焦模式 */
  onFocusLocal: (theoremId: string) => void;
}

const STATUS_DOT: Record<NodeStatus, string> = {
  unattempted: 'bg-zinc-400 dark:bg-zinc-600',
  error_prone: 'bg-red-500 dark:bg-red-400',
  mastered:    'bg-emerald-500 dark:bg-emerald-400',
};

export default function TheoremInspector({
  theoremId, onClose, onNavigateTopic, onQuestionClick, onFocusLocal,
}: Props) {
  const [data, setData] = useState<TheoremInspectorData | null>(null);
  const [loading, setLoading] = useState(false);
  const [showProof, setShowProof] = useState(false);
  const reqSeq = useRef(0);

  // 渲染期调整（仓库约定：set-state-in-effect 会卡 build）：theoremId 变更时同步重置面板态。
  const [prevId, setPrevId] = useState<string | null>(null);
  if (theoremId !== prevId) {
    setPrevId(theoremId);
    if (theoremId) { setLoading(true); setShowProof(false); }
  }

  useEffect(() => {
    if (!theoremId) return;
    const seq = ++reqSeq.current;
    getTheoremInspector(theoremId)
      .then(res => { if (reqSeq.current === seq) { setData(res); setLoading(false); } })
      .catch(() => { if (reqSeq.current === seq) setLoading(false); });
  }, [theoremId]);

  const total = data?.questions.length ?? 0;

  return (
    <AnimatePresence>
      {theoremId && (
        <motion.aside
          key="theorem-inspector"
          initial={{ x: 420, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 420, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 320, damping: 32 }}
          data-lenis-prevent
          className="absolute right-3 top-16 bottom-3 z-30 flex w-[360px] max-w-[88vw] flex-col overflow-hidden rounded-2xl border border-amber-200/70 bg-white/75 shadow-2xl shadow-amber-500/10 backdrop-blur-xl dark:border-amber-500/25 dark:bg-zinc-900/70"
        >
          {/* 顶栏 */}
          <div className="flex shrink-0 items-center justify-between border-b border-amber-200/50 px-4 py-3 dark:border-amber-500/20">
            <span className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-amber-600 dark:text-amber-400">
              <Sigma size={13} /> 定理
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
              <p className="py-10 text-center text-sm text-zinc-400 dark:text-zinc-500">定理不存在。</p>
            )}

            {!loading && data && (
              <div className="space-y-5">
                {/* 标题 + 简介 */}
                <div>
                  <h2 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">{data.name}</h2>
                  {data.description && (
                    <p className="mt-1.5 text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">{data.description}</p>
                  )}
                </div>

                {/* 陈述 */}
                {data.statement.trim() && (
                  <section className="rounded-xl border border-amber-200/60 bg-amber-50/40 px-3.5 py-3 dark:border-amber-500/20 dark:bg-amber-950/10">
                    <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400">陈述</h3>
                    <ClientMath content={data.statement} />
                  </section>
                )}

                {/* 示意图 */}
                {data.figureUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={data.figureUrl} alt={`${data.name} 示意图`} className="mx-auto max-h-48 rounded-md bg-white p-1.5" />
                )}

                {/* 证明（可折叠） */}
                {data.proof.trim() && (
                  <section>
                    <button
                      onClick={() => setShowProof(v => !v)}
                      className="flex items-center gap-1.5 text-sm font-medium text-amber-700 transition-colors hover:text-amber-800 dark:text-amber-400 dark:hover:text-amber-300"
                    >
                      <ChevronDown size={15} className={`transition-transform duration-200 ${showProof ? 'rotate-180' : ''}`} />
                      {showProof ? '收起证明' : '查看证明'}
                    </button>
                    {showProof && (
                      <div className="mt-2 rounded-xl border border-zinc-200/70 bg-white/60 px-3.5 py-3 dark:border-zinc-700/60 dark:bg-zinc-900/40">
                        <ClientMath content={data.proof} />
                      </div>
                    )}
                  </section>
                )}

                {/* 局部图谱聚焦 */}
                <button
                  onClick={() => onFocusLocal(data.id)}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-amber-200/70 bg-amber-50/70 px-3 py-2 text-sm font-medium text-amber-700 transition-all hover:scale-[1.015] hover:bg-amber-100/80 active:scale-[0.985] dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300 dark:hover:bg-amber-500/20"
                >
                  <Crosshair size={15} /> 进入局部图谱
                </button>

                {/* 所属知识点 */}
                {data.topics.length > 0 && (
                  <section>
                    <SectionTitle icon={<Sparkles size={13} />} text="所属知识点" count={data.topics.length} />
                    <div className="flex flex-wrap gap-1.5">
                      {data.topics.map(t => (
                        <button
                          key={t.id}
                          onClick={() => onNavigateTopic(t.id)}
                          className="rounded-full border border-violet-200/70 bg-violet-50/70 px-2.5 py-1 text-xs font-medium text-violet-700 transition-colors hover:bg-violet-100/80 dark:border-violet-500/25 dark:bg-violet-500/10 dark:text-violet-300 dark:hover:bg-violet-500/20"
                        >
                          {t.name}
                        </button>
                      ))}
                    </div>
                  </section>
                )}

                {/* 反向链接：用到此定理的题目 */}
                <section>
                  <SectionTitle icon={<CircleDot size={13} />} text="用到此定理的题目" count={total} />
                  {total === 0 && <p className="text-xs text-zinc-400 dark:text-zinc-500">暂无已关联题目（可在管理后台回填）。</p>}
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
      <div className="h-6 w-2/3 rounded bg-zinc-200 dark:bg-zinc-800" />
      <div className="h-16 w-full rounded-xl bg-zinc-100 dark:bg-zinc-800/60" />
      <div className="h-9 w-full rounded-xl bg-zinc-100 dark:bg-zinc-800/60" />
      <div className="h-3 w-1/4 rounded bg-zinc-200 dark:bg-zinc-800" />
      <div className="flex gap-1.5">
        <div className="h-6 w-16 rounded-full bg-zinc-100 dark:bg-zinc-800/60" />
        <div className="h-6 w-20 rounded-full bg-zinc-100 dark:bg-zinc-800/60" />
      </div>
    </div>
  );
}
