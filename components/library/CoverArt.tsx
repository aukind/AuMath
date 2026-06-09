import type { LibraryItem } from '@/types/library';
import { imgTransform } from '@/lib/supabase/imageTransform';

// 无真实封面时的精致占位：标题 hash 取一组高级渐变 + 书脊 + 光泽 + 大号书名 + 类型角标。
// 取代此前「浅紫底 + FileText 线框」的劣质占位。

const GRADIENTS = [
  'from-indigo-500 to-violet-600',
  'from-sky-500 to-blue-600',
  'from-emerald-500 to-teal-600',
  'from-rose-500 to-pink-600',
  'from-amber-500 to-orange-600',
  'from-fuchsia-500 to-purple-600',
  'from-cyan-500 to-sky-600',
  'from-violet-500 to-indigo-700',
];

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

type CoverItem = Pick<LibraryItem, 'title' | 'cover_url' | 'resource_type'>;

export default function CoverArt({
  item,
  className = '',
}: {
  item: CoverItem;
  className?: string;
}) {
  if (item.cover_url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={imgTransform(item.cover_url, { width: 320 })}
        alt={item.title}
        loading="lazy"
        className={`w-full bg-zinc-100 object-cover dark:bg-zinc-800 ${className}`}
      />
    );
  }

  const g = GRADIENTS[hashStr(item.title) % GRADIENTS.length];
  return (
    <div className={`relative w-full overflow-hidden bg-gradient-to-br ${g} ${className}`}>
      {/* 书脊 */}
      <div className="absolute inset-y-0 left-0 w-2 bg-black/20" />
      <div className="absolute inset-y-0 left-2 w-px bg-white/40" />
      {/* 光泽 */}
      <div className="absolute -right-6 -top-8 h-24 w-24 rounded-full bg-white/15 blur-xl" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/15 to-transparent" />
      {/* 内容 */}
      <div className="relative flex h-full flex-col justify-between p-3 pl-5">
        <span className="w-fit rounded bg-white/25 px-1.5 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm">
          {item.resource_type}
        </span>
        <span className="line-clamp-3 text-sm font-bold leading-snug text-white drop-shadow">
          {item.title}
        </span>
      </div>
    </div>
  );
}
