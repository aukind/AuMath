'use client';

// 知识星图画布：封装 react-force-graph-2d（HTML5 Canvas，禁用 SVG/DOM 节点以承载上千节点）。
// 职责：热力染色 + Hover 聚光灯 + 物理引擎冷却冻结 + 尺寸响应 + 移动端手势隔离。
// 纯展示，不持有选中态——题目节点 click 经 onQuestionClick 上交给编排层（不路由跳转）。
/* eslint-disable @typescript-eslint/no-explicit-any */
import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTheme } from 'next-themes';
import type { GraphDataPayload, GraphNode, NodeStatus } from '@/types/graph';

// SSR 安全：react-force-graph-2d 必须 ssr:false 懒加载（仓库 ImmersiveReader 同约定）。
const ForceGraph2DClient = dynamic(() => import('./ForceGraph2DClient'), { ssr: false });

interface Props {
  data: GraphDataPayload;
  /** 点击题目节点时回调题目 id（topic 节点不触发，仅聚焦） */
  onQuestionClick: (id: string) => void;
}

// 染色：未做=灰、错题=红、已掌握=绿；恒星(知识点)=靛蓝。各取 light/dark 两档。
const STATUS_COLORS: Record<NodeStatus, { light: string; dark: string }> = {
  unattempted: { light: '#a1a1aa', dark: '#52525b' },
  error_prone: { light: '#ef4444', dark: '#f87171' },
  mastered:    { light: '#10b981', dark: '#34d399' },
};
const TOPIC_COLOR = { light: '#6366f1', dark: '#818cf8' };

const idOf = (end: any): string => (typeof end === 'object' && end ? end.id : end);
const nodeRadius = (n: GraphNode) => Math.sqrt(Math.max(1, n.val)) * 2.2;

export default function KnowledgeCanvas({ data, onQuestionClick }: Props) {
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === 'dark';
  const pick = useCallback((c: { light: string; dark: string }) => (dark ? c.dark : c.light), [dark]);

  const containerRef = useRef<HTMLDivElement>(null);
  const fgRef = useRef<any>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  // 触摸设备：禁用节点拖拽，避免与页面滑动/下拉刷新冲突（保留双指缩放 / 单指平移画布）。
  // 懒初始化（SSR 安全：容器 div 不依赖此值，无水合不匹配）。
  const [coarse] = useState(
    () => typeof window !== 'undefined' && (window.matchMedia?.('(pointer: coarse)')?.matches ?? false),
  );
  const [hoverId, setHoverId] = useState<string | null>(null);

  // 邻接表（一次构建）：Hover 聚光灯时点亮自身 + 直接邻居，其余变暗。
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

  const highlight = useMemo(() => {
    if (!hoverId) return null;
    const set = new Set<string>([hoverId]);
    for (const n of adjacency.get(hoverId) ?? []) set.add(n);
    return set;
  }, [hoverId, adjacency]);

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
  }, []);

  // ── 自绘节点（globalScale 为当前缩放，除之以保持标签屏幕字号恒定） ──
  const paintNode = useCallback((node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
    const n = node as GraphNode;
    const r = nodeRadius(n);
    const isTopic = n.type === 'topic';
    const color = isTopic ? pick(TOPIC_COLOR) : pick(STATUS_COLORS[n.status ?? 'unattempted']);
    const dimmed = highlight ? !highlight.has(n.id) : false;

    ctx.save();
    ctx.globalAlpha = dimmed ? 0.1 : 1;
    if (isTopic && !dimmed) {
      ctx.shadowColor = color;
      ctx.shadowBlur = 16;
    }
    ctx.beginPath();
    ctx.arc(node.x, node.y, r, 0, 2 * Math.PI);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.shadowBlur = 0;

    // hover 焦点节点描白/黑环
    if (hoverId === n.id) {
      ctx.lineWidth = 1.6 / globalScale;
      ctx.strokeStyle = dark ? '#fafafa' : '#18181b';
      ctx.stroke();
    }

    // 只给恒星(知识点)常驻标签；题目摘要走原生 tooltip（nodeLabel），避免满屏文字。
    if (isTopic) {
      const fontSize = 12 / globalScale;
      ctx.font = `600 ${fontSize}px ui-sans-serif, system-ui, -apple-system, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillStyle = dark ? '#e4e4e7' : '#27272a';
      ctx.fillText(n.name, node.x, node.y + r + 1.5 / globalScale);
    }
    ctx.restore();
  }, [highlight, hoverId, dark, pick]);

  // 命中区域与绘制半径一致，保证点击/Hover 精准。
  const paintPointerArea = useCallback((node: any, color: string, ctx: CanvasRenderingContext2D) => {
    const n = node as GraphNode;
    ctx.beginPath();
    ctx.arc(node.x, node.y, nodeRadius(n) + 2, 0, 2 * Math.PI);
    ctx.fillStyle = color;
    ctx.fill();
  }, []);

  const linkColor = useCallback((link: any) => {
    if (!highlight) return dark ? 'rgba(113,113,122,0.22)' : 'rgba(212,212,216,0.55)';
    const on = highlight.has(idOf(link.source)) && highlight.has(idOf(link.target));
    if (on) return dark ? 'rgba(129,140,248,0.75)' : 'rgba(99,102,241,0.6)';
    return dark ? 'rgba(113,113,122,0.05)' : 'rgba(212,212,216,0.12)';
  }, [highlight, dark]);

  const linkWidth = useCallback((link: any) => {
    if (!highlight) return 0.5;
    return highlight.has(idOf(link.source)) && highlight.has(idOf(link.target)) ? 1.6 : 0.4;
  }, [highlight]);

  const handleNodeHover = useCallback((node: any) => {
    setHoverId(node ? node.id : null);
    if (containerRef.current) containerRef.current.style.cursor = node ? 'pointer' : 'grab';
  }, []);

  const handleNodeClick = useCallback((node: any) => {
    if (node?.type === 'question') {
      onQuestionClick(node.id);
    } else if (node?.type === 'topic' && fgRef.current) {
      // 点知识点：聚焦该恒星，便于查看其行星簇（不开抽屉、不跳路由）。
      fgRef.current.centerAt(node.x, node.y, 600);
      const z = typeof fgRef.current.zoom === 'function' ? fgRef.current.zoom() : 1;
      fgRef.current.zoom(Math.min(6, z * 1.6), 600);
    }
  }, [onQuestionClick]);

  // 物理引擎冷却：cooldownTime 到点后引擎停转（CPU 归零，风扇不再狂转）；停转时一次性 fit 视野。
  const handleEngineStop = useCallback(() => {
    fgRef.current?.zoomToFit(500, 48);
  }, []);

  return (
    <div ref={containerRef} data-lenis-prevent className="absolute inset-0" style={{ touchAction: 'none' }}>
      {size.width > 0 && (
        <ForceGraph2DClient
          onReady={handleReady}
          graphData={data}
          width={size.width}
          height={size.height}
          backgroundColor={dark ? '#09090b' : '#fafafa'}
          nodeRelSize={4}
          nodeVal={(n: any) => (n as GraphNode).val}
          nodeLabel={(n: any) => (n as GraphNode).name}
          nodeCanvasObject={paintNode}
          nodePointerAreaPaint={paintPointerArea}
          linkColor={linkColor}
          linkWidth={linkWidth}
          onNodeHover={handleNodeHover}
          onNodeClick={handleNodeClick}
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
