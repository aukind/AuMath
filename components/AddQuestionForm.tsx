'use client';

import { useState, useTransition, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Eye, EyeOff, Loader2, Send, Save } from 'lucide-react';
import MathRenderer from '@/components/MathRenderer';
import { createQuestion, updateQuestion } from '@/app/actions/questions';
import type { QuestionForEdit } from '@/app/actions/questions';
import type { TopicRow, QuestionType, Difficulty } from '@/types/database';

const QUESTION_TYPES: { value: QuestionType; label: string }[] = [
  { value: 'calculation',     label: '解答题' },
  { value: 'proof',           label: '证明题' },
  { value: 'fill_in_blank',   label: '填空题' },
  { value: 'multiple_choice', label: '选择题' },
];

const DIFFICULTY_LABELS = ['', '基础', '进阶', '中等', '拔高', '竞赛'];

interface Props {
  topics: Pick<TopicRow, 'id' | 'name' | 'parent_id'>[];
  /** 传入时为编辑模式，表单自动回显该题目的数据 */
  initialData?: QuestionForEdit;
}

// ── 单字段：左编辑 / 右预览 ──────────────────────────────────

function SplitField({
  label,
  value,
  onChange,
  placeholder,
  rows = 10,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  rows?: number;
}) {
  return (
    <div className="space-y-2">
      <span className="text-[0.6875rem] font-semibold uppercase tracking-widest text-zinc-400">
        {label}
      </span>
      <div className="grid grid-cols-2 gap-0 rounded-xl overflow-hidden border border-zinc-200 dark:border-zinc-700 shadow-sm">
        {/* 编辑区 */}
        <div className="relative border-r border-zinc-200 dark:border-zinc-700">
          <div className="absolute top-2 right-3 text-[0.625rem] text-zinc-300 dark:text-zinc-600 select-none pointer-events-none">
            Markdown · LaTeX
          </div>
          <textarea
            value={value}
            onChange={e => onChange(e.target.value)}
            placeholder={placeholder}
            rows={rows}
            className="w-full bg-zinc-50/50 dark:bg-zinc-900/80 px-4 pt-7 pb-4 text-sm font-mono text-zinc-800 dark:text-zinc-200 placeholder:text-zinc-300 dark:placeholder:text-zinc-600 resize-none focus:outline-none focus:bg-white dark:focus:bg-zinc-900 transition-colors"
          />
        </div>

        {/* 预览区 */}
        <div className="bg-white dark:bg-zinc-900 px-5 py-4 overflow-y-auto min-h-0">
          {value.trim() ? (
            <MathRenderer content={value} />
          ) : (
            <div className="h-full flex items-center justify-center">
              <p className="text-xs text-zinc-300 dark:text-zinc-600 italic text-center leading-relaxed">
                在左侧输入 LaTeX 公式<br />右侧实时渲染预览
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── 可折叠字段（答案 / 解析） ────────────────────────────────

function CollapsibleField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  const [showPreview, setShowPreview] = useState(false);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[0.6875rem] font-semibold uppercase tracking-widest text-zinc-400">
          {label}
        </span>
        <button
          type="button"
          onClick={() => setShowPreview(v => !v)}
          className="flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors"
        >
          {showPreview ? <EyeOff size={12} /> : <Eye size={12} />}
          {showPreview ? '隐藏预览' : '显示预览'}
        </button>
      </div>

      {showPreview ? (
        <div className="grid grid-cols-2 gap-0 rounded-xl overflow-hidden border border-zinc-200 dark:border-zinc-700 shadow-sm">
          <div className="border-r border-zinc-200 dark:border-zinc-700">
            <textarea
              value={value}
              onChange={e => onChange(e.target.value)}
              placeholder={placeholder}
              rows={6}
              className="w-full bg-zinc-50/50 dark:bg-zinc-900/80 px-4 py-4 text-sm font-mono text-zinc-800 dark:text-zinc-200 placeholder:text-zinc-300 dark:placeholder:text-zinc-600 resize-none focus:outline-none focus:bg-white dark:focus:bg-zinc-900 transition-colors"
            />
          </div>
          <div className="bg-white dark:bg-zinc-900 px-5 py-4 overflow-y-auto">
            {value.trim() ? (
              <MathRenderer content={value} />
            ) : (
              <p className="text-xs text-zinc-300 dark:text-zinc-600 italic">输入后显示预览…</p>
            )}
          </div>
        </div>
      ) : (
        <textarea
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          rows={4}
          className="w-full rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-4 py-3 text-sm font-mono text-zinc-800 dark:text-zinc-200 placeholder:text-zinc-300 dark:placeholder:text-zinc-600 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm transition-colors"
        />
      )}
    </div>
  );
}

// ── 主表单 ───────────────────────────────────────────────────

export default function AddQuestionForm({ topics, initialData }: Props) {
  const router   = useRouter();
  const isEdit   = !!initialData?.id;
  const [isPending, startTransition] = useTransition();

  // 以 initialData 作为初始值，实现回显
  const [content,      setContent]      = useState(initialData?.content      ?? '');
  const [answer,       setAnswer]       = useState(initialData?.answer       ?? '');
  const [analysis,     setAnalysis]     = useState(initialData?.analysis     ?? '');
  const [questionType, setQuestionType] = useState<QuestionType>(initialData?.question_type ?? 'calculation');
  const [difficulty,   setDifficulty]   = useState<Difficulty>(initialData?.difficulty ?? 3);
  const [year,         setYear]         = useState(initialData?.year ? String(initialData.year) : String(new Date().getFullYear()));
  const [source,       setSource]       = useState(initialData?.source ?? '');
  const [topicIds,     setTopicIds]     = useState<string[]>(initialData?.topic_ids ?? []);
  const [errorMsg,     setErrorMsg]     = useState<string | null>(null);

  const toggleTopic = useCallback((id: string) => {
    setTopicIds(prev => prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id]);
  }, []);

  const handleSubmit = (status: 'published' | 'draft') => {
    if (!content.trim()) { setErrorMsg('题目正文不能为空'); return; }
    if (!answer.trim())  { setErrorMsg('标准答案不能为空'); return; }
    setErrorMsg(null);

    const payload = {
      content,
      answer,
      analysis,
      question_type: questionType,
      difficulty,
      year:   year ? parseInt(year, 10) : null,
      source: source.trim() || null,
      topic_ids: topicIds,
      status,
    };

    startTransition(async () => {
      const result = isEdit
        ? await updateQuestion(initialData!.id, payload)
        : await createQuestion(payload);

      if (result.success) {
        router.push('/');
        router.refresh();
      } else {
        setErrorMsg(result.error ?? '提交失败，请重试');
      }
    });
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex flex-col">

      {/* ── 顶部导航栏 ── */}
      <header className="sticky top-0 z-20 border-b border-zinc-200 dark:border-zinc-800 bg-white/90 dark:bg-zinc-900/90 backdrop-blur-sm">
        <div className="mx-auto max-w-7xl flex items-center gap-3 px-4 h-14">
          <button
            onClick={() => router.back()}
            className="flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-100 transition-colors"
          >
            <ArrowLeft size={15} /> 返回
          </button>
          <span className="text-zinc-200 dark:text-zinc-700">|</span>
          <span className="font-semibold text-zinc-900 dark:text-zinc-100 text-sm tracking-tight">
            {isEdit ? '编辑题目' : '录入新题目'}
          </span>
          {isEdit && (
            <span className="text-[0.6875rem] px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 font-medium">
              编辑模式
            </span>
          )}

          <div className="ml-auto flex items-center gap-2">
            {errorMsg && (
              <span className="text-xs text-red-500 max-w-[240px] truncate">{errorMsg}</span>
            )}
            <button
              onClick={() => handleSubmit('draft')}
              disabled={isPending}
              className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-40 transition-colors"
            >
              <Save size={13} /> 保存草稿
            </button>
            <button
              onClick={() => handleSubmit('published')}
              disabled={isPending}
              className="flex items-center gap-1.5 text-sm px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white disabled:opacity-40 transition-colors font-medium shadow-sm"
            >
              {isPending
                ? <><Loader2 size={13} className="animate-spin" /> {isEdit ? '更新中…' : '提交中…'}</>
                : <><Send size={13} /> {isEdit ? '更新题目' : '发布题目'}</>
              }
            </button>
          </div>
        </div>
      </header>

      {/* ── 表单主体 ── */}
      <div className="flex-1 mx-auto max-w-7xl w-full px-4 sm:px-6 py-8 space-y-8">

        {/* 题目正文：永久分屏 */}
        <SplitField
          label="题目正文 *"
          value={content}
          onChange={setContent}
          placeholder={`支持 Markdown 与 LaTeX，例如：\n\n已知椭圆 $C:\\dfrac{x^2}{4}+y^2=1$，…\n\n**(1)** 求…\n\n**(2)** 证明…`}
          rows={12}
        />

        {/* 答案 + 解析：可开启分屏预览 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <CollapsibleField
            label="标准答案 *"
            value={answer}
            onChange={setAnswer}
            placeholder="$x=1$ 或 $\dfrac{\sqrt{2}}{2}$…"
          />
          <CollapsibleField
            label="解析"
            value={analysis}
            onChange={setAnalysis}
            placeholder="**第(1)步：**\n\n由条件可得 $f'(x)=\cdots$…"
          />
        </div>

        {/* ── 元数据行 ── */}
        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm px-6 py-5 space-y-5">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-5">

            {/* 题型 */}
            <div className="space-y-1.5">
              <label className="text-[0.6875rem] font-semibold uppercase tracking-widest text-zinc-400">
                题目类型
              </label>
              <select
                value={questionType}
                onChange={e => setQuestionType(e.target.value as QuestionType)}
                className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/60 px-3 py-2 text-sm text-zinc-700 dark:text-zinc-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {QUESTION_TYPES.map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>

            {/* 难度 */}
            <div className="space-y-1.5">
              <label className="text-[0.6875rem] font-semibold uppercase tracking-widest text-zinc-400">
                难度等级
              </label>
              <div className="flex items-center gap-0.5 h-9">
                {([1, 2, 3, 4, 5] as Difficulty[]).map(d => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDifficulty(d)}
                    className={`text-xl leading-none transition-colors ${
                      d <= difficulty
                        ? 'text-amber-400 hover:text-amber-500'
                        : 'text-zinc-200 dark:text-zinc-700 hover:text-amber-300'
                    }`}
                  >
                    ★
                  </button>
                ))}
                <span className="ml-2 text-xs text-zinc-400">{DIFFICULTY_LABELS[difficulty]}</span>
              </div>
            </div>

            {/* 年份 */}
            <div className="space-y-1.5">
              <label className="text-[0.6875rem] font-semibold uppercase tracking-widest text-zinc-400">
                年份
              </label>
              <input
                type="number"
                value={year}
                onChange={e => setYear(e.target.value)}
                min={1977} max={2100}
                placeholder="2024"
                className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/60 px-3 py-2 text-sm text-zinc-700 dark:text-zinc-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* 来源 */}
            <div className="space-y-1.5">
              <label className="text-[0.6875rem] font-semibold uppercase tracking-widest text-zinc-400">
                题目来源
              </label>
              <input
                type="text"
                value={source}
                onChange={e => setSource(e.target.value)}
                placeholder="2024年全国甲卷"
                className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/60 px-3 py-2 text-sm text-zinc-700 dark:text-zinc-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* 知识点 */}
          {topics.length > 0 && (
            <div className="space-y-2 pt-1 border-t border-zinc-100 dark:border-zinc-800">
              <label className="text-[0.6875rem] font-semibold uppercase tracking-widest text-zinc-400">
                绑定知识点
              </label>
              <div className="flex flex-wrap gap-2">
                {topics.map(topic => {
                  const selected = topicIds.includes(topic.id);
                  const isChild  = !!topic.parent_id;
                  return (
                    <button
                      key={topic.id}
                      type="button"
                      onClick={() => toggleTopic(topic.id)}
                      className={[
                        'px-3 py-1 rounded-full text-xs font-medium border transition-all',
                        isChild ? 'ml-3' : '',
                        selected
                          ? 'bg-blue-600 border-blue-600 text-white shadow-sm shadow-blue-200 dark:shadow-blue-900'
                          : 'border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:border-blue-300 dark:hover:border-blue-700 hover:text-blue-600 dark:hover:text-blue-400',
                      ].join(' ')}
                    >
                      {isChild && <span className="opacity-40 mr-1">›</span>}
                      {topic.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
