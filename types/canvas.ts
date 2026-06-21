// 白板 Canvas（迁移 037）契约。data 字段即 { nodes, edges }，对接 @xyflow/react。

/** 节点业务数据（存进 XYFlow node.data）。 */
export interface CanvasNodeData {
  /** text 卡：自由文本（Markdown/LaTeX，渲染走 MathRenderer） */
  text?: string;
  /** note 卡：引用的笔记 id + 标题快照（标题随手改名可能过期，打开时以 id 为准） */
  noteId?: string;
  title?: string;
  /** 卡片底色（可选，便于分组着色） */
  color?: string;
}

export interface CanvasNode {
  id: string;
  type: 'text' | 'note';
  position: { x: number; y: number };
  data: CanvasNodeData;
  width?: number;
  height?: number;
}

export interface CanvasEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
}

export interface CanvasData {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
}

export interface CanvasSummary {
  id: string;
  title: string;
  isPublic: boolean;
  updatedAt: string;
  nodeCount: number;
}

export interface CanvasDoc {
  id: string;
  title: string;
  isPublic: boolean;
  data: CanvasData;
  updatedAt: string;
}

export type CanvasResult<T = unknown> =
  | ({ ok: true } & T)
  | { ok: false; error: string };
