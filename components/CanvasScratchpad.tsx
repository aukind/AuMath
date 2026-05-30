'use client';

import { useRef, useState, useEffect, useCallback } from 'react';
import getStroke from 'perfect-freehand';
import {
  PencilLine, PenLine, Pen, Highlighter, Eraser, Trash2, X,
  Undo2, Redo2, Settings2, Fingerprint,
} from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────
type PenType = 'fountain' | 'ballpoint' | 'highlighter' | 'eraser';
type StrokePoint = [number, number, number]; // [x, y, pressure]
type PenSettings = { size: number; thinning: number; taper: number; streamline: number };

// ── Color Palettes ─────────────────────────────────────────────
const INK_COLORS = ['#0f172a', '#2563eb', '#dc2626', '#16a34a', '#7c3aed'];
const INK_LABELS = ['黑', '蓝', '红', '绿', '紫'];
const HL_COLORS = [
  { fill: '#fde047', alpha: 0.50, label: '黄' },
  { fill: '#f472b6', alpha: 0.45, label: '粉' },
  { fill: '#4ade80', alpha: 0.45, label: '绿' },
  { fill: '#60a5fa', alpha: 0.45, label: '蓝' },
];

// ── GoodNotes-tuned defaults ───────────────────────────────────
const DEFAULT_SETTINGS: Record<PenType, PenSettings> = {
  fountain:    { size: 5.5, thinning: 0.72, taper: 14,  streamline: 0.36 },
  ballpoint:   { size: 2.5, thinning: 0.08, taper: 0,   streamline: 0.55 },
  highlighter: { size: 24,  thinning: 0,    taper: 0,   streamline: 0.30 },
  eraser:      { size: 32,  thinning: 0,    taper: 0,   streamline: 0.40 },
};

const MAX_UNDO = 40;

// ── perfect-freehand config ────────────────────────────────────
function buildStrokeOptions(pen: PenType, s: PenSettings) {
  const base = { smoothing: 0.5, streamline: s.streamline, simulatePressure: false, last: true };
  switch (pen) {
    case 'fountain': return {
      ...base, size: s.size, thinning: s.thinning,
      easing: (t: number) => Math.sin((t * Math.PI) / 2),
      start: { taper: s.taper, cap: true },
      end:   { taper: s.taper, cap: true },
    };
    case 'ballpoint':   return { ...base, size: s.size, thinning: s.thinning, simulatePressure: true };
    case 'highlighter': return { ...base, size: s.size, thinning: 0 };
    case 'eraser':      return { ...base, size: s.size, thinning: 0 };
  }
}

function toPath2D(pts: number[][]): Path2D {
  const p = new Path2D();
  if (!pts.length) return p;
  if (pts.length === 1) { p.arc(pts[0][0], pts[0][1], 1, 0, Math.PI * 2); return p; }
  p.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) p.lineTo(pts[i][0], pts[i][1]);
  p.closePath();
  return p;
}

