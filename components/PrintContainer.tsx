'use client';

import { createPortal } from 'react-dom';
import MathRenderer from '@/components/MathRenderer';
import type { QuestionWithTopics, Difficulty } from '@/types/database';

const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  1: '基础',
  2: '进阶',
  3: '中等',
  4: '拔高',
  5: '竞赛',
};

interface Props {
  questions: QuestionWithTopics[];
}

export default function PrintContainer({ questions }: Props) {
  if (questions.length === 0 || typeof window === 'undefined') return null;

  const now = new Date().toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return createPortal(
    <div className="print-portal">
      <div className="print-header">
        <h1>数学练习题</h1>
        <p>共 {questions.length} 道题目 &nbsp;·&nbsp; {now}</p>
      </div>

      {questions.map((q, index) => {
        const primaryTopic = (
          q.question_topic_relations.find(r => r.is_primary) ??
          q.question_topic_relations[0]
        )?.topics;

        return (
          <div key={q.id} className="print-question">
            <div className="print-question-meta">
              <span className="print-question-number">第 {index + 1} 题</span>
              {primaryTopic && <span>{primaryTopic.name}</span>}
              {q.year && <span>{q.year} 年</span>}
              {q.source && <span>{q.source}</span>}
              <span>{DIFFICULTY_LABELS[q.difficulty]}</span>
            </div>

            <div className="print-question-content">
              <MathRenderer content={q.content} />
            </div>

            <div className="print-answer-space" />
          </div>
        );
      })}
    </div>,
    document.body
  );
}
