'use client';

import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';
import { Printer, ArrowLeft, Eye, EyeOff } from 'lucide-react';
import { svgSchema } from '@/components/MathRenderer';
import type { ExtractedQuestion, PublishBatchMeta } from '@/app/actions/process-paper';

const PAPER_VIEW_KEY = 'aumath_paper_view';

// ── KaTeX 渲染 ─────────────────────────────────────────────────

function Math({ children }: { children: string }) {
  return (
    <span className="
      [&_.katex]:text-[1.05em] [&_.katex]:align-middle
      [&_.katex-display]:my-3 [&_.katex-display]:overflow-x-auto
    ">
      <ReactMarkdown
        remarkPlugins={[remarkMath]}
        rehypePlugins={[
          rehypeRaw,                       // 解析内嵌 <svg> 几何图
          [rehypeSanitize, svgSchema],     // 复用 MathRenderer 的 SVG 白名单
          [rehypeKatex, { throwOnError: false, strict: 'ignore' }],
        ]}
      >
        {children}
      </ReactMarkdown>
    </span>
  );
}

// ── 单道题渲染 ─────────────────────────────────────────────────

function QuestionItem({
  question,
  globalIndex,
  showAnswer,
}: {
  question: ExtractedQuestion;
  globalIndex: number;
  showAnswer: boolean;
}) {
  // 有选项视为选择题
  const isMCQ = question.options.length > 0;

  return (
    <div className="mb-6 break-inside-avoid">
      <div className="flex gap-2">
        <span className="font-semibold shrink-0 text-zinc-800 dark:text-zinc-200 print:text-black">
          {globalIndex}.
        </span>
        <div className="flex-1 min-w-0">
          {/* 知识点标签（屏幕显示，打印时隐藏） */}
          {question.category && (
            <div className="print:hidden mb-1 text-[10px] text-zinc-400 dark:text-zinc-500 font-mono">
              {question.category}
            </div>
          )}

          {/* 题目正文 */}
          <div className="leading-relaxed text-zinc-800 dark:text-zinc-200 print:text-black">
            <Math>{question.content}</Math>
            {isMCQ && (
              <span className="ml-1 text-zinc-400 print:text-zinc-500">（　　）</span>
            )}
          </div>

          {/* 选项 */}
          {question.options.length > 0 && (
            <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 pl-1">
              {question.options.map((opt, i) => (
                <div key={i} className="text-zinc-700 dark:text-zinc-300 print:text-black">
                  <Math>{opt}</Math>
                </div>
              ))}
            </div>
          )}

          {/* 答案（可切换显示） */}
          {showAnswer && question.answer && (
            <div className="mt-2 pl-3 border-l-2 border-emerald-400 print:border-emerald-600">
              <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 print:text-emerald-700 mr-1">
                答案：
              </span>
              <span className="text-sm text-zinc-700 dark:text-zinc-300 print:text-black">
                <Math>{question.answer}</Math>
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── 答案速览表 ─────────────────────────────────────────────────

function AnswerTable({ questions }: { questions: ExtractedQuestion[] }) {
  return (
    <div className="mt-10 border-t-2 border-dashed border-zinc-300 dark:border-zinc-600 print:border-zinc-400 pt-6">
      <h3 className="text-sm font-bold text-zinc-600 dark:text-zinc-400 print:text-zinc-700 mb-4 tracking-widest uppercase">
        参考答案
      </h3>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-8 gap-y-2">
        {questions.map((q, i) => (
          <div key={q.id} className="flex items-start gap-2 text-sm">
            <span className="shrink-0 font-semibold text-zinc-500 dark:text-zinc-400 print:text-zinc-600 w-6 text-right">
              {i + 1}.
            </span>
            <span className="text-zinc-700 dark:text-zinc-300 print:text-black leading-relaxed">
              <Math>{q.answer || '—'}</Math>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── 主页面 ─────────────────────────────────────────────────────

export default function PaperPage() {
  const [questions, setQuestions] = useState<ExtractedQuestion[]>([]);
  const [meta, setMeta] = useState<PublishBatchMeta | null>(null);
  const [showAnswers, setShowAnswers] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    // sessionStorage 只在挂载后可读；放进微任务回调，避免 effect 体内同步 setState
    // 触发级联渲染（react-hooks/set-state-in-effect）。
    queueMicrotask(() => {
      try {
        const raw = sessionStorage.getItem(PAPER_VIEW_KEY);
        if (raw) {
          const { questions: qs, meta: m } = JSON.parse(raw) as {
            questions: ExtractedQuestion[];
            meta: PublishBatchMeta;
          };
          if (Array.isArray(qs)) setQuestions(qs);
          if (m) setMeta(m);
        }
      } catch {}
      setLoaded(true);
    });
  }, []);

  // 按选择题 / 解答题分组，组内按原序
  const mcqItems  = questions.filter(q => q.options.length > 0);
  const essayItems = questions.filter(q => q.options.length === 0);

  // 全局连续编号
  const globalIndexMap = new Map<string, number>();
  let counter = 1;
  for (const q of [...mcqItems, ...essayItems]) {
    globalIndexMap.set(q.id, counter++);
  }

  if (!loaded) {
    return (
      <div className="flex min-h-screen items-center justify-center text-zinc-400">
        加载中…
      </div>
    );
  }

  if (questions.length === 0) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 text-center px-6">
        <p className="text-xl text-zinc-400">没有试卷数据</p>
        <p className="text-sm text-zinc-400">请先在录题工作台发布题目后，再点击&quot;查看试卷&quot;</p>
        <a
          href="/admin/paper-upload"
          className="mt-2 text-sm text-blue-600 hover:underline"
        >
          ← 返回录题工作台
        </a>
      </div>
    );
  }

  const titleParts = [meta?.year, meta?.source].filter(Boolean);
  const paperTitle = titleParts.length > 0 ? titleParts.join(' · ') : '数学试卷';

  return (
    <>
      {/* 顶部操作栏（打印时隐藏） */}
      <div className="print:hidden sticky top-0 z-10 border-b bg-white/95 dark:bg-zinc-900/95 backdrop-blur-sm shadow-sm">
        <div className="mx-auto max-w-4xl flex items-center gap-3 px-6 h-14">
          <a
            href="/admin/paper-upload"
            className="flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            返回
          </a>

          <div className="flex-1" />

          <button
            onClick={() => setShowAnswers(v => !v)}
            className="flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          >
            {showAnswers
              ? <><EyeOff className="h-4 w-4" />隐藏答案</>
              : <><Eye className="h-4 w-4" />显示答案</>
            }
          </button>

          <button
            onClick={() => window.print()}
            className="flex items-center gap-2 rounded-md bg-zinc-900 dark:bg-zinc-100 px-4 py-1.5 text-sm font-medium text-white dark:text-zinc-900 hover:bg-zinc-700 dark:hover:bg-zinc-300 transition-colors"
          >
            <Printer className="h-4 w-4" />
            打印 / 导出 PDF
          </button>
        </div>
      </div>

      {/* 试卷正文（A4 宽度，适合打印） */}
      <div className="mx-auto max-w-4xl px-8 py-10 print:px-10 print:py-8">

        {/* 试卷标题 */}
        <div className="text-center mb-8 print:mb-10">
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 print:text-black tracking-wide">
            {paperTitle}
          </h1>
          {meta && (
            <div className="mt-2 flex justify-center gap-6 text-sm text-zinc-500 dark:text-zinc-400 print:text-zinc-600">
              {meta.year && <span>年份：{meta.year}</span>}
              {meta.source && <span>来源：{meta.source}</span>}
              <span>共 {questions.length} 道题</span>
            </div>
          )}
          <div className="mt-4 border-b-2 border-zinc-900 dark:border-zinc-200 print:border-black" />
        </div>

        {/* 选择题区 */}
        {mcqItems.length > 0 && (
          <section className="mb-8">
            <h2 className="text-base font-bold text-zinc-800 dark:text-zinc-200 print:text-black mb-1">
              一、选择题
            </h2>
            <p className="text-xs text-zinc-400 dark:text-zinc-500 print:text-zinc-600 mb-4">
              （每小题选出答案后，填在相应题号后的括号内）
            </p>
            <div className="space-y-1">
              {mcqItems.map(q => (
                <QuestionItem
                  key={q.id}
                  question={q}
                  globalIndex={globalIndexMap.get(q.id)!}
                  showAnswer={showAnswers}
                />
              ))}
            </div>
          </section>
        )}

        {/* 解答题区 */}
        {essayItems.length > 0 && (
          <section className="mb-8">
            <h2 className="text-base font-bold text-zinc-800 dark:text-zinc-200 print:text-black mb-1">
              {mcqItems.length > 0 ? '二、解答题' : '一、解答题'}
            </h2>
            <p className="text-xs text-zinc-400 dark:text-zinc-500 print:text-zinc-600 mb-4">
              （解答时应写出文字说明、证明过程或演算步骤）
            </p>
            <div className="space-y-1">
              {essayItems.map(q => (
                <QuestionItem
                  key={q.id}
                  question={q}
                  globalIndex={globalIndexMap.get(q.id)!}
                  showAnswer={showAnswers}
                />
              ))}
            </div>
          </section>
        )}

        {/* 答案速览（打印时始终显示） */}
        <div className="print:block hidden">
          <AnswerTable questions={[...mcqItems, ...essayItems]} />
        </div>

        {showAnswers && (
          <div className="print:hidden">
            <AnswerTable questions={[...mcqItems, ...essayItems]} />
          </div>
        )}
      </div>

      <style>{`
        @media print {
          @page { margin: 20mm 18mm; size: A4; }
          body { font-size: 11pt; line-height: 1.6; }
          .break-inside-avoid { break-inside: avoid; }
        }
      `}</style>
    </>
  );
}