// ── Main Component ─────────────────────────────────────────────
export default function CanvasScratchpad() {
  const [open, setOpen]               = useState(false);
  const [penType, setPenType]         = useState<PenType>('fountain');
  const [inkIdx, setInkIdx]           = useState(0);
  const [hlIdx, setHlIdx]             = useState(0);
  const [canUndo, setCanUndo]         = useState(false);
  const [canRedo, setCanRedo]         = useState(false);
  const [fingerDrawing, setFingerDrawing] = useState(false);
  const [showSettings, setShowSettings]   = useState(false);
  const [penSettings, setPenSettings]     = useState<Record<PenType, PenSettings>>(DEFAULT_SETTINGS);

  // ── Canvas refs ──────────────────────────────────────────────
  const baseRef      = useRef<HTMLCanvasElement>(null);
  const liveRef      = useRef<HTMLCanvasElement>(null);
  const eraserCurRef = useRef<HTMLDivElement>(null);

  // ── Drawing state refs ───────────────────────────────────────
  const drawing          = useRef(false);
  const drawingPointerId = useRef<number | null>(null); // track which pointer is drawing
  const pts              = useRef<StrokePoint[]>([]);
  const strokeRect       = useRef<DOMRect | null>(null); // cached at stroke start — stable coords
  const undoStack        = useRef<ImageData[]>([]);
  const redoStack        = useRef<ImageData[]>([]);

  // ── DPR ─────────────────────────────────────────────────────
  const dprRef = useRef(1);

  // ── Stale-closure mirrors ─────────────────────────────────────
  const penRef          = useRef(penType);
  const inkRef          = useRef(inkIdx);
  const hlRef           = useRef(hlIdx);
  const settingsRef     = useRef(penSettings);
  const fingerRef       = useRef(fingerDrawing);
  const showSettingsRef = useRef(showSettings);

  // ── Touch-scroll delegation ───────────────────────────────────
  const touchScrollY  = useRef<number | null>(null);
  const touchVelY     = useRef(0);
  const inertiaFrame  = useRef<number | null>(null);

  useEffect(() => { penRef.current = penType; },               [penType]);
  useEffect(() => { inkRef.current = inkIdx; },                [inkIdx]);
  useEffect(() => { hlRef.current  = hlIdx; },                 [hlIdx]);
  useEffect(() => { settingsRef.current = penSettings; },      [penSettings]);
  useEffect(() => { fingerRef.current   = fingerDrawing; },    [fingerDrawing]);
  useEffect(() => { showSettingsRef.current = showSettings; }, [showSettings]);

  // ── Inertia scroll helpers ────────────────────────────────────
  function getScrollTarget(): HTMLElement | null {
    return document.querySelector('main');
  }
  function stopInertia() {
    if (inertiaFrame.current) { cancelAnimationFrame(inertiaFrame.current); inertiaFrame.current = null; }
  }
  function launchInertia(vel: number) {
    stopInertia();
    const target = getScrollTarget();
    if (!target || Math.abs(vel) < 1) return;
    let v = vel;
    function tick() {
      if (Math.abs(v) < 0.4) { inertiaFrame.current = null; return; }
      target!.scrollBy(0, v);
      v *= 0.92;
      inertiaFrame.current = requestAnimationFrame(tick);
    }
    inertiaFrame.current = requestAnimationFrame(tick);
  }

  // ── Canvas init with DPR support ─────────────────────────────
  useEffect(() => {
    const dpr = window.devicePixelRatio || 1;
    dprRef.current = dpr;
    [baseRef, liveRef].forEach(r => {
      if (!r.current) return;
      r.current.width  = window.innerWidth  * dpr;
      r.current.height = window.innerHeight * dpr;
      r.current.getContext('2d')?.scale(dpr, dpr);
    });
  }, []);

  // ── Resize — preserve base drawing, reset live ───────────────
  useEffect(() => {
    const onResize = () => {
      const dpr = window.devicePixelRatio || 1;
      dprRef.current = dpr;

      // Save base content before resize
      const base    = baseRef.current;
      const baseCtx = base?.getContext('2d');
      const saved   = base && baseCtx ? baseCtx.getImageData(0, 0, base.width, base.height) : null;

      [baseRef, liveRef].forEach(r => {
        if (!r.current) return;
        r.current.width  = window.innerWidth  * dpr;
        r.current.height = window.innerHeight * dpr;
        r.current.getContext('2d')?.scale(dpr, dpr);
      });

      if (saved && baseCtx) baseCtx.putImageData(saved, 0, 0);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // ── CSS dimensions helper (accounts for DPR scale on context) ─
  const cssW = () => window.innerWidth;
  const cssH = () => window.innerHeight;

  // ── Color helper ─────────────────────────────────────────────
  function getColor(): string {
    if (penRef.current === 'highlighter') {
      const c = HL_COLORS[hlRef.current];
      const n = parseInt(c.fill.slice(1), 16);
      return `rgba(${(n >> 16) & 0xff},${(n >> 8) & 0xff},${n & 0xff},${c.alpha})`;
    }
    return INK_COLORS[inkRef.current];
  }

  // ── Core render to context ───────────────────────────────────
  function drawToCtx(ctx: CanvasRenderingContext2D, points: StrokePoint[], last = false, alpha = 1) {
    const pen  = penRef.current;
    const opts = buildStrokeOptions(pen, settingsRef.current[pen]);
    const path = toPath2D(getStroke(points, { ...opts, last }));
    ctx.save();
    ctx.globalAlpha = alpha;
    if (pen === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = 'rgba(0,0,0,1)';
    } else if (pen === 'highlighter') {
      ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle = getColor();
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = getColor();
    }
    ctx.fill(path);
    ctx.restore();
  }

  // ── Live canvas render (ink pens) ────────────────────────────
  // Draws real stroke, then a faded predictive extension — same
  // trick GoodNotes uses to eliminate the one-frame lag.
  function renderLive(points: StrokePoint[], predicted: StrokePoint[]) {
    const live = liveRef.current?.getContext('2d');
    if (!live) return;
    live.clearRect(0, 0, cssW(), cssH());
    drawToCtx(live, points, false);
    if (predicted.length > 0 && points.length > 0) {
      // Mini-stroke from last real point → predicted points (faded ghost)
      const lastPt = points[points.length - 1];
      drawToCtx(live, [lastPt, ...predicted], false, 0.45);
    }
  }

  // ── Eraser live render (reset-and-redraw on base) ────────────
  function renderEraserLive(points: StrokePoint[]) {
    const base = baseRef.current?.getContext('2d');
    if (!base) return;
    const saved = undoStack.current[undoStack.current.length - 1];
    if (saved) base.putImageData(saved, 0, 0);
    else base.clearRect(0, 0, cssW(), cssH());
    drawToCtx(base, points, false);
  }

  // ── Undo / Redo ──────────────────────────────────────────────
  const pushUndo = useCallback(() => {
    const base = baseRef.current;
    if (!base) return;
    const ctx = base.getContext('2d');
    if (!ctx) return;
    undoStack.current.push(ctx.getImageData(0, 0, base.width, base.height));
    if (undoStack.current.length > MAX_UNDO) undoStack.current.shift();
    redoStack.current = [];
    setCanUndo(true);
    setCanRedo(false);
  }, []);

  const undo = useCallback(() => {
    const base = baseRef.current;
    if (!base || !undoStack.current.length) return;
    const ctx = base.getContext('2d');
    if (!ctx) return;
    redoStack.current.push(ctx.getImageData(0, 0, base.width, base.height));
    ctx.putImageData(undoStack.current.pop()!, 0, 0);
    setCanUndo(undoStack.current.length > 0);
    setCanRedo(true);
  }, []);

  const redo = useCallback(() => {
    const base = baseRef.current;
    if (!base || !redoStack.current.length) return;
    const ctx = base.getContext('2d');
    if (!ctx) return;
    undoStack.current.push(ctx.getImageData(0, 0, base.width, base.height));
    ctx.putImageData(redoStack.current.pop()!, 0, 0);
    setCanRedo(redoStack.current.length > 0);
    setCanUndo(true);
  }, []);

  const clearCanvas = useCallback(() => {
    const base = baseRef.current;
    if (!base) return;
    pushUndo();
    base.getContext('2d')?.clearRect(0, 0, cssW(), cssH());
  }, [pushUndo]);

  // ── Keyboard shortcuts ───────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setOpen(false); setShowSettings(false); return; }
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo(); else undo();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [undo, redo]);

  useEffect(() => () => { if (inertiaFrame.current) cancelAnimationFrame(inertiaFrame.current); }, []);

  // ── Text selection & callout suppression on open ─────────────
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const s = document.body.style as any;
    const on  = () => { s.userSelect = 'none'; s.webkitUserSelect = 'none'; s.webkitTouchCallout = 'none'; };
    const off = () => { s.userSelect = '';      s.webkitUserSelect = '';      s.webkitTouchCallout = '';      };
    if (open) on(); else off();
    return off;
  }, [open]);

  // ── Eraser cursor (absolute-positioned div, clientX/Y coords) ─
  function updateEraserCursor(clientX: number, clientY: number) {
    const el = eraserCurRef.current;
    if (!el) return;
    if (penRef.current !== 'eraser') { el.style.display = 'none'; return; }
    const r = settingsRef.current.eraser.size;
    el.style.display = 'block';
    el.style.width   = `${r * 2}px`;
    el.style.height  = `${r * 2}px`;
    el.style.left    = `${clientX - r}px`;
    el.style.top     = `${clientY - r}px`;
  }

  // ── Pointer events ───────────────────────────────────────────
  //
  // Core fix: we track drawingPointerId. On iOS, a wrist/palm touch
  // can arrive as a separate pointercancel event. Without pointerId
  // tracking, that cancel would incorrectly abort the active Pencil
  // stroke — this is the main "sometimes can't write" bug.
  //
  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (e.pointerType === 'touch' && !fingerRef.current) {
      stopInertia();
      touchScrollY.current = e.clientY;
      touchVelY.current    = 0;
      return;
    }

    e.preventDefault();
    if (showSettingsRef.current) setShowSettings(false);

    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* ignore */ }

    drawing.current          = true;
    drawingPointerId.current = e.pointerId;
    strokeRect.current       = e.currentTarget.getBoundingClientRect();
    pushUndo();

    const rect     = strokeRect.current;
    const pressure = e.pressure > 0 ? e.pressure : 0.5;
    pts.current    = [[e.clientX - rect.left, e.clientY - rect.top, pressure]];

    if (penRef.current !== 'eraser') {
      const live = liveRef.current?.getContext('2d');
      if (live) {
        live.clearRect(0, 0, cssW(), cssH());
        drawToCtx(live, pts.current, false);
      }
    }
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (e.pointerType === 'touch' && !fingerRef.current) {
      if (touchScrollY.current !== null) {
        const delta = touchScrollY.current - e.clientY;
        touchVelY.current = delta;
        getScrollTarget()?.scrollBy(0, delta);
        touchScrollY.current = e.clientY;
      }
      updateEraserCursor(e.clientX, e.clientY);
      return;
    }

    e.preventDefault();
    updateEraserCursor(e.clientX, e.clientY);

    // Ignore events from other pointers (e.g. wrist hover while Pencil draws)
    if (!drawing.current || e.pointerId !== drawingPointerId.current) return;

    const rect = strokeRect.current ?? e.currentTarget.getBoundingClientRect();

    // Coalesced events: pick up every point the system buffered since last frame
    const coalesced = (e.nativeEvent as PointerEvent).getCoalescedEvents?.() ?? [e.nativeEvent as PointerEvent];
    for (const ce of coalesced) {
      pts.current.push([
        ce.clientX - rect.left,
        ce.clientY - rect.top,
        ce.pressure > 0 ? ce.pressure : 0.5,
      ]);
    }

    if (penRef.current === 'eraser') {
      renderEraserLive(pts.current);
    } else {
      // Predicted events: project where the Pencil is heading right now
      // (native 120Hz ProMotion still has 1-frame lag; prediction eliminates it)
      const predEvts = (e.nativeEvent as PointerEvent).getPredictedEvents?.() ?? [];
      const lastP    = pts.current[pts.current.length - 1];
      const predicted: StrokePoint[] = predEvts.slice(0, 3).map(pe => [
        pe.clientX - rect.left,
        pe.clientY - rect.top,
        pe.pressure > 0 ? pe.pressure : lastP?.[2] ?? 0.5,
      ]);
      renderLive(pts.current, predicted);
    }
  }

  function onPointerUp(e: React.PointerEvent<HTMLCanvasElement>) {
    if (e.pointerType === 'touch' && !fingerRef.current) {
      launchInertia(touchVelY.current);
      touchScrollY.current = null;
      return;
    }

    e.preventDefault();
    if (!drawing.current || e.pointerId !== drawingPointerId.current) return;

    drawing.current          = false;
    drawingPointerId.current = null;

    const rect     = strokeRect.current ?? e.currentTarget.getBoundingClientRect();
    strokeRect.current = null;
    const pressure = e.pressure > 0 ? e.pressure : pts.current[pts.current.length - 1]?.[2] ?? 0.5;
    pts.current.push([e.clientX - rect.left, e.clientY - rect.top, pressure]);

    const base = baseRef.current?.getContext('2d');
    const live = liveRef.current?.getContext('2d');

    if (penRef.current === 'eraser') {
      if (base) {
        const saved = undoStack.current[undoStack.current.length - 1];
        if (saved) base.putImageData(saved, 0, 0);
        else base.clearRect(0, 0, cssW(), cssH());
        drawToCtx(base, pts.current, true);
      }
    } else {
      if (base) drawToCtx(base, pts.current, true);
      if (live) live.clearRect(0, 0, cssW(), cssH());
    }
    pts.current = [];
  }

  function onPointerCancel(e: React.PointerEvent<HTMLCanvasElement>) {
    stopInertia();
    touchScrollY.current = null;

    // Only cancel the active drawing pointer, never wrist/palm cancel events
    if (!drawing.current || e.pointerId !== drawingPointerId.current) return;

    drawing.current          = false;
    drawingPointerId.current = null;
    pts.current              = [];
    strokeRect.current       = null;

    const base = baseRef.current?.getContext('2d');
    const live = liveRef.current?.getContext('2d');
    if (base) {
      const saved = undoStack.current.pop();
      if (saved) base.putImageData(saved, 0, 0);
      else base.clearRect(0, 0, cssW(), cssH());
      setCanUndo(undoStack.current.length > 0);
    }
    if (live) live.clearRect(0, 0, cssW(), cssH());
  }

  function onPointerLeave(e: React.PointerEvent<HTMLCanvasElement>) {
    if (touchScrollY.current !== null) {
      launchInertia(touchVelY.current);
      touchScrollY.current = null;
    }
    if (!drawing.current || e.pointerId !== drawingPointerId.current) {
      if (eraserCurRef.current) eraserCurRef.current.style.display = 'none';
      return;
    }
    const base = baseRef.current?.getContext('2d');
    const live = liveRef.current?.getContext('2d');
    if (penRef.current !== 'eraser' && base && pts.current.length > 0) {
      drawToCtx(base, pts.current, true);
    }
    if (live) live.clearRect(0, 0, cssW(), cssH());
    drawing.current          = false;
    drawingPointerId.current = null;
    pts.current              = [];
    strokeRect.current       = null;
    if (eraserCurRef.current) eraserCurRef.current.style.display = 'none';
  }

  // ── Settings helpers ─────────────────────────────────────────
  function updateSetting(pen: PenType, key: keyof PenSettings, value: number) {
    setPenSettings(prev => ({ ...prev, [pen]: { ...prev[pen], [key]: value } }));
  }
  function resetSettings(pen: PenType) {
    setPenSettings(prev => ({ ...prev, [pen]: DEFAULT_SETTINGS[pen] }));
  }

  // ── Derived UI ───────────────────────────────────────────────
  const isHl            = penType === 'highlighter';
  const palette         = isHl
    ? HL_COLORS.map(c => ({ hex: c.fill, label: c.label }))
    : INK_COLORS.map((hex, i) => ({ hex, label: INK_LABELS[i] }));
  const currentColorIdx = isHl ? hlIdx : inkIdx;
  const setColorIdx     = isHl ? setHlIdx : setInkIdx;
  const curSettings     = penSettings[penType];
  const eraserDiam      = penSettings.eraser.size * 2;

  const PEN_LABELS: Record<PenType, string> = {
    fountain: '钢笔', ballpoint: '圆珠笔', highlighter: '荧光笔', eraser: '橡皮擦',
  };

  // ── Render ───────────────────────────────────────────────────
  return (
    <>
      {/* FAB */}
      <button
        onClick={() => { setOpen(v => !v); setShowSettings(false); }}
        className={[
          'fixed bottom-6 right-6 z-[60] flex items-center gap-2 px-4 py-3 rounded-2xl text-sm font-semibold',
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

      {/* ── Full-screen overlay ── */}
      <div
        className={[
          'fixed inset-0 z-[40] transition-opacity duration-200',
          open ? 'opacity-100' : 'opacity-0 pointer-events-none',
        ].join(' ')}
      >
        {/* Grid paper background */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage:
              'linear-gradient(to right, rgba(99,102,241,0.07) 1px, transparent 1px),' +
              'linear-gradient(to bottom, rgba(99,102,241,0.07) 1px, transparent 1px)',
            backgroundSize: '40px 40px',
          }}
        />

        {/* Base canvas — committed strokes */}
        <canvas ref={baseRef} className="absolute inset-0 pointer-events-none" />

        {/* Live canvas — in-progress stroke + all pointer input */}
        <canvas
          ref={liveRef}
          className={[
            'absolute inset-0',
            open ? (penType === 'eraser' ? 'cursor-none' : 'cursor-crosshair') : 'pointer-events-none',
          ].join(' ')}
          style={{ touchAction: 'none' }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
          onPointerLeave={onPointerLeave}
        />

        {/* Eraser cursor ring */}
        <div
          ref={eraserCurRef}
          className="pointer-events-none absolute hidden rounded-full border-[1.5px] border-zinc-400/70 bg-white/5"
          style={{ width: eraserDiam, height: eraserDiam }}
        />

        {/* ── Toolbar + Settings popover ── */}
        <div className="pointer-events-none absolute top-4 inset-x-0 flex flex-col items-center gap-2 z-[50]">

          {/* Main toolbar pill */}
          <div className={[
            'flex items-center gap-1 px-2.5 py-2 rounded-2xl max-w-[92vw] overflow-x-auto',
            'bg-white/92 dark:bg-zinc-900/92 backdrop-blur-xl',
            'border border-zinc-200/80 dark:border-zinc-700/80 shadow-2xl shadow-black/15',
            open ? 'pointer-events-auto' : 'pointer-events-none',
          ].join(' ')}>

            {/* Pen type */}
            <ToolBtn active={penType === 'fountain'}    onClick={() => setPenType('fountain')}    title="钢笔 — Apple Pencil 压感"><PenLine size={14} /></ToolBtn>
            <ToolBtn active={penType === 'ballpoint'}   onClick={() => setPenType('ballpoint')}   title="圆珠笔 — 均匀线宽"><Pen size={14} /></ToolBtn>
            <ToolBtn active={penType === 'highlighter'} onClick={() => setPenType('highlighter')} title="荧光笔 — 正片叠底"><Highlighter size={14} /></ToolBtn>
            <ToolBtn active={penType === 'eraser'}      onClick={() => setPenType('eraser')}      title="橡皮擦"><Eraser size={14} /></ToolBtn>

            <Sep />

            {/* Color swatches */}
            {palette.map(({ hex, label }, i) => (
              <button
                key={hex}
                onClick={() => { setColorIdx(i); if (penType === 'eraser') setPenType('fountain'); }}
                title={label}
                className={[
                  'w-6 h-6 rounded-full border-2 transition-transform hover:scale-110 shrink-0',
                  currentColorIdx === i && penType !== 'eraser'
                    ? 'border-blue-400 scale-110' : 'border-transparent',
                ].join(' ')}
                style={{ backgroundColor: hex }}
              />
            ))}

            <Sep />

            <ToolBtn
              active={showSettings}
              onClick={() => setShowSettings(v => !v)}
              title="笔刷细节设置"
            >
              <Settings2 size={14} />
            </ToolBtn>

            <Sep />

            <ToolBtn onClick={undo} title="撤销 ⌘Z"   disabled={!canUndo}><Undo2 size={14} /></ToolBtn>
            <ToolBtn onClick={redo} title="重做 ⌘⇧Z" disabled={!canRedo}><Redo2 size={14} /></ToolBtn>

            <Sep />

            <ToolBtn onClick={clearCanvas} title="清空画板" danger><Trash2 size={14} /></ToolBtn>
          </div>

          {/* ── Settings popover ── */}
          {showSettings && open && (
            <div className={[
              'pointer-events-auto w-72',
              'px-4 py-4 rounded-2xl',
              'bg-white/96 dark:bg-zinc-900/96 backdrop-blur-xl',
              'border border-zinc-200/80 dark:border-zinc-700/80 shadow-2xl shadow-black/15',
            ].join(' ')}>

              <div className="flex items-center justify-between mb-3.5">
                <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                  {PEN_LABELS[penType]} 设置
                </span>
                <button
                  onClick={() => resetSettings(penType)}
                  className="text-[0.65rem] text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors"
                >
                  重置默认
                </button>
              </div>

              <div className="flex flex-col gap-4">
                <SliderRow
                  label="笔刷粗细"
                  hint={`${curSettings.size.toFixed(1)} px`}
                  value={curSettings.size}
                  min={2}
                  max={penType === 'highlighter' ? 60 : penType === 'eraser' ? 80 : 20}
                  step={0.5}
                  onChange={v => updateSetting(penType, 'size', v)}
                />

                {(penType === 'fountain' || penType === 'ballpoint') && (
                  <SliderRow
                    label="压感灵敏度"
                    hint={curSettings.thinning.toFixed(2)}
                    value={curSettings.thinning}
                    min={-1} max={1} step={0.05}
                    onChange={v => updateSetting(penType, 'thinning', v)}
                  />
                )}

                {penType === 'fountain' && (
                  <SliderRow
                    label="笔尖锐度"
                    hint={`${Math.round(curSettings.taper)}`}
                    value={curSettings.taper}
                    min={0} max={120} step={1}
                    onChange={v => updateSetting(penType, 'taper', v)}
                  />
                )}

                <SliderRow
                  label="笔迹防抖"
                  hint={curSettings.streamline.toFixed(2)}
                  value={curSettings.streamline}
                  min={0} max={0.99} step={0.01}
                  onChange={v => updateSetting(penType, 'streamline', v)}
                />

                {/* Finger drawing toggle */}
                <div className="flex items-center justify-between pt-3 border-t border-zinc-100 dark:border-zinc-800">
                  <div className="flex flex-col gap-0.5">
                    <div className="flex items-center gap-1.5">
                      <Fingerprint size={12} className="text-zinc-400 shrink-0" />
                      <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">手指书写</span>
                    </div>
                    <span className="text-[0.6rem] text-zinc-400 dark:text-zinc-600 leading-snug ml-4">
                      {fingerDrawing ? '开：手指与触控笔均可书写' : '关：仅 Apple Pencil / 触控笔'}
                    </span>
                  </div>
                  <button
                    onClick={() => setFingerDrawing(v => !v)}
                    aria-label={fingerDrawing ? '关闭手指书写' : '开启手指书写'}
                    className={[
                      'relative flex-shrink-0 w-10 h-[22px] rounded-full transition-colors duration-200',
                      fingerDrawing ? 'bg-blue-500' : 'bg-zinc-200 dark:bg-zinc-700',
                    ].join(' ')}
                  >
                    <span
                      className={[
                        'absolute top-[3px] w-4 h-4 bg-white rounded-full shadow-sm transition-all duration-200',
                        fingerDrawing ? 'left-[calc(100%-19px)]' : 'left-[3px]',
                      ].join(' ')}
                    />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer hint */}
        <div className="pointer-events-none absolute bottom-6 left-1/2 -translate-x-1/2">
          <p className="text-[0.6875rem] text-zinc-400 dark:text-zinc-600 font-mono select-none whitespace-nowrap">
            ESC 关闭 · ⌘Z 撤销 · ⌘⇧Z 重做
            {!fingerDrawing && ' · 手指滑动翻题 · Apple Pencil 书写'}
          </p>
        </div>
      </div>
    </>
  );
}

// ── Slider row ─────────────────────────────────────────────────
function SliderRow({
  label, hint, value, min, max, step, onChange,
}: {
  label: string; hint: string;
  value: number; min: number; max: number; step: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs text-zinc-500 dark:text-zinc-400">{label}</span>
        <span className="text-xs font-mono text-zinc-400 dark:text-zinc-500 tabular-nums">{hint}</span>
      </div>
      <input
        type="range"
        min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full h-1.5 rounded-full accent-blue-500 cursor-pointer"
      />
    </div>
  );
}

// ── Tool button ────────────────────────────────────────────────
function ToolBtn({
  children, active = false, onClick, title, danger = false, disabled = false,
}: {
  children: React.ReactNode; active?: boolean; onClick: () => void;
  title: string; danger?: boolean; disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick} title={title} disabled={disabled}
      className={[
        'flex items-center justify-center w-8 h-8 rounded-xl transition-all shrink-0',
        disabled ? 'opacity-30 cursor-not-allowed' :
        active   ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900' :
        danger   ? 'text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30' :
                   'text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800',
      ].join(' ')}
    >
      {children}
    </button>
  );
}

function Sep() {
  return <div className="w-px h-5 bg-zinc-200 dark:bg-zinc-700 mx-0.5 shrink-0" />;
}
