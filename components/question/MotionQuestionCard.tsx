'use client';

// 题目列表「缩略态」卡片 —— 共享元素转场的源端。
// 复用既有 QuestionCard（保留收藏/解析/标错等全部交互），外层包一层 motion.div 提供
// layoutId 与导航：点击卡片非交互区软导航至 /question/[id]，触发卡片→弹窗 morph。
//
// 导航判定用事件委托：点击若落在卡内交互控件（按钮/链接/评分星/Rive 画布等）上则放行
// 其原行为、不导航；否则 router.push（scroll:false 防重置滚动、保证 morph 原点正确）。

import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import QuestionCard from '@/components/QuestionCard';
import type { QuestionWithTopics } from '@/types/database';
import { cardLayoutId, SHARED_SPRING } from '@/components/motion/SharedCardProps';

const INTERACTIVE_SELECTOR =
  'button, a, input, textarea, select, label, canvas, [role="slider"], [data-no-nav]';

interface MotionQuestionCardProps {
  question: QuestionWithTopics;
  isLoggedIn?: boolean;
  initialFavorited?: boolean;
  initialErrored?: boolean;
  initialMyRating?: number | null;
}

export default function MotionQuestionCard(props: MotionQuestionCardProps) {
  const router = useRouter();
  const { question } = props;

  const handleClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest(INTERACTIVE_SELECTOR)) return;
    router.push(`/question/${question.id}`, { scroll: false });
  };

  return (
    <motion.div
      layoutId={cardLayoutId('question', question.id)}
      transition={SHARED_SPRING}
      onClick={handleClick}
      className="cursor-pointer"
    >
      <QuestionCard {...props} />
    </motion.div>
  );
}
