'use client';

// 众包难度星级：展示全站平均（支持小数的局部填充星），登录用户点击即可评 1–5 星。
// 悬停预览整数星、乐观更新；未登录点击提示登录。数据实时反映本次评分（评分后回读聚合）。

import { useState } from 'react';
import { toast } from 'sonner';
import { rateDifficulty } from '@/app/actions/difficulty';

interface Props {
  questionId: string;
  initialAvg: number;
  initialCount: number;
  initialMyRating: number | null;
  isLoggedIn: boolean;
}

const LABELS = ['', '很简单', '简单', '中等', '较难', '很难'];

export default function DifficultyRating({
  questionId,
  initialAvg,
  initialCount,
  initialMyRating,
  isLoggedIn,
}: Props) {
  const [avg, setAvg] = useState(initialAvg);
  const [count, setCount] = useState(initialCount);
  const [myRating, setMyRating] = useState<number | null>(initialMyRating);
  const [hover, setHover] = useState(0);
  const [pending, setPending] = useState(false);

  // 悬停优先 → 我的评分 → 全站平均
  const display = hover || myRating || avg;

  async function submit(r: number) {
    if (!isLoggedIn) {
      toast.error('请先登录再评难度');
      return;
    }
    if (pending) return;
    setPending(true);
    const prevMy = myRating;
    setMyRating(r); // 乐观
    const res = await rateDifficulty(questionId, r);
    setPending(false);
    if (res.ok) {
      if (typeof res.avg === 'number') setAvg(res.avg);
      if (typeof res.count === 'number') setCount(res.count);
      toast.success(prevMy ? '已更新难度评分' : '感谢评分');
    } else {
      setMyRating(prevMy); // 回滚
      toast.error(res.error ?? '评分失败');
    }
  }

  return (
    <div
      className="flex items-center gap-1.5 shrink-0"
      title={count > 0 ? `${count} 人评 · 平均 ${avg.toFixed(1)} 星` : '还没有人评难度，点星评一下'}
    >
      <div className="flex items-center" onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((i) => {
          const fill = Math.max(0, Math.min(1, display - (i - 1)));
          return (
            <button
              key={i}
              type="button"
              disabled={pending}
              onMouseEnter={() => setHover(i)}
              onClick={(e) => {
                e.preventDefault();
                submit(i);
              }}
              aria-label={`评 ${i} 星（${LABELS[i]}）`}
              className="relative inline-block h-[15px] w-[14px] align-middle disabled:cursor-wait"
            >
              <span className="absolute inset-0 text-[13px] leading-[15px] text-zinc-300 dark:text-zinc-600">
                ★
              </span>
              <span
                className="absolute inset-0 overflow-hidden text-[13px] leading-[15px] text-amber-400"
                style={{ width: `${fill * 100}%` }}
              >
                ★
              </span>
            </button>
          );
        })}
      </div>
      <span className="text-[11px] text-zinc-400 dark:text-zinc-500 tabular-nums">
        {count > 0 ? avg.toFixed(1) : '—'}
        <span className="ml-0.5 opacity-70">({count})</span>
      </span>
    </div>
  );
}
