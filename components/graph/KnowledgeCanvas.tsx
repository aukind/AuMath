'use client';

// 知识星图画布：封装 react-force-graph-2d（HTML5 Canvas，禁用 SVG/DOM 节点以承载上千节点）。
// 职责：星空底纹 + 热力染色 + 分类连线（归属/层级/共现/手动双链）+ Hover/选中聚光灯
//      + 双链能量粒子 + 缩放渐显题目标签 + 物理引擎冷却冻结 + 尺寸响应 + 移动端手势隔离。
// 纯展示，不持有选中态——节点 click 上交给编排层（不路由跳转）。
/* eslint-disable @typescript-eslint/no-explicit-any */
import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTheme } from 'next-themes';
import type { GraphDataPayload, GraphNode, GraphLink, NodeStatus } from '@/types/graph';

// SSR 安全：react-force-graph-2d 必须 ssr:false 懒加载（仓库 ImmersiveReader 同约定）。
const ForceGraph2DClient = dynamic(() => import('./ForceGraph2DClient'), { ssr: false });

export interface CanvasHandle {
  /** 平移聚焦到某节点并适度放大 */
  focusNode: (id: string) => void;
  zoomToFit: () => void;
}

interface Props {
  data: GraphDataPayload;
  /** 点击题目节点回调题目 id */
  onQuestionClick: (id: string) => void;
  /** 点击知识点节点回调 topic id（编排层打开 Inspector） */
  onTopicClick: (id: string) => void;
  /** 点击定理节点回调 theorem id（编排层打开 TheoremInspector） */
  onTheoremClick: (id: string) => void;
  /** 点击笔记节点回调 note id（编排层跳转 /notes/[id]） */
  onNoteClick: (id: string) => void;
  /** 点击空白处（清除选中） */
  onBackgroundClick?: () => void;
  /** 当前选中节点（持久聚光灯 + 脉冲描环） */
  selectedId?: string | null;
  /** 搜索命中集合：非 null 时未命中节点强制变暗 */
  matchIds?: Set<string> | null;
  /** 命令式句柄上交（focusNode / zoomToFit） */
  onHandleReady?: (h: CanvasHandle) => void;
}

// 染色：未做=灰、错题=红、已掌握=绿。知识点按树深度分层取色（根=紫罗兰 → 深层=天蓝）。
const STATUS_COLORS: Record<NodeStatus, { light: string; dark: string }> = {
  unattempted: { light: '#a1a1aa', dark: '#52525b' },
  error_prone: { light: '#ef4444', dark: '#f87171' },
  mastered:    { light: '#10b981', dark: '#34d399' },
};
const TOPIC_LEVEL_COLORS: { light: string; dark: string }[] = [
  { light: '#8b5cf6', dark: '#a78bfa' }, // level 0 紫罗兰
  { light: '#6366f1', dark: '#818cf8' }, // level 1 靛蓝
  { light: '#0ea5e9', dark: '#38bdf8' }, // level ≥2 天蓝
];
const MANUAL_LINK_COLOR = { light: '#d97706', dark: '#fbbf24' }; // 手动双链=琥珀金
const THEOREM_COLOR = { light: '#d97706', dark: '#fbbf24' };     // 定理=琥珀金菱形
const NOTE_COLOR = { light: '#06b6d4', dark: '#22d3ee' };        // 用户笔记=青色圆角方块

const idOf = (end: any): string => (typeof end === 'object' && end ? end.id : end);
const nodeRadius = (n: GraphNode) => Math.sqrt(Math.max(1, n.val)) * 2.2;
const topicColor = (level: number | undefined, dark: boolean) => {
  const c = TOPIC_LEVEL_COLORS[Math.min(level ?? 1, TOPIC_LEVEL_COLORS.length - 1)];
  return dark ? c.dark : c.light;
};

/** 星空底纹：世界坐标系内一次性撒点，随画布平移缩放产生「在星河中遨游」的视差感。 */
interface Star { x: number; y: number; r: number; a: number }
function makeStars(count: number, spread: number): Star[] {
  const stars: Star[] = [];
  for (let i = 0; i < count; i++) {
    stars.push({
      x: (Math.random() - 0.5) * spread,
      y: (Math.random() - 0.5) * spread,
      r: Math.random() * 1.1 + 0.3,
      a: Math.random() * 0.5 + 0.12,
    });
  }
  return stars;
}

