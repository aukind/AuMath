// ============================================================
// 知识星图 (Knowledge Graph) — 图数据结构契约
// 前后端序列化解耦：Server Action 仅返回压缩后的 ID + 截断标题，
// 绝不携带 LaTeX 正文（content/answer/analysis）。点击节点再按 ID 查详情。
// ============================================================

export type NodeType = 'topic' | 'question';

/** 题目掌握度，用于前端染色：未做(灰) / 已掌握(绿) / 错题(红) */
export type NodeStatus = 'unattempted' | 'mastered' | 'error_prone';

export interface GraphNode {
  id: string;
  type: NodeType;
  /** 知识点名称，或题目摘要（如 "2024上海卷 第21题"） */
  name: string;
  /** 节点大小权重（Topic > Question） */
  val: number;
  /** 仅 question 节点有；topic 节点为 undefined */
  status?: NodeStatus;
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
  source: string; // question_id
  target: string; // topic_id
}

export interface GraphDataPayload {
  nodes: GraphNode[];
  links: GraphLink[];
}

// ── Server Action 契约（实现见 app/actions/graph.ts） ──
export interface GraphActions {
  /** 获取全站图谱，并按当前登录用户的 user_errors / user_question_attempts 联表计算 status */
  getPersonalizedGraphData(): Promise<GraphDataPayload>;
}
