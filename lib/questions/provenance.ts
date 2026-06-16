// 题源溯源：从题目派生「官方原题 / 社区搬运 / 改编变式」+「已核验」信任信号。
// 对标 MathNet——让「AoPS 论坛搬来」和「官方真题」一眼可分。
//
// 派生策略（零迁移、零回填、即时生效，管理员可显式覆盖）：
//   1. metadata.origin 显式值优先（管理员设的，或官方导入 process-paper 盖的 'official'）。
//   2. 否则按信号推断：
//      - metadata.exam_number 形如 "Problem N"（AoPS 爬虫的英文题号）→ community
//      - 否则有 paper_id（来自真题卷导入）→ official
//      - 否则 → 无（不妄标，手录题不冒充官方）
//   verified 仅取显式 metadata.verified===true（管理员核验）。

import type { QuestionMetadata } from '@/types/database';

export type Origin = 'official' | 'community' | 'derived';

export interface Provenance {
  origin: Origin | null;
  /** origin 是否来自显式 metadata（true）还是信号推断（false）；管理 UI 用来区分「自动」。 */
  explicit: boolean;
  verified: boolean;
}

export interface ProvenanceInput {
  metadata?: QuestionMetadata | null;
  paper_id?: string | null;
}

function isOrigin(v: unknown): v is Origin {
  return v === 'official' || v === 'community' || v === 'derived';
}

export function getProvenance(q: ProvenanceInput): Provenance {
  const m = (q.metadata ?? {}) as QuestionMetadata;
  const explicitOrigin = isOrigin(m.origin) ? m.origin : null;

  let origin: Origin | null = explicitOrigin;
  if (!origin) {
    const examNo = typeof m.exam_number === 'string' ? m.exam_number : '';
    if (/^\s*problem\b/i.test(examNo)) origin = 'community';
    else if (q.paper_id) origin = 'official';
  }

  return { origin, explicit: explicitOrigin !== null, verified: m.verified === true };
}

export const ORIGIN_META: Record<Origin, { label: string; cls: string }> = {
  official:  { label: '官方原题', cls: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300' },
  community: { label: '社区搬运', cls: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300' },
  derived:   { label: '改编变式', cls: 'border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-300' },
};
