// ============================================================
// 个人控制台（User Dashboard）数据契约
//
// 这些接口是控制台各组件 Props 的唯一真相来源。后端数据层
// （app/actions/user-profile.ts）负责把 Supabase 中分散的
// 学习数据聚合为此结构；任何字段调整都应回到此文件。
// ============================================================

/** 用户核心统计数据 */
export interface UserStats {
  /** 攻克的难题数 */
  totalSolved: number;
  /** 论坛声望值 */
  forumReputation: number;
  /** 连续学习天数 */
  streakDays: number;
}

/** 动态时间线条目类型（类似 GitHub 的 Feed） */
export type ActivityType = 'solved_problem' | 'created_post' | 'replied' | 'earned_badge';

/** 动态时间线单条记录 */
export interface ActivityFeedItem {
  id: string;
  type: ActivityType;
  title: string;
  description: string;
  /** ISO 8601 格式时间戳 */
  timestamp: string;
  /** 关联的题库知识点或论坛节点 */
  repoOrTopic: string;
}

/** 控制台首屏聚合数据 */
export interface UserProfileData {
  username: string;
  /** ISO 8601 格式注册时间 */
  joinDate: string;
  stats: UserStats;
  recentActivities: ActivityFeedItem[];
}

/** 公开主页统计（仅论坛维度，不暴露刷题量/学习习惯等隐私数据） */
export interface PublicProfileStats {
  /** 发布的主题帖数 */
  posts: number;
  /** 发表的回复数（一级 + 楼中楼） */
  replies: number;
  /** 收到的点赞数（= 论坛声望，自赞不计） */
  likes: number;
}

/** 他人可见的公开主页聚合数据 */
export interface PublicProfileData {
  userId: string;
  username: string;
  /** 数字 UID（按注册时间递增，从 0 起）；profiles 无该行时为 null */
  userNo: number | null;
  avatarUrl?: string;
  role: 'admin' | 'user';
  stats: PublicProfileStats;
  /** 近期公开动态：发布的帖子 + 发表的回复，按时间倒序 */
  recentActivities: ActivityFeedItem[];
}
