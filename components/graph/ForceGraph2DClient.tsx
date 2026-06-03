'use client';

// 仅在客户端经 next/dynamic({ ssr:false }) 加载——react-force-graph-2d 在 import 时即触碰 window。
// next/dynamic 不转发 ref，故这里用普通 React ref 接住实例，再经 onReady 回调上交给上层，
// 上层即可调用 zoomToFit / centerAt / zoom 等命令式 API。
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef } from 'react';
import ForceGraph2D from 'react-force-graph-2d';

export interface ForceGraph2DClientProps {
  onReady?: (fg: any) => void;
  [key: string]: unknown;
}

export default function ForceGraph2DClient({ onReady, ...rest }: ForceGraph2DClientProps) {
  const ref = useRef<any>(null);

  useEffect(() => {
    if (ref.current && onReady) onReady(ref.current);
    // 仅在挂载后上交一次实例即可
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <ForceGraph2D ref={ref as any} {...(rest as any)} />;
}
