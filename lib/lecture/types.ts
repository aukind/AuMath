// 讲义 PDF 的题目精简投影 —— 客户端已持有全量题目，导出时只传这份。
// 独立成无重依赖的模块：客户端组件（QuestionSearch）与服务端渲染（render-pdf）都从这里引类型，
// 避免客户端经 LectureDocument/render-pdf 间接牵入 react-dom/server 或 chromium。

import type { Difficulty } from '@/types/database';

export interface LectureQuestion {
  id: string;
  content: string;
  /** 原始 metadata.options，两种形态都兼容（数组 / 对象） */
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
