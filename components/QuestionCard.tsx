'use client';

import { memo, Suspense, use, useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { ChevronDown, GripVertical, Layers, Pencil, Sparkles, Star, Trash2, X } from 'lucide-react';
import MathRenderer from '@/components/MathRenderer';
import ProvenanceBadge from '@/components/ProvenanceBadge';
import { getSimilarQuestions, type SimilarQuestion } from '@/app/actions/embeddings';
import QuestionInteractiveSandbox from '@/components/QuestionInteractiveSandbox';
import DifficultyRating from '@/components/DifficultyRating';
import Magnetic from '@/components/motion/Magnetic';
import SquishyButton from '@/components/motion/SquishyButton';
import { usePersonalization } from '@/components/question/PersonalizationContext';
import { toggleFavorite, markError, removeError, recordView, recordAttempt } from '@/app/actions/user-workspace';
import { stripInlineOptionTail, withAnswerBlank, isBlankOption, normalizeOptions, isMultiAnswer } from '@/lib/questions/content';
import type { QuestionWithTopics } from '@/types/database';

interface QuestionCardProps {
  question: QuestionWithTopics;
  isAdmin?: boolean;
  /** true if current user can delete/drag this question (admin OR owner of private question) */
  canModify?: boolean;
  onDelete?: (id: string) => void;
  isDragging?: boolean;
  dragHandleProps?: Record<string, unknown>;
  isLoggedIn?: boolean;
  initialFavorited?: boolean;
  initialErrored?: boolean;
  /** 当前用户对该题的难度评分（1–5），未评为 null */
  initialMyRating?: number | null;
}

function QuestionCard({ question, isAdmin = false, canModify, onDelete, isDragging = false, dragHandleProps, isLoggedIn = false, initialFavorited = false, initialErrored = false, initialMyRating = null }: QuestionCardProps) {
  const effectiveCanModify = canModify ?? isAdmin;
  const [solutionOpen, setSolutionOpen] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [gradedCorrect, setGradedCorrect] = useState(false);
  const [pendingCorrect, setPendingCorrect] = useState(false);

  // 删除确认弹窗：Escape 关闭（与点击遮罩等价）
  useEffect(() => {
    if (!showConfirm) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowConfirm(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showConfirm]);

  // 相似题（pgvector 语义近邻）—— 首次展开才拉取，避免列表页 N 次请求。
  const [similarOpen, setSimilarOpen] = useState(false);
  const [similar, setSimilar] = useState<SimilarQuestion[] | null>(null);
  const [similarLoading, setSimilarLoading] = useState(false);

  function handleToggleSimilar() {
    const opening = !similarOpen;
    setSimilarOpen(opening);
    if (opening && similar === null && !similarLoading) {
      setSimilarLoading(true);
      getSimilarQuestions(question.id)
        .then((rows) => setSimilar(rows))
        .catch(() => setSimilar([]))
        .finally(() => setSimilarLoading(false));
    }
  }

  function handleToggleSolution() {
    const opening = !solutionOpen;
    setSolutionOpen(opening);
    if (opening && isLoggedIn) {
      recordView(question.id).catch(() => {});
    }
  }

  // 自评「我做对了」—— 知识星图绿色(已掌握)节点的数据来源。
  // 乐观更新 + 失败回滚 + toast：UI 零延迟响应，服务端失败时恢复原状并明确告知。
  function handleMarkCorrect() {
    if (pendingCorrect || gradedCorrect) return;
    setGradedCorrect(true); // 乐观
    setPendingCorrect(true);
    recordAttempt(question.id, true)
      .then((result) => {
        if (!result.success) throw new Error(result.error);
      })
      .catch(() => {
        setGradedCorrect(false);
        toast.error('记录失败，请重试');
      })
      .finally(() => setPendingCorrect(false));
  }

  const primaryTopic = (question.question_topic_relations.find(r => r.is_primary) ?? question.question_topic_relations[0])?.topics;
  // 完整试卷名（含年份，如「2002年上海卷理」）是最鲜明的检索特征，原样保留；
  // 不再单独显示 year 字段，避免重复占用视觉。
  const solutionContent = [question.answer, question.analysis || question.solution].filter(Boolean).join('\n\n---\n\n');
  const options = normalizeOptions(question.metadata?.options);
  // 图形选项题（选项即配图中的子图）抽进数组后是 ["A.","B.","C.","D."] 空壳——不渲染空白网格，
  // 但它仍是选择题：题干补括号、剥内联尾巴照常按 options.length 判定。
  const isChoice = options.length >= 2;
  const visibleOptions = options.filter(o => !isBlankOption(o));
  // 多选题提示：入库时写好的 metadata.choice_type 为主；答案本身是 2+ 选项字母（"AD"）即铁证多选，
  // 故答案优先级最高——覆盖历史数据漏标、或模型把多选误判成单选的情况。
  const isMulti = isChoice && (question.metadata?.choice_type === 'multi' || isMultiAnswer(question.answer));

  // 兜底：老数据 / 模型漏网时，展示侧再用同一逻辑剥掉题干里重复的选项尾巴（治本在 process-paper 入库时）。
  // 选项进数组、走下方网格渲染的选择题，给题干补上高考式作答括号「（　　）」。
  //（选项仍内联在题干里的题，由 MathRenderer 的 splitChoiceOptions 补括号，故此处仅处理数组选项题。）
  const strippedContent = stripInlineOptionTail(question.content, isChoice);
  const displayContent = isChoice ? withAnswerBlank(strippedContent) : strippedContent;

  async function handleConfirmDelete() {
    if (!onDelete) return;
    setDeleting(true);
    onDelete(question.id);
    setShowConfirm(false);
    setDeleting(false);
  }

  return (
    <>
      <article
        className={[
          'group rounded-2xl border border-zinc-100 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden',
          isDragging ? 'opacity-40' : 'opacity-100',
        ].join(' ')}
      >
        {/* Card header */}
        <div className="flex flex-wrap items-center gap-2 px-5 py-2.5 border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-800/30">
          {dragHandleProps && (
            <button
              type="button"
              {...(dragHandleProps as React.ButtonHTMLAttributes<HTMLButtonElement>)}
              title="拖拽归类"
              className="flex items-center justify-center w-5 h-5 -ml-2 rounded text-zinc-300 dark:text-zinc-600 hover:text-zinc-500 dark:hover:text-zinc-400 cursor-grab active:cursor-grabbing touch-none shrink-0 transition-colors"
            >
              <GripVertical size={13} />
            </button>
          )}
          {/* 收藏键 —— 最左；个人化初值独立 Suspense 注水，不阻塞题面 */}
          {isLoggedIn && (
            <Suspense fallback={<FavoriteStarFallback />}>
              <FavoriteStar questionId={question.id} initialFavorited={initialFavorited} />
            </Suspense>
          )}
          {/* 题目来源（完整卷名，含年份）—— 收藏键右侧 */}
          {question.source && (
            <span className="text-sm font-medium text-zinc-700 dark:text-zinc-200 truncate">
              {question.source}
            </span>
          )}
          {/* 题源溯源徽章（官方/社区/改编 + 已核验）；管理员可内联标注 */}
          <ProvenanceBadge question={question} isAdmin={isAdmin} />
          {primaryTopic && (
            <span className="text-xs text-zinc-400 dark:text-zinc-500 truncate">· {primaryTopic.name}</span>
          )}
          {/* 多选题醒目提示——新高考多选题与单选题卷面易混，给个标签免得漏看「不止一个正确答案」 */}
          {isMulti && (
            <span className="shrink-0 rounded px-1.5 py-0.5 text-[11px] leading-none text-rose-600 bg-rose-50 border border-rose-200 dark:text-rose-300 dark:bg-rose-950/40 dark:border-rose-900">
              多选
            </span>
          )}

          {/* 众包难度评分 —— 靠右；全站均分同步可见，「我的评分」独立 Suspense 注水 */}
          <div className="ml-auto">
            <Suspense
              fallback={
                <div className="pointer-events-none" aria-hidden>
                  <DifficultyRating
                    questionId={question.id}
                    initialAvg={Number(question.rating_avg ?? 0)}
                    initialCount={question.rating_count ?? 0}
                    initialMyRating={null}
                    isLoggedIn={false}
                  />
                </div>
              }
            >
              <RatingSlot
                questionId={question.id}
                initialAvg={Number(question.rating_avg ?? 0)}
                initialCount={question.rating_count ?? 0}
                initialMyRating={initialMyRating}
                isLoggedIn={isLoggedIn}
              />
            </Suspense>
          </div>

          {/* 管理员编辑/删除 —— hover 显示，靠右 */}
          {(isAdmin || (effectiveCanModify && onDelete)) && (
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150 shrink-0">
              {isAdmin && (
                <a
                  href={`/admin/edit/${question.id}`}
                  title="编辑题目"
                  className="flex items-center gap-1 px-2 py-0.5 rounded-md border border-zinc-200 dark:border-zinc-700 text-zinc-400 hover:text-blue-600 hover:border-blue-300 dark:hover:text-blue-400 dark:hover:border-blue-700 transition-colors"
                >
                  <Pencil size={11} /> 编辑
                </a>
              )}
              {effectiveCanModify && onDelete && (
                <button
                  onClick={() => setShowConfirm(true)}
                  title="删除题目"
                  className="flex items-center gap-1 px-2 py-0.5 rounded-md border border-zinc-200 dark:border-zinc-700 text-zinc-400 hover:text-red-600 hover:border-red-300 dark:hover:text-red-500 dark:hover:border-red-700 transition-colors"
                >
                  <Trash2 size={11} /> 删除
                </button>
              )}
            </div>
          )}
        </div>

        {/* Question body */}
        <div className="px-5 pt-5 pb-1 text-[15px]">
          <MathRenderer content={displayContent} academicTypography />
        </div>

        {/* Interactive Rive sandbox — 仅当题目配置了交互动画时渲染 */}
        {question.interactive_sandbox && (
          <QuestionInteractiveSandbox config={question.interactive_sandbox} />
        )}

        {/* Options — 字号、行距与题干完全一致，确保 1990 年代高考排版的整齐。
            图形选项题选项为空壳 → visibleOptions 为空 → 不渲染网格（选项已在配图里）。 */}
        {visibleOptions.length > 0 && (
          <div className={`px-5 pb-4 pt-2 grid gap-x-8 gap-y-2 ${visibleOptions.length <= 2 ? 'grid-cols-1' : 'grid-cols-2'}`}>
            {visibleOptions.map((opt, i) => (
              <div key={i} className="text-[15px] [&_.prose_p]:my-0 [&_.prose_p]:leading-[1.85]">
                <MathRenderer content={opt} academicTypography />
              </div>
            ))}
          </div>
        )}

        {/* Action bar */}
        <div className="flex items-center gap-2 px-5 py-3 border-t border-zinc-100 dark:border-zinc-800">
          <SquishyButton
            onClick={handleToggleSolution}
            className="flex items-center gap-1.5 text-sm font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
          >
            <ChevronDown
              size={15}
              className={`transition-transform duration-200 ${solutionOpen ? 'rotate-180' : ''}`}
            />
            {solutionOpen ? '收起解析' : '查看解析'}
          </SquishyButton>
          {isLoggedIn && (
            <Suspense fallback={<ErrorToggleFallback />}>
              <ErrorToggle questionId={question.id} initialErrored={initialErrored} />
            </Suspense>
          )}
          {isLoggedIn && (
            <SquishyButton
              onClick={handleMarkCorrect}
              aria-pressed={gradedCorrect}
              title="标记为已掌握（计入知识星图）"
              className={[
                'flex items-center gap-1 text-xs px-2 py-1 rounded-md border transition-colors',
                gradedCorrect
                  ? 'border-emerald-200 dark:border-emerald-800 text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30'
                  : 'border-zinc-200 dark:border-zinc-700 text-zinc-400 hover:border-emerald-300 dark:hover:border-emerald-700 hover:text-emerald-600 dark:hover:text-emerald-400',
              ].join(' ')}
            >
              {gradedCorrect ? '✓ 已掌握' : '我做对了'}
            </SquishyButton>
          )}
          <SquishyButton
            onClick={handleToggleSimilar}
            title="用 AI 语义检索找相似题"
            className={[
              'flex items-center gap-1 text-xs px-2 py-1 rounded-md border transition-colors',
              similarOpen
                ? 'border-violet-300 dark:border-violet-700 text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-950/30'
                : 'border-zinc-200 dark:border-zinc-700 text-zinc-400 hover:border-violet-300 dark:hover:border-violet-700 hover:text-violet-600 dark:hover:text-violet-400',
            ].join(' ')}
          >
            <Sparkles size={13} />
            相似题
          </SquishyButton>
          <VariantButton count={question.variations?.length ?? 0} />
          {/* 解题工作台入口 —— 北极星功能：题面+手写演算+渐进提示。最右侧主 CTA。 */}
          <Link
            href={`/solve/${question.id}`}
            title="进入解题工作台：全屏手写演算 + 卡住时渐进提示"
            className="ml-auto flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-indigo-600 to-violet-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-transform hover:scale-[1.03] active:scale-95"
          >
            <Pencil size={13} /> 解题工作台
          </Link>
        </div>

        {/* 相似题面板（语义近邻）—— 懒加载 */}
        {similarOpen && (
          <div className="border-t border-violet-100 dark:border-violet-900/60 bg-violet-50/40 dark:bg-violet-950/20 px-5 py-4">
            <p className="text-[0.6875rem] font-semibold uppercase tracking-widest text-violet-600 dark:text-violet-400 mb-3">
              相似题
            </p>
            {similarLoading && (
              <p className="text-sm text-zinc-400">检索中…</p>
            )}
            {!similarLoading && similar !== null && similar.length === 0 && (
              <p className="text-sm text-zinc-400">暂无相似题（题库语义索引可能尚未建立）。</p>
            )}
            {!similarLoading && similar && similar.length > 0 && (
              <ul className="space-y-2">
                {similar.map((s) => (
                  <li key={s.id}>
                    <Link
                      href={`/question/${s.id}`}
                      className="block rounded-lg border border-violet-100 dark:border-violet-900/50 bg-white/70 dark:bg-zinc-900/50 px-3 py-2 hover:border-violet-300 dark:hover:border-violet-700 transition-colors"
                    >
                      {s.source && (
                        <span className="block text-[11px] text-zinc-400 mb-0.5 truncate">{s.source}</span>
                      )}
                      <span className="block text-sm text-zinc-700 dark:text-zinc-200 line-clamp-2">
                        {s.content.replace(/\$+/g, '').slice(0, 120)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Solution panel */}
        {solutionOpen && (
          <div className="border-t border-blue-100 dark:border-blue-900/60 bg-blue-50/40 dark:bg-blue-950/20 px-5 py-5">
            <p className="text-[0.6875rem] font-semibold uppercase tracking-widest text-blue-600 dark:text-blue-400 mb-3">
              参考答案与解析
            </p>
            <MathRenderer content={solutionContent} academicTypography />
          </div>
        )}
      </article>

      {/* Delete confirm modal */}
      {showConfirm && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby={`delete-confirm-${question.id}`}
        >
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setShowConfirm(false)}
          />
          <div className="relative bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl w-full max-w-xs p-6 border border-zinc-200 dark:border-zinc-800">
            <button
              onClick={() => setShowConfirm(false)}
              aria-label="关闭"
              className="absolute top-4 right-4 p-1 rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            >
              <X size={16} />
            </button>
            <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-red-50 dark:bg-red-950/40 mb-4 mx-auto">
              <Trash2 size={22} className="text-red-600 dark:text-red-400" />
            </div>
            <h2 id={`delete-confirm-${question.id}`} className="text-center font-semibold text-zinc-900 dark:text-zinc-100 mb-1">
              确认删除
            </h2>
            <p className="text-center text-sm text-zinc-500 dark:text-zinc-400 mb-6">
              此操作不可撤销，题目将从题库中永久移除。
            </p>
            <div className="flex gap-2.5">
              <button
                onClick={() => setShowConfirm(false)}
                autoFocus
                className="flex-1 py-2.5 rounded-xl text-sm font-medium border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleConfirmDelete}
                disabled={deleting}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-red-600 text-white hover:bg-red-700 active:scale-95 transition-all disabled:opacity-60"
              >
                {deleting ? '删除中…' : '确认删除'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ── 个人化小部件 ───────────────────────────────────────────────────────────
// 有 PersonalizationProvider（首页流式注水）时 use() 解包 promise——挂起只波及
// 各自的小 Suspense；无 Provider 的页面直接用同步 initial props，行为不变。

/** 收藏星标：含个人化初值解包 + 乐观切换。 */
function FavoriteStar({ questionId, initialFavorited }: { questionId: string; initialFavorited: boolean }) {
  const personalization = usePersonalization();
  const favoritedIds = personalization ? use(personalization.favoritedIds) : null;
  const [favorited, setFavorited] = useState(favoritedIds ? favoritedIds.includes(questionId) : initialFavorited);
  const [pending, setPending] = useState(false);

  // 乐观更新 + 失败回滚 + toast：UI 零延迟响应，服务端失败时恢复原状并明确告知。
  function handleToggleFavorite(e: React.MouseEvent) {
    e.preventDefault();
    if (pending) return;
    const prev = favorited;
    setFavorited(!prev); // 乐观
    setPending(true);
    toggleFavorite(questionId)
      .then((result) => {
        if (!result.success) throw new Error(result.error);
        setFavorited(result.favorited); // 以服务端为准（防双端漂移）
      })
      .catch(() => {
        setFavorited(prev);
        toast.error(prev ? '取消收藏失败，请重试' : '收藏失败，请重试');
      })
      .finally(() => setPending(false));
  }

  return (
    <Magnetic intensity={0.3} range={6}>
      <SquishyButton
        onClick={handleToggleFavorite}
        aria-pressed={favorited}
        title={favorited ? '取消收藏' : '收藏此题'}
        className={[
          'flex items-center justify-center w-6 h-6 rounded-md transition-colors shrink-0',
          favorited
            ? 'text-amber-400 hover:text-amber-500'
            : 'text-zinc-300 dark:text-zinc-600 hover:text-amber-400 dark:hover:text-amber-500',
        ].join(' ')}
      >
        <Star size={14} fill={favorited ? 'currentColor' : 'none'} />
      </SquishyButton>
    </Magnetic>
  );
}

function FavoriteStarFallback() {
  return (
    <span aria-hidden className="flex items-center justify-center w-6 h-6 rounded-md text-zinc-200 dark:text-zinc-700 shrink-0">
      <Star size={14} fill="none" />
    </span>
  );
}

/** 错题本切换：含个人化初值解包 + 乐观切换。 */
function ErrorToggle({ questionId, initialErrored }: { questionId: string; initialErrored: boolean }) {
  const personalization = usePersonalization();
  const erroredIds = personalization ? use(personalization.erroredIds) : null;
  const [errored, setErrored] = useState(erroredIds ? erroredIds.includes(questionId) : initialErrored);
  const [pending, setPending] = useState(false);

  function handleToggleError() {
    if (pending) return;
    const prev = errored;
    setErrored(!prev); // 乐观
    setPending(true);
    (prev ? removeError(questionId) : markError(questionId))
      .then((result) => {
        if (!result.success) throw new Error(result.error);
      })
      .catch(() => {
        setErrored(prev);
        toast.error(prev ? '移出错题本失败，请重试' : '记入错题本失败，请重试');
      })
      .finally(() => setPending(false));
  }

  return (
    <SquishyButton
      onClick={handleToggleError}
      aria-pressed={errored}
      title={errored ? '点击从错题本移除' : '标记为错题'}
      className={[
        'flex items-center gap-1 text-xs px-2 py-1 rounded-md border transition-colors',
        errored
          ? 'border-green-200 dark:border-green-800 text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-950/30 hover:border-red-300 dark:hover:border-red-700 hover:text-red-500 dark:hover:text-red-400 hover:bg-transparent'
          : 'border-zinc-200 dark:border-zinc-700 text-zinc-400 hover:border-red-300 dark:hover:border-red-700 hover:text-red-500 dark:hover:text-red-400',
      ].join(' ')}
    >
      {errored ? '✓ 已记录' : '我做错了'}
    </SquishyButton>
  );
}

function ErrorToggleFallback() {
  return (
    <span aria-hidden className="flex items-center gap-1 text-xs px-2 py-1 rounded-md border border-zinc-200 dark:border-zinc-700 text-zinc-300 dark:text-zinc-600">
      我做错了
    </span>
  );
}

/** 难度评分：解包「我的评分」后渲染交互版 DifficultyRating。 */
function RatingSlot({
  questionId, initialAvg, initialCount, initialMyRating, isLoggedIn,
}: {
  questionId: string;
  initialAvg: number;
  initialCount: number;
  initialMyRating: number | null;
  isLoggedIn: boolean;
}) {
  const personalization = usePersonalization();
  const myRatings = personalization ? use(personalization.myRatings) : null;
  return (
    <DifficultyRating
      questionId={questionId}
      initialAvg={initialAvg}
      initialCount={initialCount}
      initialMyRating={myRatings ? (myRatings[questionId] ?? null) : initialMyRating}
      isLoggedIn={isLoggedIn}
    />
  );
}

function VariantButton({ count }: { count: number }) {
  return (
    <button
      disabled={count === 0}
      title={count === 0 ? '暂无变式题' : `${count} 道变式题`}
      className="ml-auto flex items-center gap-1.5 text-sm font-medium text-zinc-500 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-1.5 hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
    >
      <Layers size={14} />
      查看变式题
      {count > 0 && (
        <span className="text-[0.625rem] font-semibold bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300 px-1.5 py-0.5 rounded-full leading-none">
          {count}
        </span>
      )}
    </button>
  );
}

// memo：列表页搜索框每个 keystroke 触发父组件重渲染，没有 memo 时所有题卡的
// react-markdown + KaTeX 全管线会整体重跑（几十题的卷子打字明显卡顿）。
// props 里 question/初值都来自服务端快照、引用稳定，浅比较即可拦截。
export default memo(QuestionCard);
