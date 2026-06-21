// 学习热力图（GitHub 贡献图风格）。服务端纯展示，title 属性给原生悬停提示。
import type { HeatCell } from '@/lib/review/heatmap';

const LEVEL_BG = [
  'bg-zinc-100 dark:bg-zinc-800/60',          // 0
  'bg-emerald-200 dark:bg-emerald-900/70',    // 1
  'bg-emerald-300 dark:bg-emerald-700/80',    // 2
  'bg-emerald-400 dark:bg-emerald-600',       // 3
  'bg-emerald-500 dark:bg-emerald-500',       // 4
];

export default function Heatmap({ grid }: { grid: (HeatCell | null)[][] }) {
  return (
    <div className="overflow-x-auto">
      <div className="flex gap-[3px]">
        {grid.map((week, ci) => (
          <div key={ci} className="flex flex-col gap-[3px]">
            {week.map((cell, ri) => (
              <div
                key={ri}
                title={cell ? `${cell.date} · ${cell.count} 次复习` : ''}
                className={`h-3 w-3 rounded-sm ${cell ? LEVEL_BG[cell.level] : 'bg-transparent'}`}
              />
            ))}
          </div>
        ))}
      </div>
      <div className="mt-2 flex items-center justify-end gap-1 text-[11px] text-zinc-400">
        少
        {LEVEL_BG.map((bg, i) => <span key={i} className={`h-2.5 w-2.5 rounded-sm ${bg}`} />)}
        多
      </div>
    </div>
  );
}
