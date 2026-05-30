// AuMath 论坛模块 —— 数据契约 (Data Contract)
//
// 这些接口由架构师定义，是组件 Props 与 SWR 缓存键的唯一真相来源。
// 任何字段调整都应回到此文件，避免组件各自维护「影子类型」。

/** 用户基本信息 */
export interface ForumUser {
  id: string;
  username: string;
  avatarUrl?: string;
  role: 'admin' | 'user';
}

/** 二级回复（楼中楼）—— 针对某条一级回复的追问/补充 */
export interface SubComment {
  id: string;
  /** 关联的一级回复 ID */
  parentId: string;
  /** 选填：若是回复某条子评论，记录目标用户以渲染「回复 @某人」 */
  replyToUserId?: string;
  /** 序列化后的 Lexical JSON 字符串 */
  content: string;
  author: ForumUser;
  createdAt: string;
}

/** 一级回复（楼）—— 对主贴的解答/探讨 */
export interface ForumComment {
  id: string;
  postId: string;
  /** 序列化后的 Lexical JSON 字符串 */
  content: string;
  author: ForumUser;
  createdAt: string;
  upvotes: number;
  /** 挂载的楼中楼数据 */
  subComments: SubComment[];
}

/** 论坛帖子（主贴） */
export interface ForumPost {
  id: string;
  title: string;
  /** 序列化后的 Lexical JSON 字符串 */
  content: string;
  author: ForumUser;
  createdAt: string;
  viewCount: number;
  commentCount: number;
  /** 例如：["微积分", "每日一题"] */
  tags: string[];
}

// ---------------------------------------------------------------------------
// 交互层派生类型
// ---------------------------------------------------------------------------

/**
 * 「单例回复编辑器」的回复目标。
 *
 * 全局只有一个活跃的 Lexical 实例，靠改变此目标在不同评论之间「移动」输入框。
 * - kind='post'    → 在主贴下新建一级回复（楼）
 * - kind='comment' → 在某条一级回复下新建二级回复（楼中楼）
 * - kind='sub'     → 回复某条二级回复（仍落在同一 parentId 下，扁平二级）
 */
export type ReplyTarget =
  | { kind: 'post'; postId: string }
  | {
      kind: 'comment';
      postId: string;
      parentId: string;
      /** 被回复的「楼主」用户名，仅用于占位提示文案 */
      replyToUsername?: string;
    }
  | {
      kind: 'sub';
      postId: string;
      parentId: string;
      replyToUserId: string;
      replyToUsername: string;
    };

/** 当前登录态（mock 提供）。访客为 null。 */
export type SessionUser = ForumUser | null;
