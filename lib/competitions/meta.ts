// 竞赛展示元数据 + 确定性日期格式化（纯函数，服务端/客户端通用，无 locale 依赖避免注水失配）。

export const LEVEL_META: Record<string, { label: string; cls: string }> = {
  gaokao:        { label: '高考',   cls: 'bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300' },
  province:      { label: '省级',   cls: 'bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300' },
  national:      { label: '国家级', cls: 'bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300' },
  international: { label: '国际',   cls: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300' },
  mock:          { label: '模拟',   cls: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400' },
  other:         { label: '其他',   cls: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400' },
};

export function levelMeta(level: string) {
  return LEVEL_META[level] ?? LEVEL_META.other;
}

/** YYYY-MM-DD → 「2026年6月7日」（确定性，不走 toLocale）。 */
export function formatCnDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return `${y}年${m}月${d}日`;
}

const WEEK = ['日', '一', '二', '三', '四', '五', '六'];
export function weekdayCn(iso: string): string {
  const dt = new Date(`${iso}T00:00:00`);
  return Number.isNaN(dt.getTime()) ? '' : `周${WEEK[dt.getDay()]}`;
}

/** 报名截止是否已过（含今天算未过）。 */
export function deadlinePassed(iso: string | null): boolean {
  if (!iso) return false;
  return iso < new Date().toISOString().slice(0, 10);
}
