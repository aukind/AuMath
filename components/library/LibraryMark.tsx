import { BookOpenText } from 'lucide-react';

/**
 * 资源大厅统一品牌标识：渐变圆角磁贴 + 白色书形字标（app-icon 质感）。
 * 用于 Hero 横幅 / 顶栏入口 / /library 头部 / 空态，取代此前单调的 lucide 线框图标。
 */
export default function LibraryMark({
  size = 24,
  className = '',
}: {
  size?: number;
  className?: string;
}) {
  return (
    <span
      className={`inline-grid shrink-0 place-items-center rounded-[28%] bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500 text-white shadow-sm ring-1 ring-black/5 ${className}`}
      style={{ width: size, height: size }}
      aria-hidden
    >
      <BookOpenText size={Math.round(size * 0.6)} strokeWidth={2.2} />
    </span>
  );
}
