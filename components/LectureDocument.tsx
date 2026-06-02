// 讲义 PDF 的文档组件 —— 纯展示、无 'use client'、无 hooks，
// 由 app/actions/lecture.ts 在服务端用 renderToStaticMarkup 渲染成 HTML，再交给无头 Chromium 出 PDF。
// 每题的「题干补括号 / 剥内联选项 / 选项网格 / 空壳选项过滤」逻辑与 QuestionCard 完全一致（共用 content.ts）。

import MathRenderer from '@/components/MathRenderer';
import {
  normalizeOptions,
  isBlankOption,
  stripInlineOptionTail,
  withAnswerBlank,
} from '@/lib/questions/content';
import type { Difficulty } from '@/types/database';

/** 客户端已持有全量题目，导出讲义时只需传这份精简投影。 */
export interface LectureQuestion {
  id: string;
  content: string;
  /** 原始 metadata.options，两种形态都兼容 */
  options?: string[] | Record<string, string> | null;
  answer?: string | null;
  analysis?: string | null;
  solution?: string | null;
  source?: string | null;
  year?: number | null;
  difficulty: Difficulty;
  /** 主知识点名（客户端预先从 question_topic_relations 取好） */
  topicName?: string | null;
}

const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  1: '基础',
  2: '进阶',
  3: '中等',
  4: '拔高',
  5: '竞赛',
};

interface Props {
  questions: LectureQuestion[];
  /** true = 教师版（题后附答案/解析）；false = 练习卷（题后留空白解答区） */
  includeAnswers: boolean;
  title?: string;
  dateLabel: string;
}

export default function LectureDocument({ questions, includeAnswers, title, dateLabel }: Props) {
  return (
    <div className="lecture">
      <header className="lec-header">
        <h1>{title || '数学讲义'}</h1>
        <p>
          共 {questions.length} 道题 &nbsp;·&nbsp; {dateLabel}
          {includeAnswers ? ' · 含答案解析' : ''}
        </p>
      </header>

      {questions.map((q, index) => {
        const options = normalizeOptions(q.options);
        const visible = options.filter(o => !isBlankOption(o));
        const isChoice = options.length >= 2;
        // 与 QuestionCard 一致：选择题题干剥掉重复内联选项、补高考式作答括号「（　　）」。
        const stem = isChoice ? withAnswerBlank(stripInlineOptionTail(q.content, true)) : q.content;
        const solution = [q.answer, q.analysis || q.solution].filter(Boolean).join('\n\n---\n\n');

        return (
          <section key={q.id} className="lec-q">
            <div className="lec-meta">
              <span className="lec-num">第 {index + 1} 题</span>
              {q.topicName && <span>{q.topicName}</span>}
              {q.source && <span>{q.source}</span>}
              {q.year && <span>{q.year} 年</span>}
              <span>{DIFFICULTY_LABELS[q.difficulty]}</span>
            </div>

            <div className="lec-stem">
              <MathRenderer content={stem} />
            </div>

            {/* 选项网格 —— 这就是「PDF 选项丢失」的修复点：图形选项题空壳被 isBlankOption 过滤后不渲染空网格 */}
            {visible.length > 0 && (
              <div className={`lec-options ${visible.length <= 2 ? 'lec-options-1' : 'lec-options-2'}`}>
                {visible.map((opt, i) => (
                  <div key={i} className="lec-opt">
                    <MathRenderer content={opt} />
                  </div>
                ))}
              </div>
            )}

            {includeAnswers ? (
              solution ? (
                <div className="lec-answer">
                  <div className="lec-answer-label">答案与解析</div>
                  <MathRenderer content={solution} />
                </div>
              ) : null
            ) : (
              <div className="lec-blank" />
            )}
          </section>
        );
      })}
    </div>
  );
}
