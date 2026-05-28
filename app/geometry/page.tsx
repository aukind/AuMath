'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { BookOpen, PenLine, Box, RotateCcw, ChevronDown, ChevronUp, Play } from 'lucide-react';
import MathGeometryDrawer, {
  type MathGeometryDrawerHandle,
} from '@/components/MathGeometryDrawer';

// ── 场景数据 ──────────────────────────────────────────────────

interface Scene {
  key: string;
  label: string;
  subtitle: string;
  mode: '2d' | '3d';
  description: string;
  commands: string[];
}

const SCENES: Scene[] = [
  {
    key: 'analytic',
    label: '解析几何',
    subtitle: '场景一',
    mode: '2d',
    description:
      '过点 A(1, 2)、B(3, 4) 的直线 l₁；圆 x²+y²=25；椭圆 x²/16+y²/9=1（焦点 ±√7）',
    commands: [
      // 点
      'A = (1, 2)',
      'B = (3, 4)',
      // 直线 l₁
      'l1 = Line(A, B)',
      'SetColor(l1, "DarkGreen")',
      // 圆 x²+y²=25（圆心原点，半径5）
      'cir = Circle((0, 0), 5)',
      'SetColor(cir, "SteelBlue")',
      'SetLineThickness(cir, 3)',
      // 椭圆 x²/16+y²/9=1（a=4, b=3, c=√7）
      'ell = Ellipse((-sqrt(7), 0), (sqrt(7), 0), 4)',
      'SetColor(ell, "IndianRed")',
      'SetLineThickness(ell, 3)',
    ],
  },
  {
    key: 'solid',
    label: '立体几何',
    subtitle: '场景二',
    mode: '3d',
    description:
      '底面 ABCD 的正方体（棱长 2），所有棱可见，体对角线 AC\'（红色加粗）',
    commands: [
      // 底面四顶点
      'A = (0, 0, 0)',
      'B = (2, 0, 0)',
      'C = (2, 2, 0)',
      'D = (0, 2, 0)',
      // 顶面四顶点（用 Ap 代替 A'）
      'Ap = (0, 0, 2)',
      'Bp = (2, 0, 2)',
      'Cp = (2, 2, 2)',
      'Dp = (0, 2, 2)',
      // 底面 / 顶面
      'bottom = Polygon(A, B, C, D)',
      'top = Polygon(Ap, Bp, Cp, Dp)',
      // 四条竖棱
      'e1 = Segment(A, Ap)',
      'e2 = Segment(B, Bp)',
      'e3 = Segment(C, Cp)',
      'e4 = Segment(D, Dp)',
      // 体对角线 AC'（红色加粗）
      'diag = Segment(A, Cp)',
      'SetColor(diag, "Red")',
      'SetLineThickness(diag, 6)',
    ],
  },
];

// ── 页面组件 ─────────────────────────────────────────────────

