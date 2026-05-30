'use client';

import {
  useState, useMemo, useCallback,
  useEffect, useRef,
} from 'react';
import dynamic from 'next/dynamic';
import { useTheme } from 'next-themes';
import type { editor as MonacoNS } from 'monaco-editor';
import MathRenderer from '@/components/MathRenderer';
import { ScreenshotToLatexButton } from '@/components/admin/ScreenshotToLatexButton';
import type { ExtractedQuestion, PublishBatchMeta, PublishItemResult } from '@/app/actions/process-paper';
import { publishQuestions } from '@/app/actions/process-paper';
import {
  CheckCircle2, AlertCircle, Loader2, Send,
  RotateCcw, Code2, Eye, BookOpen, Printer,
} from 'lucide-react';

const PAPER_VIEW_KEY = 'aumath_paper_view';

const MonacoEditor = dynamic(
  () => import('@monaco-editor/react').then(m => m.default),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center bg-[#1e1e1e] rounded-lg">
        <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
      </div>
    ),
  },
);

// ── KaTeX + SVG 渲染：复用全站统一的 MathRenderer ───────────────
// 确保预览与正式题库一致（含 SVG 几何图、\limits、\displaystyle 等高考排版）

function MathContent({ children }: { children: string }) {
  return <MathRenderer content={children} />;
}

// ── 知识点颜色 ─────────────────────────────────────────────────

const CATEGORY_COLORS: Record<string, string> = {
  '数列':     'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  '三角':     'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
  '函数与导数': 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
  '解析几何': 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  '立体几何': 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300',
  '概率统计': 'bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300',
};

// ── 右侧预览：单题卡片 ─────────────────────────────────────────

function QuestionPreviewCard({
  question,
  index,
  publishResult,
}: {
  question: ExtractedQuestion;
  index: number;
  publishResult?: PublishItemResult;
}) {
  return (
    <div className="rounded-xl border bg-card p-5 space-y-3 shadow-sm">
      {/* 题头 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-bold text-muted-foreground">
            {question.question_number != null ? `第${question.question_number}题` : `#${index + 1}`}
          </span>
          {question.category && (
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${CATEGORY_COLORS[question.category] ?? 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'}`}>
              {question.category}
            </span>
          )}
        </div>
        {publishResult && (
          publishResult.dbId
            ? <CheckCircle2 className="h-4 w-4 text-green-500" />
            : <span className="text-[10px] text-destructive">{publishResult.error}</span>
        )}
      </div>

      {/* 题目内容 */}
      <div className="border-l-2 border-primary/30 pl-3">
        <MathContent>{question.content || '_（内容为空）_'}</MathContent>
      </div>

      {/* 选项（选择题） */}
      {question.options.length > 0 && (
        <ul className="space-y-2 pl-3">
          {question.options.map((opt, i) => (
            <li key={i}>
              <MathContent>{opt}</MathContent>
            </li>
          ))}
        </ul>
      )}

      {/* 答案 */}
      {question.answer && (
        <div className="rounded-md bg-muted/50 px-3 py-2 text-sm">
          <span className="text-xs font-semibold text-muted-foreground mr-2">答案</span>
          <MathContent>{question.answer}</MathContent>
        </div>
      )}
    </div>
  );
}

// ── 批量元数据表单 ─────────────────────────────────────────────

const GRADE_LABELS: Record<string, string> = {
  high_school_1: '高一',
  high_school_2: '高二',
  high_school_3: '高三',
};

