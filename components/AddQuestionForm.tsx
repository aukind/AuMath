'use client';

import { useState, useTransition, useCallback, useRef, type RefObject, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Eye, EyeOff, Loader2, Send, Save, X } from 'lucide-react';
import MathRenderer from '@/components/MathRenderer';
import AiFigureButton from '@/components/admin/AiFigureButton';
import { ScreenshotToLatexButton } from '@/components/admin/ScreenshotToLatexButton';
import QuestionInteractiveSandbox from '@/components/QuestionInteractiveSandbox';
import { createQuestion, updateQuestion } from '@/app/actions/questions';
import { uploadRiveAsset } from '@/app/actions/upload-rive';
import type { QuestionForEdit } from '@/app/actions/questions';
import type { TopicRow, QuestionType, InteractiveSandboxConfig, SandboxControl } from '@/types/database';

const DEFAULT_CONTROLS_TEMPLATE = `[
  {
    "input_name": "Angle",
    "type": "number",
    "label": "角度",
    "default": 0,
    "min": 0,
    "max": 360,
    "step": 1
  }
]`;

// Splice `snippet` into the textarea at its current selection range and place
// the caret right after the insertion so the next keystroke continues editing.
function makeInserter(
  ref: RefObject<HTMLTextAreaElement | null>,
  value: string,
  setValue: (v: string) => void,
) {
  return (snippet: string) => {
    const el = ref.current;
    if (!el) {
      setValue(value + snippet);
      return;
    }
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;
    const next = value.slice(0, start) + snippet + value.slice(end);
    setValue(next);
    // Restore focus + caret after React commits the new value.
    requestAnimationFrame(() => {
      el.focus();
      const caret = start + snippet.length;
      el.setSelectionRange(caret, caret);
    });
  };
}

const QUESTION_TYPES: { value: QuestionType; label: string }[] = [
  { value: 'calculation',     label: '解答题' },
  { value: 'proof',           label: '证明题' },
  { value: 'fill_in_blank',   label: '填空题' },
  { value: 'multiple_choice', label: '选择题' },
];

interface Props {
  topics: Pick<TopicRow, 'id' | 'name' | 'parent_id'>[];
  /** 传入时为编辑模式，表单自动回显该题目的数据 */
  initialData?: QuestionForEdit;
}

// ── 单字段：左编辑 / 右预览 ──────────────────────────────────

function SplitFieldNoLabel({
  value,
  onChange,
  placeholder,
  rows = 10,
  textareaRef,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  rows?: number;
  textareaRef?: RefObject<HTMLTextAreaElement | null>;
}) {
  return (
    <div className="grid grid-cols-2 gap-0 rounded-xl overflow-hidden border border-zinc-200 dark:border-zinc-700 shadow-sm">
      {/* 编辑区 */}
      <div className="relative border-r border-zinc-200 dark:border-zinc-700">
        <div className="absolute top-2 right-3 text-[0.625rem] text-zinc-300 dark:text-zinc-600 select-none pointer-events-none">
          Markdown · LaTeX
        </div>
        <textarea
          ref={textareaRef}
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
  );
}

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
      <SplitFieldNoLabel value={value} onChange={onChange} placeholder={placeholder} rows={rows} />
    </div>
  );
}

// ── 可折叠字段（答案 / 解析） ────────────────────────────────

