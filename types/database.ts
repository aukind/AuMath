// ============================================================
// 数据库类型定义 — 与 supabase/migrations/001_initial_schema.sql 严格对应
// ============================================================

// ── JSONB 子类型 ─────────────────────────────────────────────

/** 变式题，存储于 questions.variations JSONB 数组中的单个元素 */
export interface Variation {
  /** 本地唯一标识，建议使用 crypto.randomUUID() 生成 */
  id: string;
  /** 变式题目正文（Markdown + LaTeX） */
  content: string;
  /** 变式标准答案（可含 LaTeX） */
  answer: string;
  /** 变式详细解析（可选） */
  solution?: string;
  /** 难度等级 1-5，不填则继承原题难度 */
  difficulty?: 1 | 2 | 3 | 4 | 5;
  /** 解题方向提示（可选） */
  hint?: string;
}

// ── 交互式 Rive 沙盒配置 ─────────────────────────────────────

/** 单个可交互控件：数值滑块 / 布尔开关 / 触发按钮 */
export type SandboxControl =
  | {
      input_name: string;
      type: 'number';
      label: string;
      default: number;
      min: number;
      max: number;
      step?: number;
    }
  | {
      input_name: string;
      type: 'boolean';
      label: string;
      default: boolean;
    }
  | {
      input_name: string;
      type: 'trigger';
      label: string;
    };

/** questions.interactive_sandbox JSONB 字段结构 */
export interface InteractiveSandboxConfig {
  /** .riv 文件的完整公开 URL（Supabase Storage 或任意 CDN） */
  asset_path: string;
  /** Rive 状态机名称，必须与文件内定义一致 */
  state_machine: string;
  /** 暴露给学生的控件列表，按数组顺序在 UI 中渲染 */
  controls: SandboxControl[];
}

/** questions.metadata JSONB 字段的结构，可按需扩展 */
export interface QuestionMetadata {
  /** 在原试卷中的题号，如 "第12题" */
  exam_number?: string;
  /** 分值 */
  score?: number;
  /** 建议作答时间（分钟） */
  time_limit_minutes?: number;
  /** 自由标签（补充 topics 树结构之外的灵活分类） */
  tags?: string[];
  /** 选择题选项，如 ["A. ...", "B. ...", "C. ...", "D. ..."] */
  options?: string[] | Record<string, string>;
  /**
   * 选择题子类型：'single'=单项选择，'multi'=多项选择（新高考多选题）。
   * 不进 question_type 枚举（避免 Postgres ENUM 迁移），改存 JSONB；缺省时按答案字母数兜底推断。
   */
  choice_type?: 'single' | 'multi';
  /** 相关定理，如 ["韦达定理", "判别式"] */
  related_theorems?: string[];
  /** 常见错误，用于教学提示 */
  common_mistakes?: string[];
  /** 题源类型：official 官方原题 / community 社区搬运 / derived 改编变式。缺省时按信号推断（见 lib/questions/provenance）。 */
  origin?: 'official' | 'community' | 'derived';
  /** 是否经人工核验（管理员标记），渲染「已核验」徽章。 */
  verified?: boolean;
  /** 开放扩展，允许任意额外字段 */
  [key: string]: unknown;
}

// ── 枚举值（与 PostgreSQL ENUM 对应） ───────────────────────

export type QuestionType =
  | 'multiple_choice' // 选择题
  | 'fill_in_blank'   // 填空题
  | 'calculation'     // 计算/解答题
  | 'proof';          // 证明题

export type QuestionStatus =
  | 'draft'      // 草稿
  | 'published'  // 已发布
  | 'archived';  // 已归档

export type Difficulty = 1 | 2 | 3 | 4 | 5;

// ── 行类型（Row）— 完整读取时的字段形态 ─────────────────────

export interface TopicRow {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  parent_id: string | null;
  level: number;
  order_index: number;
  /** 管理端自定义排序（迁移后新增列），空则回退 order_index */
  sort_order?: number | null;
  created_at: string;
  updated_at: string;
}

export interface QuestionRow {
  id: string;
  content: string;
  answer: string;
  /** 远端数据库实际列名为 analysis */
  analysis: string;
  /** patch 补丁列，默认空字符串，可选 */
  solution?: string;
  question_type: QuestionType;
  difficulty: Difficulty;
  year: number | null;
  source: string | null;
  status: QuestionStatus;
  variations: Variation[];
  metadata: QuestionMetadata;
  /** true = 公共题库（所有人可见）；false = 创建者私有 */
  is_public: boolean;
  /** 创建者的 auth.users.id；管理员题目可为 null */
  created_by: string | null;
  /** 可选：交互式 Rive 沙盒配置，NULL 表示无 */
  interactive_sandbox?: InteractiveSandboxConfig | null;
  /** 众包难度评分聚合（迁移 014）。rating_avg 为生成列；迁移前可能为 undefined。 */
  rating_count?: number;
  rating_sum?: number;
  rating_avg?: number;
  created_at: string;
  updated_at: string;
}

