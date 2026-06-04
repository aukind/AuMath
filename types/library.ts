// AuMath 资源大厅 (Library) 模块 —— 数据契约 (Data Contract)
//
// 这些接口是组件 Props、Server Action 返回值与数据库行投影的唯一真相来源。
// 任何字段调整都应回到此文件，避免各模块自维护「影子类型」。
// 对应迁移：supabase/migrations/018_library_module.sql

/** 资料状态机：已发布（公开流）/ 待审核（举报达阈值自动隐藏）/ 人工隐藏 */
export type LibraryItemStatus = 'published' | 'pending_review' | 'hidden';

/** 大厅筛选维度，对应 AnimatedTabs 的三态 */
export type LibraryFilter = 'all' | 'official' | 'community';

// ── 分类(类型) × 分级(学段) 双维 —— 表单/筛选/校验的单一真相源 ──
// 与 supabase/migrations/019_library_taxonomy.sql 的 CHECK 白名单严格对应。
export const RESOURCE_TYPES = ['教材', '讲义', '试卷真题', '笔记', '答案解析', '其他'] as const;
export const EDU_STAGES = ['初中', '高中', '大学', '竞赛', '考研', '其他'] as const;
export type ResourceType = (typeof RESOURCE_TYPES)[number];
export type EduStage = (typeof EDU_STAGES)[number];

/** 核心数据实体（DB 行 + 作者投影） */
export interface LibraryItem {
  id: string;
  title: string;
  description: string | null;
  /** Supabase Storage 公开 URL（library-pdfs bucket） */
  pdf_url: string;
  /** 封面：自动取 PDF 第1页生成（library-covers bucket），或官方/手动设置；无则为 null */
  cover_url: string | null;
  /** 关联 profiles.id */
  author_id: string;
  /** true: 官方 / 已加精资料；false: UGC */
  is_official: boolean;
  status: LibraryItemStatus;
  view_count: number;
  download_count: number;
  report_count: number;
  /** 点赞数（迁移 020；由 toggle_library_upvote 原子维护） */
  upvote_count: number;
  tags: string[];
  /** 资料类型（见 RESOURCE_TYPES） */
  resource_type: ResourceType;
  /** 学段分级（见 EDU_STAGES） */
  edu_stage: EduStage;
  created_at: string;
  /** 由 profiles 关联投影而来（驼峰化） */
  author?: {
    username: string;
    avatarUrl?: string;
  };
}

// ── 个人 PDF 知识库（迁移 027 user_documents）──────────────────
/** 知识库条目来源：studio 编译产物 / 资源大厅收藏引用 / 直接上传 */
export type KnowledgeDocSource = 'studio' | 'library' | 'upload';

/** 个人知识库一条 PDF（每用户私有）。library 来源为公共资料的引用快照。 */
export interface KnowledgeDoc {
  id: string;
  title: string;
  source: KnowledgeDocSource;
  /** Supabase Storage 公开 URL（studio 自有对象，或 library 资料快照 url） */
  pdf_url: string;
  cover_url: string | null;
  /** library 来源时关联的公共资料 id（用于去重 / 点亮大厅书签态）；其余来源为 null */
  library_item_id: string | null;
  created_at: string;
}

/**
 * tus 续传成功后，浏览器交给 finalize Server Action 的元数据。
 * 文件字节已直传 Storage，这里不再携带 File——只传对象路径与展示信息。
 */
export interface FinalizeUploadInput {
  /** Storage 对象路径，形如 `${uid}/${uuid}.pdf`（服务端会校验 uid 前缀归属） */
  objectName: string;
  title: string;
  description?: string;
  tags?: string[];
  /** 资料类型（白名单外归「其他」） */
  resourceType?: ResourceType;
  /** 学段分级（白名单外归「其他」） */
  eduStage?: EduStage;
}

/**
 * Server Actions 契约约定（app/actions/library.ts）。
 * 各 Action 的实现必须与此签名严格一致，组件只依赖此契约。
 *
 * 注：上传走「浏览器 tus 断点续传直传 Storage + 服务端 finalize 落元数据」两段式
 * （≤5GB 大文件，文件体不经 Next 服务端），故无 `uploadLibraryItem(formData)`。
 */
export interface LibraryActions {
  getLibraryItems(filter: LibraryFilter): Promise<LibraryItem[]>;
  finalizeLibraryUpload(
    input: FinalizeUploadInput,
  ): Promise<{ success: boolean; id?: string; error?: string }>;
  reportItem(itemId: string): Promise<{ success: boolean; hidden?: boolean }>;
  /** Admin only：加精，转为官方精选 */
  promoteItem(itemId: string): Promise<boolean>;
  /**
   * 点赞 / 取消点赞（迁移 020）。原子 toggle，DB 端推导计数。
   * 注：字段名规格作 `upvotes`，但库内计数列统一 `_count`（见 LibraryItem.upvote_count）；
   *     此处返回值用 `upvotes` 贴合规格调用方。
   */
  toggleUpvote(
    itemId: string,
  ): Promise<{ success: boolean; upvoted: boolean; upvotes: number }>;
}
