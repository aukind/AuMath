'use client';

import { useEffect } from 'react';
import { Eye } from 'lucide-react';
import { incrementSiteViews } from '@/app/actions/site-stats';

interface SiteViewsBadgeProps {
  initialCount: number;
}

export default function SiteViewsBadge({ initialCount }: SiteViewsBadgeProps) {
  useEffect(() => {
    // One increment per browser session — prevents refresh spam
    const KEY = 'aumath_sv';
    if (sessionStorage.getItem(KEY)) return;
    sessionStorage.setItem(KEY, '1');
    incrementSiteViews().catch(() => {});
  }, []);

  return (
    <div className="flex items-center gap-1.5 px-1 select-none">
      <Eye size={10} className="text-zinc-300 dark:text-zinc-600 shrink-0" />
      <span className="text-[0.6rem] text-zinc-300 dark:text-zinc-600 tabular-nums leading-none">
        累计访问&nbsp;{initialCount.toLocaleString('zh-CN')}&nbsp;次
      </span>
    </div>
  );
}
