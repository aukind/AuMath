'use client';

// 备考倒计时。客户端实时跳动；用 mounted 门控避免「服务端无 now / 客户端有 now」的注水失配：
// 挂载前渲染占位破折号（两端一致），挂载后才填真实数字。
// variant='lg' 首屏大倒计时（天/时/分/秒，每秒跳）；'sm' 列表小药丸（仅天，每分钟刷新）。
import { useEffect, useMemo, useState } from 'react';

interface Props {
  examDate: string;            // YYYY-MM-DD
  variant?: 'lg' | 'sm';
  className?: string;
}

function diffParts(target: number, now: number) {
  let ms = target - now;
  const past = ms <= 0;
  ms = Math.max(0, ms);
  return {
    past,
    days: Math.floor(ms / 86_400_000),
    hours: Math.floor((ms % 86_400_000) / 3_600_000),
    mins: Math.floor((ms % 3_600_000) / 60_000),
    secs: Math.floor((ms % 60_000) / 1_000),
  };
}

export default function CompetitionCountdown({ examDate, variant = 'lg', className }: Props) {
  const target = useMemo(() => new Date(`${examDate}T00:00:00`).getTime(), [examDate]);
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    // 首个值经 rAF 异步落（避免 set-state-in-effect 同步调用告警），下一帧即就位；
    // 之后按 variant 周期跳动。挂载前 now=null → 渲染占位破折号，无注水失配。
    const raf = requestAnimationFrame(() => setNow(Date.now()));
    const id = setInterval(() => setNow(Date.now()), variant === 'lg' ? 1_000 : 60_000);
    return () => { cancelAnimationFrame(raf); clearInterval(id); };
  }, [variant]);

  const p = now === null ? null : diffParts(target, now);

  // ── 小药丸：列表卡右上角 ──
  if (variant === 'sm') {
    let label = '—';
    let tone = 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400';
    if (p) {
      if (p.past) { label = '已开考'; }
      else if (p.days === 0) { label = '就在今天'; tone = 'bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300'; }
      else { label = `还有 ${p.days} 天`; tone = p.days <= 7
        ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
        : 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300'; }
    }
    return (
      <span className={['inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums', tone, className ?? ''].join(' ')}>
        {label}
      </span>
    );
  }

  // ── 大倒计时：首屏 Hero ──
  if (p?.past) {
    return <p className={['text-2xl font-bold text-zinc-400', className ?? ''].join(' ')}>已开考 / 进行中</p>;
  }
  const cells: { v: number | null; label: string }[] = [
    { v: p?.days ?? null, label: '天' },
    { v: p?.hours ?? null, label: '时' },
    { v: p?.mins ?? null, label: '分' },
    { v: p?.secs ?? null, label: '秒' },
  ];
  return (
    <div className={['flex items-end gap-2 sm:gap-3', className ?? ''].join(' ')}>
      {cells.map((c, i) => (
        <div key={i} className="flex flex-col items-center">
          <span className="min-w-[2.2ch] rounded-xl bg-zinc-900 px-2.5 py-1.5 text-center text-2xl font-bold tabular-nums text-white shadow-sm dark:bg-zinc-100 dark:text-zinc-900 sm:text-3xl">
            {c.v === null ? '--' : c.label === '天' ? c.v : String(c.v).padStart(2, '0')}
          </span>
          <span className="mt-1 text-[0.65rem] text-zinc-400 dark:text-zinc-500">{c.label}</span>
        </div>
      ))}
    </div>
  );
}
