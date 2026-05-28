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
  /** 相关定理，如 ["韦达定理", "判别式"] */
  related_theorems?: string[];
  /** 常见错误，用于教学提示 */
  common_mistakes?: string[];
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

// ── Supabase 数据库类型（供 createClient<Database> 泛型使用） ─

export interface Database {
  public: {
    Tables: {
      topics: {
        Row:    TopicRow;
        Insert: TopicInsert;
        Update: TopicUpdate;
      };
      questions: {
        Row:    QuestionRow;
        Insert: QuestionInsert;
        Update: QuestionUpdate;
      };
      question_topic_relations: {
        Row:    QuestionTopicRelationRow;
        Insert: QuestionTopicRelationInsert;
        Update: Partial<QuestionTopicRelationInsert>;
      };
    };
    Enums: {
      question_type:   QuestionType;
      question_status: QuestionStatus;
    };
  };
}

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
}

/** 知识点 + 该节点下的题目数量（用于侧边栏统计展示） */
export interface TopicWithCount extends TopicRow {
  question_count: number;
  children: TopicWithCount[];
}