export default function KnowledgeCanvas({
  data, onQuestionClick, onTopicClick, onTheoremClick, onNoteClick, onBackgroundClick,
  selectedId = null, matchIds = null, onHandleReady,
}: Props) {
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === 'dark';
  const pick = useCallback((c: { light: string; dark: string }) => (dark ? c.dark : c.light), [dark]);

  const containerRef = useRef<HTMLDivElement>(null);
  const fgRef = useRef<any>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  // 触摸设备：禁用节点拖拽，避免与页面滑动/下拉刷新冲突（保留双指缩放 / 单指平移画布）。
  const [coarse] = useState(
    () => typeof window !== 'undefined' && (window.matchMedia?.('(pointer: coarse)')?.matches ?? false),
  );
  const [hoverId, setHoverId] = useState<string | null>(null);
  const stars = useMemo(() => makeStars(220, 2600), []);

  // 邻接表（一次构建）：聚光灯点亮自身 + 直接邻居，其余变暗。
  // 在首帧构建——此刻 links 的 source/target 仍是字符串 id（库尚未把它们替换成对象）。
  const adjacency = useMemo(() => {
    const m = new Map<string, Set<string>>();
    const add = (a: string, b: string) => {
      if (!m.has(a)) m.set(a, new Set());
      m.get(a)!.add(b);
    };
    for (const l of data.links) {
      const s = idOf(l.source);
      const t = idOf(l.target);
      add(s, t);
      add(t, s);
    }
    return m;
  }, [data]);

  // 聚光灯焦点：Hover 优先，否则用选中节点（Inspector 打开期间保持高亮）。
  const spotlightId = hoverId ?? selectedId;
  const highlight = useMemo(() => {
    if (!spotlightId) return null;
    const set = new Set<string>([spotlightId]);
    for (const n of adjacency.get(spotlightId) ?? []) set.add(n);
    return set;
  }, [spotlightId, adjacency]);

  /** 节点是否处于「暗化」状态：搜索未命中 > 聚光灯外。 */
  const isDimmed = useCallback((id: string) => {
    if (matchIds && !matchIds.has(id)) return true;
    if (highlight && !highlight.has(id)) return true;
    return false;
  }, [matchIds, highlight]);

  // 尺寸响应：监听父容器，动态喂给 width/height 重绘，避免拉伸糊掉。
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      for (const e of entries) {
        const { width, height } = e.contentRect;
        setSize({ width: Math.floor(width), height: Math.floor(height) });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const handleReady = useCallback((fg: any) => {
    fgRef.current = fg;
    onHandleReady?.({
      focusNode: (id: string) => {
        const node = fg.graphData?.().nodes.find((n: any) => n.id === id);
        if (!node || typeof node.x !== 'number') return;
        fg.centerAt(node.x, node.y, 700);
        const z = typeof fg.zoom === 'function' ? fg.zoom() : 1;
        fg.zoom(Math.max(2.4, Math.min(6, z * 1.6)), 700);
      },
      zoomToFit: () => fg.zoomToFit(600, 64),
    });
  }, [onHandleReady]);

  // ── 星空底纹（onRenderFramePre：世界坐标系，已应用平移缩放） ──
  const paintStars = useCallback((ctx: CanvasRenderingContext2D, globalScale: number) => {
    ctx.save();
    ctx.fillStyle = dark ? '#e0e7ff' : '#6366f1';
    for (const s of stars) {
      ctx.globalAlpha = s.a * (dark ? 1 : 0.35);
      ctx.beginPath();
      // 半径除以缩放：星点保持屏幕恒定大小，纯作视差背景而非图元素
      ctx.arc(s.x, s.y, s.r / globalScale, 0, 2 * Math.PI);
      ctx.fill();
    }
    ctx.restore();
  }, [stars, dark]);

  // ── 自绘节点（globalScale 为当前缩放，除之以保持标签屏幕字号恒定） ──
  const paintNode = useCallback((node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
    // 力导向首帧可能尚未给新加入的节点（如定理）分配坐标 → node.x/y 为非有限值，
    // createRadialGradient 会直接抛错。跳过本帧，待引擎定位后下一帧自然绘出。
    if (!Number.isFinite(node.x) || !Number.isFinite(node.y)) return;
    const n = node as GraphNode;
    const r = nodeRadius(n);
    const isTopic = n.type === 'topic';
    const isTheorem = n.type === 'theorem';
    const isNote = n.type === 'note';
    const color = isTopic ? topicColor(n.level, dark)
      : isTheorem ? pick(THEOREM_COLOR)
      : isNote ? pick(NOTE_COLOR)
      : pick(STATUS_COLORS[n.status ?? 'unattempted']);
    const dimmed = isDimmed(n.id);
    const selected = selectedId === n.id;

    ctx.save();
    ctx.globalAlpha = dimmed ? 0.08 : 1;

    // 辉光：径向渐变光晕（比 shadowBlur 廉价且可控），聚光灯内增强。知识点/定理/笔记皆有。
    if ((isTopic || isTheorem || isNote) && !dimmed) {
      const haloR = r * (highlight?.has(n.id) ? 3.2 : 2.4);
      const grad = ctx.createRadialGradient(node.x, node.y, r * 0.4, node.x, node.y, haloR);
      grad.addColorStop(0, color + (dark ? '55' : '40'));
      grad.addColorStop(1, color + '00');
      ctx.beginPath();
      ctx.arc(node.x, node.y, haloR, 0, 2 * Math.PI);
      ctx.fillStyle = grad;
      ctx.fill();
    }

    // 节点本体：知识点/题目=圆，定理=菱形，笔记=圆角方块（一眼区分四类节点）。
    ctx.beginPath();
    if (isTheorem) {
      ctx.moveTo(node.x, node.y - r);
      ctx.lineTo(node.x + r, node.y);
      ctx.lineTo(node.x, node.y + r);
      ctx.lineTo(node.x - r, node.y);
      ctx.closePath();
    } else if (isNote) {
      const s = r * 0.92;       // 方块半边长，略小于半径以观感相称
      const rad = s * 0.45;     // 圆角
      ctx.roundRect(node.x - s, node.y - s, s * 2, s * 2, rad);
    } else {
      ctx.arc(node.x, node.y, r, 0, 2 * Math.PI);
    }
    ctx.fillStyle = color;
    ctx.fill();

    // 选中节点：呼吸脉冲双环（时间驱动；force-graph 帧循环常驻，无需额外 rAF）
    if (selected) {
      const t = performance.now() / 1000;
      const pulse = (Math.sin(t * 2.4) + 1) / 2; // 0..1
      ctx.lineWidth = 1.8 / globalScale;
      ctx.strokeStyle = dark ? '#fafafa' : '#18181b';
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(node.x, node.y, r + (2.5 + pulse * 2.5) / globalScale + r * 0.35, 0, 2 * Math.PI);
      ctx.globalAlpha = (dimmed ? 0.08 : 1) * (0.7 - pulse * 0.45);
      ctx.lineWidth = 1.2 / globalScale;
      ctx.strokeStyle = color;
      ctx.stroke();
      ctx.globalAlpha = dimmed ? 0.08 : 1;
    } else if (hoverId === n.id) {
      ctx.lineWidth = 1.6 / globalScale;
      ctx.strokeStyle = dark ? '#fafafa' : '#18181b';
      ctx.stroke();
    }

    // 标签：恒星/定理常驻（暗化时隐去）；题目标签在放大到 2.2x 后渐显（Obsidian 式 zoom-in 显字）。
    if (isTopic && !dimmed) {
      const fontSize = 12 / globalScale;
      ctx.font = `600 ${fontSize}px ui-sans-serif, system-ui, -apple-system, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillStyle = dark ? '#e4e4e7' : '#27272a';
      ctx.fillText(n.name, node.x, node.y + r + 1.5 / globalScale);
    } else if (isTheorem && !dimmed) {
      const fontSize = 11 / globalScale;
      ctx.font = `italic 600 ${fontSize}px ui-sans-serif, system-ui, -apple-system, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillStyle = dark ? '#fbbf24' : '#b45309';
      ctx.fillText(n.name, node.x, node.y + r + 1.5 / globalScale);
    } else if (isNote && !dimmed) {
      const fontSize = 11 / globalScale;
      ctx.font = `600 ${fontSize}px ui-sans-serif, system-ui, -apple-system, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillStyle = dark ? '#67e8f9' : '#0e7490';
      ctx.fillText(n.name, node.x, node.y + r + 1.5 / globalScale);
    } else if (n.type === 'question' && !dimmed && globalScale > 2.2) {
      const alpha = Math.min(1, (globalScale - 2.2) / 1.2);
      const fontSize = 10 / globalScale;
      ctx.globalAlpha = alpha * 0.85;
      ctx.font = `400 ${fontSize}px ui-sans-serif, system-ui, -apple-system, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillStyle = dark ? '#a1a1aa' : '#52525b';
      ctx.fillText(n.name, node.x, node.y + r + 1.2 / globalScale);
    }
    ctx.restore();
  }, [highlight, hoverId, selectedId, dark, pick, isDimmed]);

  // 命中区域与绘制半径一致，保证点击/Hover 精准。
  const paintPointerArea = useCallback((node: any, color: string, ctx: CanvasRenderingContext2D) => {
    const n = node as GraphNode;
    ctx.beginPath();
    ctx.arc(node.x, node.y, nodeRadius(n) + 2, 0, 2 * Math.PI);
    ctx.fillStyle = color;
    ctx.fill();
  }, []);

  // ── 分类连线：归属=极淡 / 层级=靛蓝虚线 / 共现=紫罗兰(权重越大越亮) / 手动双链=琥珀金 ──
  const linkBaseColor = useCallback((l: GraphLink): string => {
    switch (l.kind) {
      case 'hierarchy':
        return dark ? 'rgba(129,140,248,0.4)' : 'rgba(99,102,241,0.35)';
      case 'cooccur': {
        const a = Math.min(0.55, 0.16 + (l.weight ?? 1) * 0.07);
        return dark ? `rgba(167,139,250,${a})` : `rgba(139,92,246,${a * 0.9})`;
      }
      case 'manual':
        return dark ? 'rgba(251,191,36,0.8)' : 'rgba(217,119,6,0.7)';
      case 'theorem_topic':
        return dark ? 'rgba(251,191,36,0.55)' : 'rgba(217,119,6,0.5)';
      case 'theorem_cite':
        return dark ? 'rgba(251,191,36,0.26)' : 'rgba(217,119,6,0.28)';
      case 'note_ref':
        return dark ? 'rgba(34,211,238,0.5)' : 'rgba(6,182,212,0.45)';
      default:
        return dark ? 'rgba(113,113,122,0.22)' : 'rgba(212,212,216,0.55)';
    }
  }, [dark]);

  const linkColor = useCallback((link: any) => {
    const l = link as GraphLink;
    const sOn = !isDimmed(idOf(link.source));
    const tOn = !isDimmed(idOf(link.target));
    if (highlight || matchIds) {
      if (sOn && tOn) {
        // 聚光灯内连线提亮
        if (l.kind === 'qt') return dark ? 'rgba(129,140,248,0.75)' : 'rgba(99,102,241,0.6)';
        return linkBaseColor(l);
      }
      return dark ? 'rgba(113,113,122,0.04)' : 'rgba(212,212,216,0.1)';
    }
    return linkBaseColor(l);
  }, [highlight, matchIds, isDimmed, linkBaseColor, dark]);

  const linkWidth = useCallback((link: any) => {
    const l = link as GraphLink;
    const base = l.kind === 'manual' ? 1.8
      : l.kind === 'note_ref' ? 1.4
      : l.kind === 'theorem_topic' ? 1.4
      : l.kind === 'hierarchy' ? 1.1
      : l.kind === 'theorem_cite' ? 0.7
      : l.kind === 'cooccur' ? Math.min(2.2, 0.6 + Math.log2((l.weight ?? 1) + 1) * 0.5)
      : 0.5;
    if (!highlight && !matchIds) return base;
    const on = !isDimmed(idOf(link.source)) && !isDimmed(idOf(link.target));
    return on ? Math.max(base, 1.6) : 0.3;
  }, [highlight, matchIds, isDimmed]);

  const linkLineDash = useCallback((link: any) => {
    const k = (link as GraphLink).kind;
    return k === 'hierarchy' ? [3, 2] : k === 'theorem_topic' ? [1, 3] : k === 'note_ref' ? [2, 2] : null;
  }, []);

  // 能量粒子：手动双链常驻流光；聚光灯内的连线点亮时也淌粒子（华丽但量小，不掉帧）。
  const linkParticles = useCallback((link: any) => {
    const l = link as GraphLink;
    if (l.kind === 'manual') return 2;
    if (highlight && highlight.has(idOf(link.source)) && highlight.has(idOf(link.target))) return 1;
    return 0;
  }, [highlight]);

  const linkParticleColor = useCallback((link: any) => {
    const l = link as GraphLink;
    if (l.kind === 'manual') return pick(MANUAL_LINK_COLOR);
    return dark ? '#c7d2fe' : '#6366f1';
  }, [dark, pick]);

  const handleNodeHover = useCallback((node: any) => {
    setHoverId(node ? node.id : null);
    if (containerRef.current) containerRef.current.style.cursor = node ? 'pointer' : 'grab';
  }, []);

  const handleNodeClick = useCallback((node: any) => {
    if (node?.type === 'question') {
      onQuestionClick(node.id);
    } else if (node?.type === 'topic') {
      onTopicClick(node.id);
      if (fgRef.current && typeof node.x === 'number') {
        fgRef.current.centerAt(node.x, node.y, 600);
      }
    } else if (node?.type === 'theorem') {
      onTheoremClick(node.id);
      if (fgRef.current && typeof node.x === 'number') {
        fgRef.current.centerAt(node.x, node.y, 600);
      }
    } else if (node?.type === 'note') {
      onNoteClick(node.id);
    }
  }, [onQuestionClick, onTopicClick, onTheoremClick, onNoteClick]);

  const handleBackgroundClick = useCallback(() => {
    onBackgroundClick?.();
  }, [onBackgroundClick]);

  // 物理引擎冷却：cooldownTime 到点后引擎停转（CPU 归零）；停转时一次性 fit 视野。
  const handleEngineStop = useCallback(() => {
    fgRef.current?.zoomToFit(500, 48);
  }, []);

  return (
    <div
      ref={containerRef}
      data-lenis-prevent
      // 深空径向渐变垫底（画布本身透明），光晕与星点浮于其上。
      // 用 Tailwind dark: 类而非 JS 的 dark 三元——背景由 <html>.dark 决定（next-themes 在
      // 注水前就置好该 class），避免「服务端 resolvedTheme=undefined 渲浅色 / 客户端渲深色」的注水失配。
      className="absolute inset-0 bg-[radial-gradient(ellipse_120%_90%_at_50%_0%,#eef2ff_0%,#fafaff_55%,#fafafa_100%)] dark:bg-[radial-gradient(ellipse_120%_90%_at_50%_0%,#14143a_0%,#0b0b1e_48%,#09090b_100%)]"
      style={{ touchAction: 'none' }}
    >
      {size.width > 0 && (
        <ForceGraph2DClient
          onReady={handleReady}
          graphData={data}
          width={size.width}
          height={size.height}
          backgroundColor="rgba(0,0,0,0)"
          onRenderFramePre={paintStars}
          nodeRelSize={4}
          nodeVal={(n: any) => (n as GraphNode).val}
          nodeLabel={(n: any) => ((n as GraphNode).type === 'question' ? (n as GraphNode).name : '')}
          nodeCanvasObject={paintNode}
          nodePointerAreaPaint={paintPointerArea}
          linkColor={linkColor}
          linkWidth={linkWidth}
          linkLineDash={linkLineDash}
          linkDirectionalParticles={linkParticles}
          linkDirectionalParticleWidth={2}
          linkDirectionalParticleSpeed={0.0045}
          linkDirectionalParticleColor={linkParticleColor}
          onNodeHover={handleNodeHover}
          onNodeClick={handleNodeClick}
          onBackgroundClick={handleBackgroundClick}
          onEngineStop={handleEngineStop}
          cooldownTime={4000}
          warmupTicks={20}
          d3VelocityDecay={0.3}
          enableNodeDrag={!coarse}
          minZoom={0.4}
          maxZoom={8}
        />
      )}
    </div>
  );
}
