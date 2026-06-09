'use client';

// 头像裁剪框：拖动平移 + 滑杆缩放，把任意比例的图裁成正方形（512×512 JPEG），
// 正好填满圆形头像，不再因竖图被裁掉上下。无第三方依赖，纯 canvas + pointer 事件。

import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, X, ZoomIn } from 'lucide-react';

const VIEWPORT = 256; // 屏幕取景框边长（圆形预览的外接正方形）
const OUTPUT = 512;   // 导出方图边长

export default function AvatarCropper({
  file,
  onCancel,
  onConfirm,
  busy = false,
}: {
  file: File;
  onCancel: () => void;
  onConfirm: (blob: Blob) => void;
  busy?: boolean;
}) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [baseScale, setBaseScale] = useState(1); // 让图至少铺满取景框的基准缩放（object-cover 同理）
  const [scale, setScale] = useState(1); // 用户缩放，≥1
  const [rawOffset, setRawOffset] = useState({ x: 0, y: 0 }); // 图片左上相对取景框左上（px，未夹紧）
  const drag = useRef<{ px: number; py: number; ox: number; oy: number } | null>(null);

  // 载入选中的图片（onload 异步回调里 setState，不触发 cascading-render 规则）
  useEffect(() => {
    const url = URL.createObjectURL(file);
    const el = new Image();
    el.onload = () => {
      const bs = Math.max(VIEWPORT / el.naturalWidth, VIEWPORT / el.naturalHeight);
      setBaseScale(bs);
      setScale(1);
      setRawOffset({ x: (VIEWPORT - el.naturalWidth * bs) / 2, y: (VIEWPORT - el.naturalHeight * bs) / 2 }); // 初始居中
      setImg(el);
    };
    el.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const displayScale = baseScale * scale;
  const dW = img ? img.naturalWidth * displayScale : 0;
  const dH = img ? img.naturalHeight * displayScale : 0;

  // 约束：图片必须始终盖满取景框（不留空边）。在渲染期由 rawOffset 派生出夹紧后的 offset，
  // 这样缩放变化时无需 effect 回写 state，规避 react-hooks/set-state-in-effect。
  const clamp = useCallback(
    (o: { x: number; y: number }) => ({
      x: Math.min(0, Math.max(VIEWPORT - dW, o.x)),
      y: Math.min(0, Math.max(VIEWPORT - dH, o.y)),
    }),
    [dW, dH],
  );
  const offset = clamp(rawOffset);

  function onPointerDown(e: React.PointerEvent) {
    if (busy) return;
    drag.current = { px: e.clientX, py: e.clientY, ox: offset.x, oy: offset.y };
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!drag.current) return;
    setRawOffset({ x: drag.current.ox + (e.clientX - drag.current.px), y: drag.current.oy + (e.clientY - drag.current.py) });
  }
  function onPointerUp() {
    drag.current = null;
  }

  function handleConfirm() {
    if (!img) return;
    const srcSize = VIEWPORT / displayScale;
    const srcX = -offset.x / displayScale;
    const srcY = -offset.y / displayScale;
    const canvas = document.createElement('canvas');
    canvas.width = OUTPUT;
    canvas.height = OUTPUT;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, srcX, srcY, srcSize, srcSize, 0, 0, OUTPUT, OUTPUT);
    canvas.toBlob((b) => { if (b) onConfirm(b); }, 'image/jpeg', 0.9);
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={busy ? undefined : onCancel} />
      <div className="relative w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-5 shadow-2xl dark:border-zinc-800 dark:bg-zinc-900">
        <button
          onClick={onCancel}
          disabled={busy}
          className="absolute right-4 top-4 rounded-lg p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 disabled:opacity-50 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
        >
          <X size={16} />
        </button>
        <h2 className="mb-4 text-sm font-semibold text-zinc-700 dark:text-zinc-200">调整头像</h2>

        {/* 取景框：拖动平移；圆形蒙版预览最终头像 */}
        <div className="mx-auto" style={{ width: VIEWPORT, height: VIEWPORT }}>
          <div
            className="relative cursor-grab touch-none overflow-hidden rounded-full bg-zinc-100 active:cursor-grabbing dark:bg-zinc-800"
            style={{ width: VIEWPORT, height: VIEWPORT }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            {img && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={img.src}
                alt="裁剪预览"
                draggable={false}
                className="pointer-events-none absolute max-w-none select-none"
                style={{ left: offset.x, top: offset.y, width: dW, height: dH }}
              />
            )}
            {/* 圆环描边，强调可见区域 */}
            <div className="pointer-events-none absolute inset-0 rounded-full ring-1 ring-inset ring-black/10 dark:ring-white/10" />
          </div>
        </div>

        {/* 缩放滑杆 */}
        <div className="mt-4 flex items-center gap-2">
          <ZoomIn size={15} className="shrink-0 text-zinc-400" />
          <input
            type="range"
            min={1}
            max={4}
            step={0.01}
            value={scale}
            disabled={busy}
            onChange={(e) => setScale(Number(e.target.value))}
            className="w-full accent-indigo-600"
          />
        </div>

        <p className="mt-2 text-center text-xs text-zinc-400">拖动图片调整位置，滑杆缩放</p>

        <div className="mt-4 flex gap-2.5">
          <button
            onClick={onCancel}
            disabled={busy}
            className="flex-1 rounded-xl border border-zinc-200 py-2.5 text-sm font-medium text-zinc-600 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
          >
            取消
          </button>
          <button
            onClick={handleConfirm}
            disabled={busy || !img}
            className="flex-1 rounded-xl bg-indigo-600 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            {busy ? <Loader2 size={15} className="mx-auto animate-spin" /> : '确定'}
          </button>
        </div>
      </div>
    </div>
  );
}
