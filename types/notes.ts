// 用户原子笔记层（迁移 036）契约。实现见 app/actions/notes.ts。

export interface NoteSummary {
  id: string;
  title: string;
  isPublic: boolean;
  updatedAt: string;
  /** 正文纯文本前若干字（去公式/标记），列表预览用 */
  snippet: string;
  /** 该笔记的出链条数（含悬挂） */
  linkCount: number;
  /** 用户给笔记打的标签（存 metadata.tags） */
  tags: string[];
}

/** 笔记的一条出链（已解析或悬挂） */
export interface NoteOutLink {
  targetType: 'topic' | 'theorem' | 'question' | 'note';
  /** 命中实体 id；null=悬挂（写了 [[..]] 但暂无对应实体） */
  targetId: string | null;
  /** 原始链接文本 / 命中实体名 */
  label: string;
}

/** 未链接提及：正文纯文本含、却未建双链的知识点/定理 */
export interface UnlinkedMention {
  type: 'topic' | 'theorem';
  name: string;
}

/** 引用了某实体（或某笔记）的来源笔记 */
export interface NoteBacklink {
  noteId: string;
  noteTitle: string;
}

export interface NoteDetail {
  id: string;
  title: string;
  bodyMd: string;
  isPublic: boolean;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  /** 本笔记 [[维基链接]] 出去的实体 */
  outLinks: NoteOutLink[];
  /** 反向链接：哪些笔记 [[..]] 到了本笔记 */
  backlinks: NoteBacklink[];
}

export type NoteResult<T = unknown> =
  | ({ ok: true } & T)
  | { ok: false; error: string };
