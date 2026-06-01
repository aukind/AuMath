'use client';

import { useCallback, useRef, useState } from 'react';
import { Crop, Loader2, Scan } from 'lucide-react';

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 在原图上框选几何区域，裁剪为 PNG（base64，无 data: 前缀）回传。 */
export default function RegionCropper({
  src,
  onCropped,
  busy,
}: {
  src: string;
  onCropped: (base64Png: string) => void;
  busy?: boolean;
}) {
  const imgRef = useRef<HTMLImageElement>(null);
  const dragStart = useRef<{ x: number; y: number } | null>(null);
  const [sel, setSel] = useState<Rect | null>(null);

  const toLocal = (e: React.PointerEvent) => {
    const rect = imgRef.current!.getBoundingClientRect();
    return {
      x: Math.min(Math.max(e.clientX - rect.left, 0), rect.width),
      y: Math.min(Math.max(e.clientY - rect.top, 0), rect.height),
    };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (busy) return;
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    const p = toLocal(e);
    dragStart.current = p;
    setSel({ x: p.x, y: p.y, w: 0, h: 0 });
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragStart.current) return;
    const p = toLocal(e);
    const s = dragStart.current;
    setSel({
      x: Math.min(s.x, p.x),
      y: Math.min(s.y, p.y),
      w: Math.abs(p.x - s.x),
      h: Math.abs(p.y - s.y),
    });
  };

  const onPointerUp = () => {
    dragStart.current = null;
  };

  const crop = useCallback(
    (whole: boolean) => {
      const img = imgRef.current;
      if (!img) return;
      const rect = img.getBoundingClientRect();
      const scaleX = img.naturalWidth / rect.width;
      const scaleY = img.naturalHeight / rect.height;

      let sx = 0;
      let sy = 0;
      let sw = img.naturalWidth;
      let sh = img.naturalHeight;
      if (!whole && sel && sel.w > 4 && sel.h > 4) {
        sx = sel.x * scaleX;
        sy = sel.y * scaleY;
        sw = sel.w * scaleX;
        sh = sel.h * scaleY;
      }

      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(sw));
      canvas.height = Math.max(1, Math.round(sh));
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
      onCropped(canvas.toDataURL('image/png').split(',')[1]);
    },
    [sel, onCropped],
  );

  return (
    <div className="space-y-3">
      <div
        className="relative inline-block max-w-full select-none touch-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img ref={imgRef} src={src} alt="原图" className="max-h-[60vh] w-auto max-w-full rounded-lg border" draggable={false} />
        {sel && sel.w > 0 && (
          <div
            className="pointer-events-none absolute border-2 border-primary bg-primary/10"
            style={{ left: sel.x, top: sel.y, width: sel.w, height: sel.h }}
          />
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy || !sel || sel.w <= 4}
          onClick={() => crop(false)}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Crop className="h-4 w-4" />}
          裁剪所选区域并识别
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => crop(true)}
          className="inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          <Scan className="h-4 w-4" />
          整张图识别
        </button>
      </div>
      <p className="text-xs text-muted-foreground">在图上按住拖动框选几何图区域；或直接「整张图识别」。</p>
    </div>
  );
}
