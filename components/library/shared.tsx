// 资源大厅共享小工具：跨组件一致的 layoutId 约定 + 作者头像。

/**
 * 卡片封面 ↔ 阅读器的共享转场 id。书架卡片 / 瀑布流卡片 / ImmersiveReader 三处必须一致。
 * 同一 item.id 在任一渲染中只会出现一次（官方进书架、非官方进瀑布；其他 tab 书架隐藏），
 * 故 layoutId 天然唯一，不会产生「幽灵节点」。
 */
import { imgTransform } from '@/lib/supabase/imageTransform';

export const coverLayoutId = (id: string) => `lib-cover-${id}`;

export function Avatar({ name, url, size = 24 }: { name: string; url?: string; size?: number }) {
  const px = `${size}px`;
  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={imgTransform(url, { width: 128 })}
        alt={name}
        style={{ width: px, height: px }}
        className="rounded-full object-cover"
      />
    );
  }
  return (
    <span
      style={{ width: px, height: px }}
      className="flex items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 text-[11px] font-bold text-white"
    >
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}