function BatchMetaForm({
  meta, onChange,
}: {
  meta: PublishBatchMeta;
  onChange: (next: PublishBatchMeta) => void;
}) {
  return (
    <div className="flex flex-wrap gap-3 rounded-lg border bg-muted/30 px-4 py-3">
      <label className="flex items-center gap-2 text-sm">
        <span className="text-muted-foreground shrink-0">难度</span>
        <select
          value={meta.difficulty}
          onChange={e => onChange({ ...meta, difficulty: Number(e.target.value) as PublishBatchMeta['difficulty'] })}
          className="rounded border bg-background px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
        >
          {[1, 2, 3, 4, 5].map(d => (
            <option key={d} value={d}>{'★'.repeat(d)}{'☆'.repeat(5 - d)}</option>
          ))}
        </select>
      </label>

      <label className="flex items-center gap-2 text-sm">
        <span className="text-muted-foreground shrink-0">年份</span>
        <input
          type="number"
          placeholder="2025"
          value={meta.year ?? ''}
          onChange={e => onChange({ ...meta, year: e.target.value ? Number(e.target.value) : null })}
          className="w-20 rounded border bg-background px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </label>

      <label className="flex items-center gap-2 text-sm flex-1 min-w-[160px]">
        <span className="text-muted-foreground shrink-0">来源</span>
        <input
          type="text"
          placeholder="如：2024年新高考一卷"
          value={meta.source}
          onChange={e => onChange({ ...meta, source: e.target.value })}
          className="flex-1 rounded border bg-background px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </label>

      <label className="flex items-center gap-2 text-sm">
        <span className="text-muted-foreground shrink-0">类型</span>
        <select
          value={meta.paper_type ?? 'real'}
          onChange={e => {
            const type = e.target.value as 'real' | 'mock';
            onChange({ ...meta, paper_type: type, paper_grade: type === 'real' ? null : meta.paper_grade });
          }}
          className="rounded border bg-background px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
        >
          <option value="real">真题</option>
          <option value="mock">模拟题</option>
        </select>
      </label>

      {(meta.paper_type === 'mock') && (
        <label className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground shrink-0">年级</span>
          <select
            value={meta.paper_grade ?? ''}
            onChange={e => onChange({ ...meta, paper_grade: e.target.value as PublishBatchMeta['paper_grade'] })}
            className="rounded border bg-background px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="">请选择</option>
            {Object.entries(GRADE_LABELS).map(([v, label]) => (
              <option key={v} value={v}>{label}</option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}

// ── 主编辑器组件 ───────────────────────────────────────────────

type PublishState =
  | { status: 'idle' }
  | { status: 'publishing' }
  | { status: 'done'; results: PublishItemResult[]; savedCount: number }
  | { status: 'error'; message: string };

export default function DualPaneEditor({
  initialQuestions,
  initialPaperTitle,
  initialPaperYear,
  initialPaperType,
  initialPaperGrade,
  onReset,
}: {
  initialQuestions:  ExtractedQuestion[];
  initialPaperTitle?: string;
  initialPaperYear?:  number;
  initialPaperType?:  'real' | 'mock';
  initialPaperGrade?: 'high_school_1' | 'high_school_2' | 'high_school_3' | null;
  onReset: () => void;
}) {
  const { resolvedTheme } = useTheme();
  const editorRef = useRef<MonacoNS.IStandaloneCodeEditor | null>(null);

  const [jsonText, setJsonText] = useState(() =>
    JSON.stringify(initialQuestions, null, 2),
  );

  const [previewQuestions, setPreviewQuestions] = useState<ExtractedQuestion[]>(initialQuestions);
  const [parseError, setParseError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [meta, setMeta] = useState<PublishBatchMeta>({
    difficulty:  3,
    year:        initialPaperYear ?? new Date().getFullYear(),
    source:      initialPaperTitle ?? '',
    paper_type:  initialPaperType ?? 'real',
    paper_grade: initialPaperGrade ?? null,
  });

  const [publishState, setPublishState] = useState<PublishState>({ status: 'idle' });

  const handleEditorChange = useCallback((value: string | undefined) => {
    const text = value ?? '';
    setJsonText(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      try {
        const parsed = JSON.parse(text);
        if (!Array.isArray(parsed)) throw new Error('顶层必须是 JSON 数组');
        setPreviewQuestions(parsed as ExtractedQuestion[]);
        setParseError(null);
      } catch (e) {
        setParseError((e as Error).message);
      }
    }, 350);
  }, []);

  const handleEditorMount = useCallback((editor: MonacoNS.IStandaloneCodeEditor) => {
    editorRef.current = editor;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const monaco = (window as any).monaco;
    if (monaco) {
      editor.addCommand(
        monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS,
        () => { editor.getAction('editor.action.formatDocument')?.run(); },
      );
    }
  }, []);

  // Insert a LaTeX snippet (already wrapped as `$…$` or `$$…$$`) at the
  // Monaco caret. The buffer is JSON, so we JSON-escape so the inserted text
  // remains a valid string literal — e.g. `$\frac{1}{2}$` becomes
  // `$\\frac{1}{2}$` in the buffer, and downstream JSON.parse turns it back.
  const insertLatexAtCursor = useCallback((snippet: string) => {
    const editor = editorRef.current;
    if (!editor) return;
    const selection = editor.getSelection();
    if (!selection) return;
    // JSON.stringify(snippet) yields `"…"` with the interior escaped; we drop
    // the surrounding quotes to splice the escaped body into the existing
    // string literal at the cursor.
    const escaped = JSON.stringify(snippet).slice(1, -1);
    editor.executeEdits('screenshot-to-latex', [{
      range: selection,
      text: escaped,
      forceMoveMarkers: true,
    }]);
    editor.focus();
  }, []);

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const monaco = (window as any).monaco;
    if (monaco) {
      monaco.editor.setTheme(resolvedTheme === 'dark' ? 'vs-dark' : 'light');
    }
  }, [resolvedTheme]);

  const handlePublish = useCallback(async () => {
    if (parseError || !previewQuestions.length) return;
    setPublishState({ status: 'publishing' });

    const result = await publishQuestions(previewQuestions, meta);

    if (!result.success) {
      setPublishState({ status: 'error', message: result.error });
      return;
    }

    try {
      sessionStorage.setItem(PAPER_VIEW_KEY, JSON.stringify({ questions: previewQuestions, meta }));
      sessionStorage.removeItem('aumath_paper_draft');
    } catch {}

    setPublishState({
      status: 'done',
      results: result.results,
      savedCount: result.savedCount,
    });
  }, [previewQuestions, meta, parseError]);

  const publishResults = useMemo(() => {
    if (publishState.status !== 'done') return new Map<string, PublishItemResult>();
    return new Map(publishState.results.map(r => [r.localId, r]));
  }, [publishState]);

  const isPublishing = publishState.status === 'publishing';
  const isDone = publishState.status === 'done';
  const questionCount = previewQuestions.length;

  return (
    <div className="flex flex-col gap-4 h-full">
      <BatchMetaForm meta={meta} onChange={setMeta} />

      <div className="grid grid-cols-2 gap-4" style={{ height: 'calc(100vh - 420px)', minHeight: '480px' }}>

        {/* 左栏：Monaco JSON 编辑器 */}
        <div className="flex flex-col rounded-xl border overflow-hidden">
          <div className="flex items-center gap-2 border-b bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
            <Code2 className="h-3.5 w-3.5" />
            <span>JSON 源码编辑</span>
            <ScreenshotToLatexButton onInsert={insertLatexAtCursor} />
            {parseError && (
              <span className="ml-auto flex items-center gap-1 text-destructive">
                <AlertCircle className="h-3 w-3" />
                {parseError.slice(0, 40)}
              </span>
            )}
            {!parseError && (
              <span className="ml-auto text-green-600 dark:text-green-400">
                ✓ {questionCount} 道题
              </span>
            )}
          </div>
          <div className="flex-1">
            <MonacoEditor
              language="json"
              theme={resolvedTheme === 'dark' ? 'vs-dark' : 'light'}
              defaultValue={jsonText}
              onChange={handleEditorChange}
              onMount={handleEditorMount}
              options={{
                minimap:             { enabled: false },
                wordWrap:            'on',
                fontSize:            13,
                lineHeight:          22,
                tabSize:             2,
                formatOnPaste:       true,
                formatOnType:        false,
                scrollBeyondLastLine: false,
                padding:             { top: 12 },
                renderLineHighlight: 'gutter',
              }}
            />
          </div>
        </div>

        {/* 右栏：实时 KaTeX 预览 */}
        <div className="flex flex-col rounded-xl border overflow-hidden">
          <div className="flex items-center gap-2 border-b bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
            <Eye className="h-3.5 w-3.5" />
            <span>排版预览</span>
            {isDone && (
              <span className="ml-auto text-green-600 dark:text-green-400 font-medium">
                已入库 {publishState.savedCount}/{questionCount}
              </span>
            )}
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {parseError ? (
              <div className="flex flex-col items-center gap-3 py-16 text-center text-muted-foreground">
                <AlertCircle className="h-8 w-8 text-destructive/60" />
                <p className="text-sm">JSON 语法错误，请在左侧修正后预览将自动更新</p>
                <code className="text-xs text-destructive bg-destructive/10 px-2 py-1 rounded">{parseError}</code>
              </div>
            ) : previewQuestions.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-16 text-muted-foreground">
                <BookOpen className="h-8 w-8 opacity-40" />
                <p className="text-sm">暂无题目</p>
              </div>
            ) : (
              previewQuestions.map((q, i) => (
                <QuestionPreviewCard
                  key={q.id ?? i}
                  question={q}
                  index={i}
                  publishResult={publishResults.get(q.id)}
                />
              ))
            )}
          </div>
        </div>
      </div>

      {/* 底部操作栏 */}
      <div className="flex items-center justify-between rounded-xl border bg-card px-5 py-3">
        <button
          onClick={onReset}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          重新上传
        </button>

        <div className="flex items-center gap-3">
          {publishState.status === 'error' && (
            <span className="text-sm text-destructive flex items-center gap-1">
              <AlertCircle className="h-4 w-4" /> {publishState.message}
            </span>
          )}
          {isDone && (
            <>
              <span className="text-sm text-green-600 dark:text-green-400">
                成功发布 {publishState.savedCount} 道题，已在题库中可见
              </span>
              <a
                href="/admin/paper"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-700 transition-colors"
              >
                <Printer className="h-4 w-4" />
                查看 / 打印试卷
              </a>
            </>
          )}

          {!isDone && (
            <button
              onClick={handlePublish}
              disabled={isPublishing || !!parseError || questionCount === 0}
              className="flex items-center gap-2 rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground transition-all hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isPublishing ? (
                <><Loader2 className="h-4 w-4 animate-spin" />入库中…</>
              ) : (
                <><Send className="h-4 w-4" />发布入库（{questionCount} 道）</>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
