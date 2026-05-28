'use client';

import { useRef, useState, useEffect } from 'react';
import { PencilLine, Pencil, Eraser, Trash2, X } from 'lucide-react';

// ── 类型 ──────────────────────────────────────────────────────
type Tool = 'pen' | 'eraser';

// ── 常量 ──────────────────────────────────────────────────────
const PALETTE = [
  { hex: '#0f172a', label: '黑' },
  { hex: '#2563eb', label: '蓝' },
  { hex: '#dc2626', label: '红' },
  { hex: '#16a34a', label: '绿' },
  { hex: '#7c3aed', label: '紫' },
];

// [笔刷直径, 橡皮擦直径]
const SIZE_LEVELS = [
  { pen: 2.5, eraser: 16 },
  { pen: 5,   eraser: 30 },
  { pen: 11,  eraser: 52 },
] as const;

// ── 主组件 ───────────────────────────────────────────────────
export default function CanvasScratchpad() {
  const [open, setOpen]         = useState(false);
  const [tool, setTool]         = useState<Tool>('pen');
  const [colorIdx, setColorIdx] = useState(0);
  const [sizeIdx, setSizeIdx]   = useState(1);

  // ── Canvas refs ────────────────────────────────────────────
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const eraserCurRef = useRef<HTMLDivElement>(null);
  const isDrawing    = useRef(false);
  const prevPos      = useRef<{ x: number; y: number } | null>(null);

  // ── Refs 镜像，让事件回调始终读到最新值（避免 stale closure） ──
  const toolRef     = useRef<Tool>('pen');
  const colorHexRef = useRef(PALETTE[0].hex);
  const sizeIdxRef  = useRef(1);

  useEffect(() => { toolRef.current = tool; },               [tool]);
  useEffect(() => { colorHexRef.current = PALETTE[colorIdx].hex; }, [colorIdx]);
  useEffect(() => { sizeIdxRef.current = sizeIdx; },         [sizeIdx]);

  // ── 初始化 canvas 尺寸（仅一次，保留草稿内容） ──────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
  }, []);

  // ── Esc 关闭 ────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // ── 工具函数 ─────────────────────────────────────────────────
  function ctx() {
    return canvasRef.current?.getContext('2d') ?? null;
  }

  function pos(e: React.PointerEvent<HTMLCanvasElement>) {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  /** 根据当前工具配置 ctx 的合成模式与笔刷 */
  function applyStyle(c: CanvasRenderingContext2D, pressure = 0.5) {
    const lvl = SIZE_LEVELS[sizeIdxRef.current];
    if (toolRef.current === 'eraser') {
      c.globalCompositeOperation = 'destination-out';
      c.lineWidth = lvl.eraser;
    } else {
      c.globalCompositeOperation = 'source-over';
      c.strokeStyle = colorHexRef.current;
      // 压感：轻触细，重按粗（鼠标固定 0.5）
      c.lineWidth = lvl.pen * (0.55 + pressure * 0.9);
    }
    c.lineCap  = 'round';
    c.lineJoin = 'round';
  }

  // ── 绘制事件 ─────────────────────────────────────────────────
  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId); // 跨越边界持续捕获
    isDrawing.current = true;

    const p = pos(e);
    prevPos.current = p;

    const c = ctx();
    if (!c) return;
    applyStyle(c, e.pressure || 0.5);

    // 单点落笔：画一个小圆点
    const r = (c.lineWidth / 2);
    c.beginPath();
    c.arc(p.x, p.y, Math.max(r, 1), 0, Math.PI * 2);
    if (toolRef.current === 'eraser') {
      c.fillStyle = 'rgba(0,0,0,1)'; // destination-out 需要不透明填充才能完整擦除
    } else {
      c.fillStyle = colorHexRef.current;
    }
    c.fill();
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    e.preventDefault();
    const p = pos(e);

    // ── 橡皮擦光标（直接操作 DOM，不触发 React re-render） ─────
    if (eraserCurRef.current) {
      const lvl = SIZE_LEVELS[sizeIdxRef.current];
      const r   = lvl.eraser;
      const el  = eraserCurRef.current;
      if (toolRef.current === 'eraser') {
        el.style.display = 'block';
        el.style.width   = `${r * 2}px`;
        el.style.height  = `${r * 2}px`;
        el.style.left    = `${p.x - r}px`;
        el.style.top     = `${p.y - r}px`;
      } else {
        el.style.display = 'none';
      }
    }

    if (!isDrawing.current || !prevPos.current) return;

    const c = ctx();
    if (!c) return;
    applyStyle(c, e.pressure || 0.5);

    // ── 贝塞尔平滑：以"前一点"为控制点，以"前一点与当前点的中点"为终点 ──
    const mid = {
      x: (prevPos.current.x + p.x) / 2,
      y: (prevPos.current.y + p.y) / 2,
    };
    c.beginPath();
    c.moveTo(prevPos.current.x, prevPos.current.y);
    c.quadraticCurveTo(prevPos.current.x, prevPos.current.y, mid.x, mid.y);
    c.stroke();

    prevPos.current = p;
  }

  function onPointerUp(e: React.PointerEvent<HTMLCanvasElement>) {
    e.preventDefault();
    if (isDrawing.current && prevPos.current) {
      // 补全最后一段到指针实际落点
      const p = pos(e);
      const c = ctx();
      if (c) {
        applyStyle(c, e.pressure || 0.5);
        c.beginPath();
        c.moveTo(prevPos.current.x, prevPos.current.y);
        c.lineTo(p.x, p.y);
        c.stroke();
      }
    }
    isDrawing.current = false;
    prevPos.current   = null;
  }

  function onPointerLeave() {
    isDrawing.current = false;
    prevPos.current   = null;
    if (eraserCurRef.current) eraserCurRef.current.style.display = 'none';
  }

  function clearCanvas() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    ctx()?.clearRect(0, 0, canvas.width, canvas.height);
  }

  // ── 计算橡皮擦圆圈尺寸（用于 div 的初始样式）─────────────────
  const eraserDiameter = SIZE_LEVELS[sizeIdx].eraser * 2;

  // ── 渲染 ─────────────────────────────────────────────────────
  return (
    <>
      {/* ── FAB 浮动按钮 ──────────────────────────────────────── */}
      <button
        onClick={() => setOpen(v => !v)}
        className={[
          'fixed bottom-6 right-6 z-[60]',
          'flex items-center gap-2 px-4 py-3 rounded-2xl text-sm font-semibold',
          'shadow-xl shadow-black/20 transition-all duration-200',
          open
            ? 'bg-zinc-800 dark:bg-zinc-200 text-white dark:text-zinc-900 scale-95'
            : 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 hover:scale-105 hover:shadow-2xl',
        ].join(' ')}
        aria-label={open ? '关闭草稿本' : '打开草稿本'}
      >
        {open ? <X size={15} /> : <PencilLine size={15} />}
        {open ? '关闭草稿' : '草稿本'}
      </button>

      {/* ── 覆盖层 ─────────────────────────────────────────────── */}
      <div
        className={[
          'fixed inset-0 z-[40] transition-opacity duration-200',
          open ? 'opacity-100' : 'opacity-0 pointer-events-none',
        ].join(' ')}
      >
        {/* 极淡方格背景纸（与 canvas 独立，清空不受影响）*/}
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              'linear-gradient(to right, rgba(99,102,241,0.07) 1px, transparent 1px),' +
              'linear-gradient(to bottom, rgba(99,102,241,0.07) 1px, transparent 1px)',
            backgroundSize: '40px 40px',
          }}
        />

        {/* Canvas 绘制层 */}
        <canvas
          ref={canvasRef}
          className={[
            'absolute inset-0',
            open
              ? tool === 'eraser' ? 'cursor-none' : 'cursor-crosshair'
              : 'pointer-events-none',
          ].join(' ')}
          style={{ touchAction: 'none' }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onPointerLeave={onPointerLeave}
        />

        {/* 橡皮擦圆圈光标（直接 DOM 定位，无 re-render）*/}
        <div
          ref={eraserCurRef}
          className="pointer-events-none absolute hidden rounded-full border-[1.5px] border-zinc-500/60 dark:border-zinc-300/60"
          style={{ width: eraserDiameter, height: eraserDiameter }}
        />

        {/* ── 工具栏 ──────────────────────────────────────────── */}
        <div className="pointer-events-none absolute top-4 inset-x-0 flex justify-center z-[50]">
          <div className="pointer-events-auto flex items-center gap-1 px-2.5 py-2 rounded-2xl bg-white/90 dark:bg-zinc-900/90 backdrop-blur-xl border border-zinc-200/80 dark:border-zinc-700/80 shadow-2xl shadow-black/15">

            {/* 画笔 */}
            <ToolBtn active={tool === 'pen'} onClick={() => setTool('pen')} title="画笔">
              <Pencil size={14} />
            </ToolBtn>

            {/* 橡皮擦 */}
            <ToolBtn active={tool === 'eraser'} onClick={() => setTool('eraser')} title="橡皮擦">
              <Eraser size={14} />
            </ToolBtn>

            <Sep />

            {/* 笔刷大小 */}
            {SIZE_LEVELS.map((lvl, i) => (
              <button
                key={i}
                onClick={() => setSizeIdx(i)}
                title={`大小 ${['细', '中', '粗'][i]}`}
                className={[
                  'flex items-center justify-center w-8 h-8 rounded-xl transition-all',
                  sizeIdx === i
                    ? 'bg-zinc-900 dark:bg-zinc-100'
                    : 'hover:bg-zinc-100 dark:hover:bg-zinc-800',
                ].join(' ')}
              >
                <div
                  className={`rounded-full ${sizeIdx === i ? 'bg-white dark:bg-zinc-900' : 'bg-zinc-700 dark:bg-zinc-300'}`}
                  style={{ width: [5, 8, 13][i], height: [5, 8, 13][i] }}
                />
              </button>
            ))}

            <Sep />

            {/* 颜色面板 */}
            {PALETTE.map((c, i) => (
              <button
                key={c.hex}
                onClick={() => { setColorIdx(i); setTool('pen'); }}
                title={c.label}
                className={[
                  'relative w-6 h-6 rounded-full border-2 transition-transform hover:scale-110',
                  colorIdx === i && tool === 'pen'
                    ? 'border-blue-400 scale-110'
                    : 'border-transparent',
                ].join(' ')}
                style={{ backgroundColor: c.hex }}
              />
            ))}

            <Sep />

            {/* 清空 */}
            <ToolBtn onClick={clearCanvas} title="清空画板（保留草稿不关闭）" danger>
              <Trash2 size={14} />
            </ToolBtn>

          </div>
        </div>

        {/* 右下角提示 */}
        <div className="pointer-events-none absolute bottom-6 left-1/2 -translate-x-1/2">
          <p className="text-[0.6875rem] text-zinc-400 dark:text-zinc-600 font-mono tabular-nums select-none">
            按 ESC 关闭草稿本
          </p>
        </div>
      </div>
    </>
  );
}

// ── 子组件 ───────────────────────────────────────────────────
function ToolBtn({
  children,
  active = false,
  onClick,
  title,
  danger = false,
}: {
  children: React.ReactNode;
  active?: boolean;
  onClick: () => void;
  title: string;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={[
        'flex items-center justify-center w-8 h-8 rounded-xl transition-all',
        active
          ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900'
          : danger
          ? 'text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30'
          : 'text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800',
      ].join(' ')}
    >
      {children}
    </button>
  );
}

function Sep() {
  return <div className="w-px h-5 bg-zinc-200 dark:bg-zinc-700 mx-0.5 shrink-0" />;
}
