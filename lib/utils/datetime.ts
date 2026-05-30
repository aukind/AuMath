// 控制台时间格式化工具 —— 服务端渲染期一次性计算，无需客户端 hydration。

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * 相对时间（中文）：刚刚 / x 分钟前 / x 小时前 / x 天前，
 * 超过一周则回退为绝对日期。非法时间返回空串，便于上层降级。
 */
export function formatRelativeTime(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';

  const diff = Date.now() - t;
  if (diff < 0) return '刚刚';
  if (diff < MINUTE) return '刚刚';
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)} 分钟前`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)} 小时前`;
  if (diff < 7 * DAY) return `${Math.floor(diff / DAY)} 天前`;

  return new Date(t).toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/** 注册日期：精确到月，如「2026 年 5 月」。非法时间返回空串。 */
export function formatJoinDate(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  return new Date(t).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long' });
}
