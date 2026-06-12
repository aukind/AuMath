'use client';

// 个人化数据（收藏 / 错题 / 我的难度评分）的 Promise 直通上下文。
// 首页 RSC（app/page.tsx）只创建 promise 不 await，经 PageLayout 由此 Provider 下发；
// QuestionCard 内的星标 / 错题钮 / 评分各自在独立 <Suspense> 里 use() 解包——
// 题面列表（KaTeX 重渲染）先行流式输出，个人化状态后到注水、互不阻塞。
// 无 Provider 的页面（题目详情、FSRS 复习、每日一题等）照旧走同步 initial props。

import { createContext, useContext } from 'react';

export interface PersonalizationPromises {
  /** 当前用户收藏的题目 id 列表（未登录解析为 []） */
  favoritedIds: Promise<string[]>;
  /** 当前用户错题本中的题目 id 列表（未登录解析为 []） */
  erroredIds: Promise<string[]>;
  /** 当前用户的难度评分映射 questionId → 1–5（未登录解析为 {}） */
  myRatings: Promise<Record<string, number>>;
}

const PersonalizationContext = createContext<PersonalizationPromises | null>(null);

export const PersonalizationProvider = PersonalizationContext.Provider;

export function usePersonalization(): PersonalizationPromises | null {
  return useContext(PersonalizationContext);
}
