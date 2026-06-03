import Link from 'next/link';
import { Sparkles, Flag, ArrowRight } from 'lucide-react';
import MathRenderer from '@/components/MathRenderer';
import type { QuestionWithTopics } from '@/types/database';

interface DailyChallengeCardProps {
  /** 今日一题；题库为空时为 null。 */
  question: QuestionWithTopics | null;
  /** 错题本待复盘数量，用于右上角角标。 */
  errorsCount: number;
}

/**
 * Hero 大卡内容（服务端组件，纯展示）。
 * 「今日挑战」轻量预览：来源/知识点 + 题干片段（服务端 KaTeX）+「去解答」跳转 /daily。
 * 有错题时右上角挂「错题待复盘 N 道 →」跳转错题本（/?view=mybank&workspace=errors）。
 * 真正的网格 / 光晕 / 网格纹理由外层 BentoCard 提供。
 */
export default function DailyChallengeCard({ question, errorsCount }: DailyChallengeCardProps) {
  const primaryTopic = question
    ? (question.question_topic_relations.find((r) => r.is_primary) ??
        question.question_topic_relations[0])?.topics
    : undefined;

  return (
    <div className="flex h-full flex-col">
      {/* 表头：今日挑战 + 错题角标 */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400">
            <Sparkles size={15} />
          </span>
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">今日挑战</h2>
        </div>
        {errorsCount > 0 && (
          <Link
            href="/?view=mybank&workspace=errors"
            className="inline-flex shrink-0 items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 transition-colors hover:border-amber-300 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-400 dark:hover:border-amber-500/50"
          >
            <Flag size={12} /> 错题待复盘 {errorsCount} 道
            <ArrowRight size={12} />
          </Link>
        )}
      </div>

      {question ? (
        <>
          {/* 来源（完整卷名，含年份）/ 主知识点 */}
          <div className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
            {question.source && (
              <span className="font-medium text-zinc-700 dark:text-zinc-200">{question.source}</span>
            )}
            {primaryTopic && (
              <span className="text-zinc-400 dark:text-zinc-500">· {primaryTopic.name}</span>
            )}
          </div>

          {/* 题干预览：服务端 KaTeX，限高 + CSS mask 底部渐隐（不按字符切，避免截断 LaTeX）。 */}
          <div
            className="mt-3 max-h-44 overflow-hidden"
            style={{
              maskImage: 'linear-gradient(to bottom, #000 62%, transparent)',
              WebkitMaskImage: 'linear-gradient(to bottom, #000 62%, transparent)',
            }}
          >
            <MathRenderer content={question.content} />
          </div>

          {/* 主 CTA —— 贴底 */}
          <div className="mt-auto pt-5">
            <Link
              href="/daily"
              className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              去解答 <ArrowRight size={15} />
            </Link>
          </div>
        </>
      ) : (
        /* 兜底：题库尚无已发布公开题 */
        <div className="mt-4 flex flex-1 flex-col items-start justify-center">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">题库正在扩充中，敬请期待今日新挑战。</p>
          <Link
            href="/"
            className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            浏览题库 <ArrowRight size={15} />
          </Link>
        </div>
      )}
    </div>
  );
}
