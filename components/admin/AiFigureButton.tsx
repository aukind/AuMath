'use client';

import { useState, useTransition, useMemo } from 'react';
import { Loader2, ImagePlus, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { generateAllSvgInContent } from '@/app/actions/process-paper';

interface Props {
  content: string;
  onContentChange: (next: string) => void;
}

const FIG_RE = /<!--FIG:([^>]+?)-->/g;

export default function AiFigureButton({ content, onContentChange }: Props) {
  const [isPending, startTransition] = useTransition();
  const [hover, setHover] = useState(false);

  const placeholderCount = useMemo(
    () => Array.from(content.matchAll(FIG_RE)).length,
    [content],
  );

  const hasPlaceholder = placeholderCount > 0;

  function handleGenerate() {
    if (!hasPlaceholder) {
      toast.info('题目正文中没有 <!--FIG:...--> 占位符。\n在需要画图的位置插入 <!--FIG:简短描述--> 即可让 AI 补图');
      return;
    }
    startTransition(async () => {
      const r = await generateAllSvgInContent(content);
      if (!r.success) {
        toast.error(`补图失败：${r.error}`);
        return;
      }
      if (r.replaced === 0) {
        // 把 server action 透传上来的真实原因贴出来，不要再用"网络是否稳定"糊弄
        const first = r.failedReasons[0] ?? '未知原因';
        toast.error(`AI 补图失败：${first}`, { duration: 8000 });
        return;
      }
      onContentChange(r.content);
      const partial = r.failedReasons.length > 0
        ? `（${r.failedReasons.length} 个失败：${r.failedReasons[0]}）`
        : '';
      toast.success(`已生成 ${r.replaced} 个几何图${partial}`);
    });
  }

  return (
    <button
      type="button"
      onClick={handleGenerate}
      disabled={isPending}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      title={hasPlaceholder
        ? `点击为 ${placeholderCount} 个占位符并行生成 SVG 几何图`
        : '在题目正文需要画图的位置插入 <!--FIG:简短描述--> 占位符后再点击'
      }
      className={[
        'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
        hasPlaceholder
          ? 'bg-violet-50 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300 border border-violet-200 dark:border-violet-800/60 hover:bg-violet-100 dark:hover:bg-violet-900/40'
          : 'border border-zinc-200 dark:border-zinc-700 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300',
        isPending && 'opacity-60 cursor-wait',
      ].join(' ')}
    >
      {isPending
        ? <><Loader2 size={12} className="animate-spin" /> 调用 Pro 生成中…</>
        : <>
            {hover && hasPlaceholder
              ? <Sparkles size={12} />
              : <ImagePlus size={12} />}
            AI 补图
            {hasPlaceholder && (
              <span className="ml-0.5 px-1.5 py-0 rounded-full bg-violet-200 dark:bg-violet-900/60 text-[10px] font-semibold leading-tight">
                {placeholderCount}
              </span>
            )}
          </>
      }
    </button>
  );
}
