// 学习热力图（GitHub 贡献图风格）布局 + 连续打卡计算。纯函数、确定性，便于服务端渲染。
// 日期一律用东八区的 yyyy-MM-dd 字符串（绝对日期），日历运算用 UTC 解析避免时区漂移。

export interface HeatCell {
  date: string;
  count: number;
  level: 0 | 1 | 2 | 3 | 4;
}

/** ISO 时间戳 → 东八区 yyyy-MM-dd。 */
export function cnDate(iso: string | Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(typeof iso === 'string' ? new Date(iso) : iso);
}

/** 东八区今天。 */
export function todayCn(): string { return cnDate(new Date()); }

/** yyyy-MM-dd 加 n 天（可负），返回 yyyy-MM-dd。 */
function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const t = Date.UTC(y, m - 1, d) + n * 86400000;
  const dt = new Date(t);
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${dt.getUTCFullYear()}-${mm}-${dd}`;
}

/** 某日历日的星期（0=周日…6=周六），时区无关。 */
function weekday(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

function levelOf(count: number): HeatCell['level'] {
  if (count <= 0) return 0;
  if (count <= 1) return 1;
  if (count <= 3) return 2;
  if (count <= 6) return 3;
  return 4;
}

/**
 * 把「日期→复习次数」铺成周列网格（每列一周，周日在上）。
 * 返回的 weeks 为列数组，每列 7 格（范围外为 null）。
 */
export function buildHeatmapWeeks(
  countByDate: Map<string, number>,
  today: string,
  weeks = 16,
): { grid: (HeatCell | null)[][] } {
  // 起点：回退到 (weeks-1) 周前那一周的周日，使最后一列底部对齐今天。
  const start = addDays(today, -((weeks - 1) * 7 + weekday(today)));
  const grid: (HeatCell | null)[][] = [];
  let col: (HeatCell | null)[] = new Array(7).fill(null);

  let cur = start;
  // 遍历到今天为止。
  for (let i = 0; ; i++) {
    const wd = weekday(cur);
    const count = countByDate.get(cur) ?? 0;
    col[wd] = { date: cur, count, level: levelOf(count) };
    if (wd === 6) { grid.push(col); col = new Array(7).fill(null); } // 周六满列，换列
    if (cur === today) { if (wd !== 6) grid.push(col); break; }
    cur = addDays(cur, 1);
    if (i > weeks * 7 + 14) break; // 安全阀
  }
  return { grid };
}

/** 从「有复习的日期集合」算连续打卡天数（截至今天或昨天仍算延续）。 */
export function computeStreak(dates: Set<string>, today: string): number {
  let streak = 0;
  // 今天没复习也不立刻断：从今天起回溯，允许今天为空但昨天起必须连续。
  let cursor = dates.has(today) ? today : addDays(today, -1);
  if (!dates.has(cursor)) return 0;
  while (dates.has(cursor)) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  return streak;
}
