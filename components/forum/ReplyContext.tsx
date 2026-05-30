'use client';

// 单例回复编辑器的状态中枢
//
// 边缘异常 #1：一个长帖里有上百条评论，若每条「回复」按钮都各自挂载一个 Lexical
// 实例，内存与初始化开销会直接爆炸。解法是「状态提升 + 单例」：
//   - 全局只维护一个 replyTarget（当前要回复谁）。
//   - 整棵评论树共享这一个 FloatingReplyEditor 实例，靠 replyTarget 变化
//     在不同位置「移动」输入框，而非真的销毁/重建编辑器。
//   - CommentItem 只调用 openReply(target)，自身从不实例化编辑器。

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { ReplyTarget } from '@/types/forum';

interface ReplyContextValue {
  /** 当前活跃的回复目标；null 表示编辑器收起。 */
  replyTarget: ReplyTarget | null;
  /** 打开/移动编辑器到指定目标。 */
  openReply: (target: ReplyTarget) => void;
  /** 收起编辑器（提交成功或用户取消时调用）。 */
  closeReply: () => void;
  /** 便捷判断某个目标是否正被回复（用于高亮当前楼层/插入内联输入框）。 */
  isActive: (predicate: (t: ReplyTarget) => boolean) => boolean;
}

const ReplyCtx = createContext<ReplyContextValue | null>(null);

export function ReplyProvider({ children }: { children: ReactNode }) {
  const [replyTarget, setReplyTarget] = useState<ReplyTarget | null>(null);

  const openReply = useCallback((target: ReplyTarget) => setReplyTarget(target), []);
  const closeReply = useCallback(() => setReplyTarget(null), []);
  const isActive = useCallback(
    (predicate: (t: ReplyTarget) => boolean) =>
      replyTarget != null && predicate(replyTarget),
    [replyTarget],
  );

  const value = useMemo(
    () => ({ replyTarget, openReply, closeReply, isActive }),
    [replyTarget, openReply, closeReply, isActive],
  );

  return <ReplyCtx.Provider value={value}>{children}</ReplyCtx.Provider>;
}

export function useReply(): ReplyContextValue {
  const ctx = useContext(ReplyCtx);
  if (!ctx) throw new Error('useReply 必须在 <ReplyProvider> 内使用');
  return ctx;
}
