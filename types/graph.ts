// ============================================================
// 知识星图 (Knowledge Graph) — 图数据结构契约
// 前后端序列化解耦：Server Action 仅返回压缩后的 ID + 截断标题，
// 绝不携带 LaTeX 正文（content/answer/analysis）。点击节点再按 ID 查详情。
//
// Obsidian 化升级：知识点之间也有连边（层级 / 共现 / 手动双链），
// 不再是孤立星团，而是一张真正的知识网。
// ============================================================

export type NodeType = 'topic' | 'question' | 'theorem' | 'note';

/** 题目掌握度，用于前端染色：未做(灰) / 已掌握(绿) / 错题(红) */
export type NodeStatus = 'unattempted' | 'mastered' | 'error_prone';

/**
 * 连边类型：
 * - qt            题目 → 知识点（原有归属边）
 * - hierarchy     知识点父子（topics.parent_id 邻接表派生）
 * - cooccur       知识点共现（两知识点共同出现在同一道题，weight=共享题数，隐式双链）
 * - manual        手动双向链接（topic_links 表，Obsidian 式显式双链）
 * - theorem_topic 定理 → 所属知识点（归属边）
 * - theorem_cite  定理 → 用到它的题目（引用边，题库×定理库的桥）
 * - note_ref      用户笔记 → 它 [[维基链接]] 到的任意节点（知识点/定理/题/别的笔记，个人化层，不缓存）
 */
export type LinkKind = 'qt' | 'hierarchy' | 'cooccur' | 'manual' | 'theorem_topic' | 'theorem_cite' | 'note_ref';

export interface GraphNode {
  id: string;
  type: NodeType;
  /** 知识点名称，或题目摘要（如 "2024上海卷 第21题"） */
  name: string;
  /** 节点大小权重（Topic > Question） */
  val: number;
  /** 仅 question 节点有；topic 节点为 undefined */
  status?: NodeStatus;
  /** 仅 topic 节点有：树深度（0=根），用于色相分层 */
  level?: number;
  /** 仅 topic 节点有：该知识点下挂的题目数 */
  degree?: number;
  // ── d3-force 内部运行时属性（库会写入，读取时可选） ──
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  /** 拖拽固定坐标 */
  fx?: number;
  fy?: number;
}

export interface GraphLink {
  source: string;
  target: string;
  kind: LinkKind;
  /** cooccur 边的共享题数（≥1），其余边为 undefined */
  weight?: number;
}

export interface GraphDataPayload {
  nodes: GraphNode[];
  links: GraphLink[];
}

// ── 知识点 Inspector（Obsidian 式双向链接面板）契约 ──────────

/** 关联知识点条目：手动双链或共现推导 */
export interface RelatedTopicRef {
  id: string;
  name: string;
  /** manual=显式双链；cooccur=共现推导（sharedCount 为共享题数） */
  via: 'manual' | 'cooccur';
  sharedCount?: number;
}

export interface TopicQuestionRef {
  id: string;
  name: string;
  status: NodeStatus;
}

export interface TopicInspectorData {
  id: string;
  name: string;
  description: string | null;
  level: number;
  /** 面包屑：从根到父级（不含自身） */
  ancestors: { id: string; name: string }[];
  /** 子知识点（反向链接的一部分：层级下游） */
  children: { id: string; name: string }[];
  /** 正向/双向链接：手动双链 + 共现推导，按权重降序 */
  related: RelatedTopicRef[];
  /** 反向链接：链接到此知识点的题目（含个人掌握度染色） */
  questions: TopicQuestionRef[];
  /** 本知识点下的定理（定理库联动） */
  theorems: { id: string; name: string }[];
  /** 当前用户是否管理员（决定是否展示双链编辑 UI） */
  canEdit: boolean;
}

// ── 定理 Inspector（定理库联动星图）契约 ──────────────────────

export interface TheoremInspectorData {
  id: string;
  name: string;
  /** 陈述 / 证明（LaTeX，按 ID 现查 theorems 表，不进缓存底图） */
  statement: string;
  proof: string;
  description: string | null;
  figureUrl: string | null;
  /** 所属知识点（归属边） */
  topics: { id: string; name: string }[];
  /** 反向链接：用到此定理的题目（含个人掌握度染色） */
  questions: TopicQuestionRef[];
}

// ── Server Action 契约（实现见 app/actions/graph.ts） ──
export interface GraphActions {
  /** 获取全站图谱，并按当前登录用户的 user_errors / user_question_attempts 联表计算 status */
  getPersonalizedGraphData(): Promise<GraphDataPayload>;
}
