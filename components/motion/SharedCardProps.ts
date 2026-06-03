// 共享元素转场的数据契约 (Data Contract)
//
// 列表缩略态卡片（MotionPostCard / MotionQuestionCard）与拦截路由展开的
// 详情态（PostDetailView / QuestionDetailView）共用同一组 `layoutId`，
// Framer Motion 在两节点间做 layout 动画实现「卡片放大展开」。
// 所有 layoutId 字符串都由下方 helper 生成，避免各组件手写字符串拼错导致 morph 失效。

export interface SharedCardProps {
  /** 必须全局唯一，作为 layoutId 的基础 */
  id: string;
  title: string;
  author: {
    username: string;
    avatarUrl?: string;
  };
  className?: string;
  /** 决定当前渲染的是列表缩略态还是展开后的详情态 */
  isExpanded?: boolean;
}

/** 共享转场的领域类型：决定 layoutId 命名空间，防止论坛/题目互相串台。 */
export type SharedCardKind = 'forum' | 'question';

/** 容器 layoutId —— 卡片整体 ↔ 模态面板。 */
export const cardLayoutId = (kind: SharedCardKind, id: string) => `${kind}-card-${id}`;

/** 子元素 layoutId —— 标题/头像/日期等共有元素的元素级精准位移。 */
export const avatarLayoutId = (kind: SharedCardKind, id: string) => `${kind}-avatar-${id}`;
export const titleLayoutId = (kind: SharedCardKind, id: string) => `${kind}-title-${id}`;
export const metaLayoutId = (kind: SharedCardKind, id: string) => `${kind}-meta-${id}`;

/** house spring —— 与 components/library/ImmersiveReader.tsx 既定惯用法一致。 */
export const SHARED_SPRING = { type: 'spring', stiffness: 500, damping: 30 } as const;
