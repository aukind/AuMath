'use client';

// 自动检测候选：进 crop 阶段时调 DocLayout-YOLO，列出找到的几何图。
// 点某张 → 直接送 Pipeline B（免手动框）。检测不到/想自己框 → 用下方手动裁剪。

import { useEffect, useState } from 'react';
import { Loader2, Sparkles } from 'lucide-react';

import { detectFigures } from '@/app/actions/cv-tikz';
import type { FigureBox } from '@/types/tikz';

export default function AutoDetectStrip({
  imageBase64,
  onPick,
  disabled,
}: {
  imageBase64: string;
  onPick: (cropBase64: string) => void;
  disabled?: boolean;
}) {
  const [state, setState] = useState<
    | { kind: 'loading' }
    | { kind: 'done'; figures: FigureBox[] }
    | { kind: 'error'; message: string }
  >({ kind: 'loading' });

  useEffect(() => {
    let alive = true;
    // 初始态即 'loading'；父组件用 key=src 让本组件随图重挂载，故无需在此同步置 loading
    detectFigures(imageBase64).then((res) => {
      if (!alive) return;
      if (res.success) setState({ kind: 'done', figures: res.figures });
      else setState({ kind: 'error', message: res.error });
    });
    return () => {
      alive = false;
    };
  }, [imageBase64]);

  return (
    <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Sparkles className="h-4 w-4 text-primary" /> 自动检测的几何图
        {state.kind === 'loading' && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
      </div>

      {state.kind === 'error' && (
        <p className="text-xs text-muted-foreground">自动检测不可用（{state.message}）—— 用下方手动框选。</p>
      )}
      {state.kind === 'done' && state.figures.length === 0 && (
        <p className="text-xs text-muted-foreground">未自动检出几何图 —— 用下方手动框选。</p>
      )}
      {state.kind === 'done' && state.figures.length > 0 && (
        <>
          <div className="flex flex-wrap gap-3">
            {state.figures.map((f, i) => (
              <button
                key={i}
                type="button"
                disabled={disabled}
                onClick={() => onPick(f.crop_base64)}
                className="group relative rounded-lg border bg-white p-1 hover:border-primary disabled:opacity-50"
                title={`置信度 ${f.confidence}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`data:image/png;base64,${f.crop_base64}`}
                  alt={`候选图 ${i + 1}`}
                  className="h-28 w-auto max-w-[200px] object-contain"
                />
                <span className="absolute right-1 top-1 rounded bg-black/60 px-1 text-[10px] text-white">
                  {f.confidence}
                </span>
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">点候选图直接识别；置信度低或框不准就用下方手动框选。</p>
        </>
      )}
    </div>
  );
}