function CollapsibleField({
  label,
  value,
  onChange,
  placeholder,
  textareaRef,
  headerActions,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  textareaRef?: RefObject<HTMLTextAreaElement | null>;
  headerActions?: ReactNode;
}) {
  const [showPreview, setShowPreview] = useState(false);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[0.6875rem] font-semibold uppercase tracking-widest text-zinc-400">
          {label}
        </span>
        <div className="flex items-center gap-2">
          {headerActions}
          <button
            type="button"
            onClick={() => setShowPreview(v => !v)}
            className="flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors"
          >
            {showPreview ? <EyeOff size={12} /> : <Eye size={12} />}
            {showPreview ? '隐藏预览' : '显示预览'}
          </button>
        </div>
      </div>

      {showPreview ? (
        <div className="grid grid-cols-2 gap-0 rounded-xl overflow-hidden border border-zinc-200 dark:border-zinc-700 shadow-sm">
          <div className="border-r border-zinc-200 dark:border-zinc-700">
            <textarea
              ref={textareaRef}
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
          ref={textareaRef}
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
  const [options,      setOptions]      = useState<string[]>(initialData?.options ?? []);
  const [year,         setYear]         = useState(initialData?.year ? String(initialData.year) : String(new Date().getFullYear()));
  const [source,       setSource]       = useState(initialData?.source ?? '');
  const [topicIds,     setTopicIds]     = useState<string[]>(initialData?.topic_ids ?? []);
  const [errorMsg,     setErrorMsg]     = useState<string | null>(null);
  const [sandbox,      setSandbox]      = useState<InteractiveSandboxConfig | null>(initialData?.interactive_sandbox ?? null);
  const [sandboxError, setSandboxError] = useState<string | null>(null);

  // One textarea ref + inserter per LaTeX field. Refs let the screenshot
  // dialog insert at the actual caret position rather than always appending.
  const contentRef  = useRef<HTMLTextAreaElement | null>(null);
  const answerRef   = useRef<HTMLTextAreaElement | null>(null);
  const analysisRef = useRef<HTMLTextAreaElement | null>(null);
  const insertContent  = makeInserter(contentRef,  content,  setContent);
  const insertAnswer   = makeInserter(answerRef,   answer,   setAnswer);
  const insertAnalysis = makeInserter(analysisRef, analysis, setAnalysis);

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
      year:   year ? parseInt(year, 10) : null,
      source: source.trim() || null,
      topic_ids: topicIds,
      status,
      interactive_sandbox: sandbox,
      options,
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

        {/* 题目正文：永久分屏 + AI 补图按钮 */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[0.6875rem] font-semibold uppercase tracking-widest text-zinc-400">
              题目正文 *
            </span>
            <div className="flex items-center gap-2">
              <ScreenshotToLatexButton onInsert={insertContent} />
              <AiFigureButton content={content} onContentChange={setContent} />
            </div>
          </div>
          <SplitFieldNoLabel
            value={content}
            onChange={setContent}
            textareaRef={contentRef}
            placeholder={`支持 Markdown 与 LaTeX，例如：\n\n已知椭圆 $C:\\dfrac{x^2}{4}+y^2=1$，…\n\n需要画图处插入占位符：\n<!--FIG:椭圆C,长轴沿x轴,焦点F1F2-->\n\n**(1)** 求…\n\n**(2)** 证明…`}
            rows={12}
          />
        </div>

        {/* 答案 + 解析：可开启分屏预览 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <CollapsibleField
            label="标准答案 *"
            value={answer}
            onChange={setAnswer}
            textareaRef={answerRef}
            headerActions={<ScreenshotToLatexButton onInsert={insertAnswer} />}
            placeholder="$x=1$ 或 $\dfrac{\sqrt{2}}{2}$…"
          />
          <CollapsibleField
            label="解析"
            value={analysis}
            onChange={setAnalysis}
            textareaRef={analysisRef}
            headerActions={<ScreenshotToLatexButton onInsert={insertAnalysis} />}
            placeholder="**第(1)步：**\n\n由条件可得 $f'(x)=\cdots$…"
          />
        </div>

        {/* ── 选项（选择题）—— 每行一个选项，支持 LaTeX，实时预览 ── */}
        <OptionsEditor options={options} onChange={setOptions} />

        {/* ── 元数据行 ── */}
        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm px-6 py-5 space-y-5">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-5">

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

        {/* ── 交互式 Rive 沙盒（可选） ── */}
        <SandboxConfigSection
          value={sandbox}
          onChange={setSandbox}
          parseError={sandboxError}
          onParseError={setSandboxError}
        />
      </div>
    </div>
  );
}

// ── 选项编辑子组件（选择题）──────────────────────────────────

const OPTION_LABELS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

function OptionsEditor({
  options,
  onChange,
}: {
  options: string[];
  onChange: (next: string[]) => void;
}) {
  // 新增选项时，自动以 "X. " 起头（与录题入库格式一致，标签写在字符串里）。
  const addOption = () => {
    const label = OPTION_LABELS[options.length] ?? '';
    onChange([...options, label ? `${label}. ` : '']);
  };
  const setOne = (i: number, v: string) =>
    onChange(options.map((o, idx) => (idx === i ? v : o)));
  const removeOne = (i: number) => onChange(options.filter((_, idx) => idx !== i));

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[0.6875rem] font-semibold uppercase tracking-widest text-zinc-400">
          选项（选择题填写，其余题型留空）
        </span>
        <button
          type="button"
          onClick={addOption}
          className="text-xs px-2.5 py-1 rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
        >
          + 添加选项
        </button>
      </div>

      {options.length === 0 ? (
        <p className="text-xs text-zinc-300 dark:text-zinc-600 italic">
          非选择题无需选项；点「添加选项」即可逐个录入（支持 $LaTeX$）。
        </p>
      ) : (
        <div className="space-y-2">
          {options.map((opt, i) => (
            <div key={i} className="flex items-start gap-2">
              <div className="flex-1 grid grid-cols-2 gap-0 rounded-lg overflow-hidden border border-zinc-200 dark:border-zinc-700 shadow-sm">
                <textarea
                  value={opt}
                  onChange={e => setOne(i, e.target.value)}
                  placeholder={`选项 ${OPTION_LABELS[i] ?? ''}，例如 ${OPTION_LABELS[i] ?? 'A'}. $\\dfrac{1}{2}$`}
                  rows={2}
                  className="w-full bg-zinc-50/50 dark:bg-zinc-900/80 px-3 py-2 text-sm font-mono text-zinc-800 dark:text-zinc-200 placeholder:text-zinc-300 dark:placeholder:text-zinc-600 resize-none border-r border-zinc-200 dark:border-zinc-700 focus:outline-none focus:bg-white dark:focus:bg-zinc-900 transition-colors"
                />
                <div className="bg-white dark:bg-zinc-900 px-3 py-2 overflow-x-auto text-sm">
                  {opt.trim()
                    ? <MathRenderer content={opt} />
                    : <span className="text-xs text-zinc-300 dark:text-zinc-600 italic">预览…</span>}
                </div>
              </div>
              <button
                type="button"
                onClick={() => removeOne(i)}
                title="删除该选项"
                className="mt-1.5 flex items-center justify-center w-7 h-7 rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-400 hover:text-red-500 hover:border-red-300 dark:hover:border-red-700 transition-colors shrink-0"
              >
                <X size={13} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── 沙盒配置子组件 ───────────────────────────────────────────

function SandboxConfigSection({
  value,
  onChange,
  parseError,
  onParseError,
}: {
  value: InteractiveSandboxConfig | null;
  onChange: (v: InteractiveSandboxConfig | null) => void;
  parseError: string | null;
  onParseError: (e: string | null) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [controlsDraft, setControlsDraft] = useState<string>(
    value?.controls ? JSON.stringify(value.controls, null, 2) : DEFAULT_CONTROLS_TEMPLATE,
  );

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    const fd = new FormData();
    fd.append('file', file);
    const result = await uploadRiveAsset(fd);
    setUploading(false);
    if (!result.success || !result.url) {
      setUploadError(result.error ?? '上传失败');
      return;
    }
    onChange({
      asset_path: result.url,
      state_machine: value?.state_machine ?? 'State Machine 1',
      controls: value?.controls ?? [],
    });
  }

  function commitControls() {
    if (!value) return;
    try {
      const parsed = JSON.parse(controlsDraft) as SandboxControl[];
      if (!Array.isArray(parsed)) throw new Error('controls 必须是数组');
      onChange({ ...value, controls: parsed });
      onParseError(null);
    } catch (e) {
      onParseError(e instanceof Error ? e.message : '无法解析 JSON');
    }
  }

  if (!value) {
    return (
      <div className="rounded-2xl border border-dashed border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-6 py-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-[0.6875rem] font-semibold uppercase tracking-widest text-zinc-400 mb-1">
              交互式动画沙盒（可选）
            </p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              上传 .riv 文件即可让本题在题目卡片中嵌入可拖动的 Rive 交互动画。
            </p>
          </div>
          <label
            className={[
              'shrink-0 inline-flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg border transition-colors cursor-pointer',
              uploading
                ? 'border-zinc-200 text-zinc-300 cursor-wait'
                : 'border-indigo-200 dark:border-indigo-800 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40',
            ].join(' ')}
          >
            {uploading ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
            {uploading ? '上传中…' : '上传 .riv 文件'}
            <input
              type="file"
              accept=".riv"
              onChange={handleFile}
              disabled={uploading}
              className="sr-only"
            />
          </label>
        </div>
        {uploadError && <p className="mt-2 text-xs text-red-500">{uploadError}</p>}
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-indigo-200 dark:border-indigo-800 bg-white dark:bg-zinc-900 shadow-sm px-6 py-5 space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-[0.6875rem] font-semibold uppercase tracking-widest text-indigo-600 dark:text-indigo-400">
          交互式动画沙盒
        </p>
        <button
          type="button"
          onClick={() => {
            onChange(null);
            onParseError(null);
          }}
          className="text-xs text-zinc-400 hover:text-red-500 transition-colors"
        >
          移除沙盒配置
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label className="text-[0.6875rem] font-semibold uppercase tracking-widest text-zinc-400">
            .riv 资源 URL
          </label>
          <input
            type="text"
            value={value.asset_path}
            onChange={(e) => onChange({ ...value, asset_path: e.target.value })}
            className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/60 px-3 py-2 text-xs font-mono text-zinc-700 dark:text-zinc-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <label
            className={[
              'inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded border transition-colors cursor-pointer',
              uploading
                ? 'border-zinc-200 text-zinc-300 cursor-wait'
                : 'border-zinc-200 dark:border-zinc-700 text-zinc-500 hover:border-indigo-300 hover:text-indigo-600',
            ].join(' ')}
          >
            {uploading ? '上传中…' : '替换文件'}
            <input
              type="file"
              accept=".riv"
              onChange={handleFile}
              disabled={uploading}
              className="sr-only"
            />
          </label>
          {uploadError && <p className="text-xs text-red-500">{uploadError}</p>}
        </div>

        <div className="space-y-1.5">
          <label className="text-[0.6875rem] font-semibold uppercase tracking-widest text-zinc-400">
            状态机名称
          </label>
          <input
            type="text"
            value={value.state_machine}
            onChange={(e) => onChange({ ...value, state_machine: e.target.value })}
            placeholder="State Machine 1"
            className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/60 px-3 py-2 text-sm text-zinc-700 dark:text-zinc-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="text-[0.6875rem] font-semibold uppercase tracking-widest text-zinc-400">
            控件 JSON 配置
          </label>
          <button
            type="button"
            onClick={commitControls}
            className="text-xs px-2 py-1 rounded border border-indigo-200 dark:border-indigo-800 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 transition-colors"
          >
            应用配置
          </button>
        </div>
        <textarea
          value={controlsDraft}
          onChange={(e) => setControlsDraft(e.target.value)}
          rows={10}
          className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/60 px-3 py-2 text-xs font-mono text-zinc-700 dark:text-zinc-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        {parseError && <p className="text-xs text-red-500">JSON 解析错误：{parseError}</p>}
        <p className="text-xs text-zinc-400 dark:text-zinc-500 leading-relaxed">
          每个控件需指定 <code>input_name</code>（与 Rive 内 Input 名一致）、<code>type</code>
          （<code>number</code> | <code>boolean</code> | <code>trigger</code>）、<code>label</code>。
          <code>number</code> 还需 <code>min</code>、<code>max</code>、<code>default</code>。
        </p>
      </div>

      {value.asset_path && (
        <div className="space-y-1.5">
          <p className="text-[0.6875rem] font-semibold uppercase tracking-widest text-zinc-400">
            实时预览
          </p>
          <QuestionInteractiveSandbox config={value} />
        </div>
      )}
    </div>
  );
}