export interface QuestionTopicRelationRow {
  question_id: string;
  topic_id: string;
  is_primary?: boolean;
  created_at?: string;
}

// ── 插入类型（Insert）— 创建新记录时的字段形态 ───────────────

export type TopicInsert = Omit<TopicRow, 'id' | 'created_at' | 'updated_at'> & {
  id?: string;
};

export type QuestionInsert = Omit<QuestionRow, 'id' | 'created_at' | 'updated_at'> & {
  id?: string;
  question_type?: QuestionType;
  difficulty?: Difficulty;
  status?: QuestionStatus;
  variations?: Variation[];
  metadata?: QuestionMetadata;
};

export type QuestionTopicRelationInsert = Omit<QuestionTopicRelationRow, 'created_at'> & {
  is_primary?: boolean;
};

// ── 更新类型（Update）— PATCH 时字段全部可选 ─────────────────

export type TopicUpdate = Partial<TopicInsert>;
export type QuestionUpdate = Partial<QuestionInsert>;

// ── Supabase 数据库类型（自动生成，供 createClient<Database> 泛型使用） ─

export type { Database } from '@/types/supabase';

// ── 联合查询类型（Server Action 返回值常用） ─────────────────

/** 带关联知识点的完整题目 */
export interface QuestionWithTopics extends QuestionRow {
  question_topic_relations: Array<
    QuestionTopicRelationRow & { topics: TopicRow }
  >;
}

/** 带子节点的知识点（用于渲染目录树） */
export interface TopicWithChildren extends TopicRow {
  children: TopicWithChildren[];
  /** 该知识点子树下（含自身）关联的已发布公开题目去重数；侧栏知识点树用，未计算时为 undefined */
  questionCount?: number;
}

/** 知识点 + 该节点下的题目数量（用于侧边栏统计展示） */
export interface TopicWithCount extends TopicRow {
  question_count: number;
  children: TopicWithCount[];
}

// ── 试卷相关类型 ──────────────────────────────────────────────

export type PaperType  = 'real' | 'mock';
export type PaperGrade = 'high_school_1' | 'high_school_2' | 'high_school_3';

export interface PaperRow {
  id: string;
  title: string;
  year: number | null;
  /** 'real' = 高考真题；'mock' = 模拟题。migration 004 前查询的旧数据可能为 undefined */
  type?: PaperType;
  /** 仅模拟题有值，区分高一/高二/高三 */
  grade?: PaperGrade | null;
  /** 'gaokao'(默认) = 高考题库；'competition' = 竞赛（资源大厅）。migration 024 前为 undefined（按 gaokao 处理）。 */
  track?: 'gaokao' | 'competition';
  /** 竞赛分区：'domestic'=国内 / 'international'=国外。仅 track='competition' 有值。 */
  region?: 'domestic' | 'international' | null;
  /** 赛事名，如 'AMC 12A' / 'IMO' / '全国高中数学联赛'。仅竞赛有值。 */
  contest?: string | null;
  created_at: string;
  updated_at: string;
  /** 题目总数，由 getPapers() 聚合计算后附加，DB 中无此列 */
  total_questions?: number;
}

// ── 个人工作区类型 ─────────────────────────────────────────────

export type WorkspaceType = 'favorites' | 'errors' | 'history';

export interface WorkspaceCounts {
  favorites: number;
  errors: number;
  history: number;
}

/** 收藏夹（「我的收藏」分门别类用）。count 为该夹内的收藏题数。 */
export interface FavoriteFolder {
  id: string;
  name: string;
  count: number;
}

/** 收藏夹概览：用户自建的收藏夹列表 + 未分类/总数（驱动「我的收藏」过滤栏）。 */
export interface FavoriteFolderOverview {
  folders: FavoriteFolder[];
  uncategorizedCount: number;
  totalCount: number;
}

/** 收藏夹过滤选择：'all' 全部 · 'uncategorized' 未分类 · 其余为收藏夹 id。 */
export type FavoriteFolderFilter = 'all' | 'uncategorized' | (string & {});

export interface PaperQuestionRow {
  paper_id: string;
  question_id: string;
  question_number: number;
}

/** 带原卷题号的题目（用于整卷视图的有序渲染） */
export interface QuestionWithNumber extends QuestionWithTopics {
  question_number: number;
}