export default function GeometryPage() {
  const drawerRef = useRef<MathGeometryDrawerHandle>(null);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  function handleDraw(scene: Scene) {
    drawerRef.current?.drawPreciseFigure(scene.commands, scene.mode);
    setActiveKey(scene.key);
  }

  function handleReset() {
    drawerRef.current?.reset();
    setActiveKey(null);
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      {/* ── 顶部导航 ── */}
      <header className="sticky top-0 z-20 border-b border-zinc-200 dark:border-zinc-800 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-sm">
        <div className="mx-auto max-w-7xl flex items-center gap-3 px-4 h-14">
          <BookOpen size={18} className="text-blue-600 dark:text-blue-400" />
          <span className="font-semibold text-zinc-900 dark:text-zinc-100 text-sm tracking-tight">
            精准几何作图
          </span>
          <span className="hidden sm:block text-zinc-300 dark:text-zinc-700">|</span>
          <span className="hidden sm:block text-xs text-zinc-400">
            GeoGebra API 驱动 · 解析几何 · 立体几何
          </span>
          <div className="ml-auto">
            <Link
              href="/"
              className="text-xs text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors"
            >
              ← 返回题库
            </Link>
          </div>
        </div>
      </header>

      {/* ── 主体 ── */}
      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-8">
        <div className="flex flex-col xl:flex-row gap-6 items-start">

          {/* Left: GeoGebra 画板 */}
          <div className="flex-1 min-w-0">
            <MathGeometryDrawer
              ref={drawerRef}
              width={720}
              height={520}
            />
            <p className="mt-2 text-[0.6875rem] text-zinc-400 text-center">
              GeoGebra Classic · 拖拽平移 · 滚轮缩放 · 3D 场景可旋转
            </p>
          </div>

          {/* Right: 控制面板 */}
          <div className="w-full xl:w-72 shrink-0 space-y-3">
            <p className="text-[0.6875rem] font-semibold uppercase tracking-widest text-zinc-400 px-1">
              一键作图场景
            </p>

            {SCENES.map(scene => {
              const isActive = activeKey === scene.key;
              const isExpanded = expandedKey === scene.key;

              return (
                <div
                  key={scene.key}
                  className={`rounded-xl border transition-colors ${
                    isActive
                      ? 'border-blue-300 dark:border-blue-700 bg-blue-50/60 dark:bg-blue-950/30'
                      : 'border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900'
                  }`}
                >
                  <div className="p-4 space-y-2.5">
                    {/* 标题行 */}
                    <div className="flex items-center gap-2">
                      <span className="text-[0.6875rem] font-semibold text-zinc-400">
                        {scene.subtitle}
                      </span>
                      <span className="flex items-center gap-1.5 text-sm font-bold text-zinc-800 dark:text-zinc-100">
                        {scene.mode === '2d'
                          ? <PenLine size={14} className="text-blue-500" />
                          : <Box size={14} className="text-purple-500" />
                        }
                        {scene.label}
                      </span>
                      {isActive && (
                        <span className="ml-auto text-[0.6rem] font-semibold px-1.5 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-300">
                          已绘制
                        </span>
                      )}
                    </div>

                    {/* 描述 */}
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                      {scene.description}
                    </p>

                    {/* 绘制按钮 */}
                    <button
                      onClick={() => handleDraw(scene)}
                      className="w-full flex items-center justify-center gap-2 text-sm font-semibold py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-95 text-white transition-all shadow-sm"
                    >
                      <Play size={13} className="fill-white" />
                      一键绘制
                    </button>
                  </div>

                  {/* 命令折叠区 */}
                  <button
                    onClick={() => setExpandedKey(isExpanded ? null : scene.key)}
                    className="w-full flex items-center justify-between px-4 py-2.5 text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 border-t border-zinc-100 dark:border-zinc-800 transition-colors"
                  >
                    <span>
                      查看 GeoGebra 命令（{scene.commands.length} 条）
                    </span>
                    {isExpanded
                      ? <ChevronUp size={13} />
                      : <ChevronDown size={13} />
                    }
                  </button>

                  {isExpanded && (
                    <div className="px-3 pb-3">
                      <pre className="text-[0.6875rem] font-mono leading-5 text-emerald-700 dark:text-emerald-400 bg-zinc-50 dark:bg-zinc-800/70 rounded-lg p-3 overflow-x-auto whitespace-pre">
                        {scene.commands.join('\n')}
                      </pre>
                    </div>
                  )}
                </div>
              );
            })}

            {/* 清空按钮 */}
            <button
              onClick={handleReset}
              className="w-full flex items-center justify-center gap-1.5 text-sm text-zinc-500 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700 py-2.5 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            >
              <RotateCcw size={13} />
              清空画板
            </button>

            {/* 技术说明 */}
            <div className="rounded-xl bg-zinc-100 dark:bg-zinc-800/50 p-4 space-y-1.5 text-xs text-zinc-500 dark:text-zinc-400">
              <p className="font-semibold text-zinc-600 dark:text-zinc-300">
                技术实现
              </p>
              <p>· <code className="text-blue-600 dark:text-blue-400">useImperativeHandle</code> 暴露 <code className="text-blue-600 dark:text-blue-400">drawPreciseFigure()</code></p>
              <p>· 调用 GeoGebra <code className="text-emerald-600 dark:text-emerald-400">evalCommand()</code> 批量执行</p>
              <p>· <code className="text-purple-600 dark:text-purple-400">setPerspective('T')</code> 切换三维视图</p>
              <p>· 脚本异步加载，支持多实例复用</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
