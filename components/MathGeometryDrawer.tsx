'use client';

import {
  useEffect,
  useRef,
  useImperativeHandle,
  useState,
  useId,
  type Ref,
} from 'react';
import { Loader2, AlertCircle } from 'lucide-react';

// ── GeoGebra 类型声明 ──────────────────────────────────────────
interface GeoGebraAPI {
  evalCommand(cmd: string): boolean;
  reset(): void;
  setPerspective(code: string): void;
  setCoordSystem(xMin: number, xMax: number, yMin: number, yMax: number): void;
  setAxesVisible(xAxis: boolean, yAxis: boolean): void;
  setGridVisible(visible: boolean): void;
}

declare global {
  interface Window {
    GGBApplet: new (
      params: Record<string, unknown>,
      html5Codebase: boolean,
    ) => { inject(containerId: string): void };
  }
}

// ── 公开句柄接口（父组件通过 ref 调用） ──────────────────────
export interface MathGeometryDrawerHandle {
  /**
   * 精准批量绘图：重置画板后按顺序执行所有 GeoGebra 命令。
   * @param commands GeoGebra 命令数组
   * @param mode     '2d' 切换到平面几何视图；'3d' 切换到三维视图（默认 '2d'）
   */
  drawPreciseFigure(commands: string[], mode?: '2d' | '3d'): void;
  /** 清空画板，恢复初始状态 */
  reset(): void;
}

interface MathGeometryDrawerProps {
  ref?: Ref<MathGeometryDrawerHandle>;
  width?: number;
  height?: number;
  className?: string;
}

// ── GeoGebra 脚本加载（单例，避免重复插入） ──────────────────
const GGB_SCRIPT_URL = 'https://www.geogebra.org/apps/deployggb.js';

function loadGeoGebraScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.GGBApplet) {
      resolve();
      return;
    }
    // 脚本已在 DOM 中但还未执行完毕 → 轮询等待
    if (document.querySelector(`script[src="${GGB_SCRIPT_URL}"]`)) {
      const timer = setInterval(() => {
        if (window.GGBApplet) { clearInterval(timer); resolve(); }
      }, 150);
      setTimeout(() => { clearInterval(timer); reject(new Error('GeoGebra 加载超时')); }, 15000);
      return;
    }
    const script = document.createElement('script');
    script.src = GGB_SCRIPT_URL;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('GeoGebra 脚本加载失败，请检查网络连接'));
    document.head.appendChild(script);
  });
}

// ── 组件本体 ─────────────────────────────────────────────────
export default function MathGeometryDrawer({
  ref,
  width = 720,
  height = 500,
  className = '',
}: MathGeometryDrawerProps) {
  // useId() 生成类似 ":r0:"，去掉冒号得到合法 HTML ID
  const uid = useId().replace(/:/g, '');
  const containerId = `ggb-applet-${uid}`;

  const apiRef = useRef<GeoGebraAPI | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    let cancelled = false;

    loadGeoGebraScript()
      .then(() => {
        if (cancelled) return;

        const applet = new window.GGBApplet(
          {
            appName: 'classic',      // classic 同时支持 2D 与 3D 视图
            width,
            height,
            showToolBar: false,
            showAlgebraInput: false,
            showMenuBar: false,
            showZoomButtons: true,
            enableRightClick: true,
            errorDialogsActive: false,
            enableShiftDragZoom: true,
            language: 'zh',
            // GeoGebra 初始化完成后回调，API 对象直接传入
            appletOnLoad: (api: GeoGebraAPI) => {
              if (cancelled) return;
              apiRef.current = api;
              setStatus('ready');
            },
          },
          true, // html5Codebase: 强制使用 HTML5 版本
        );

        applet.inject(containerId);
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setErrorMsg(err.message);
          setStatus('error');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [containerId, width, height]);

  // ── 向父组件暴露的命令式接口 ──────────────────────────────
  useImperativeHandle(ref, () => ({
    drawPreciseFigure(commands: string[], mode: '2d' | '3d' = '2d') {
      const api = apiRef.current;
      if (!api) return;

      api.reset();
      // 'G' = Geometry（平面）；'T' = ThreeD（三维）
      api.setPerspective(mode === '3d' ? 'T' : 'G');

      for (const cmd of commands) {
        api.evalCommand(cmd);
      }
    },

    reset() {
      apiRef.current?.reset();
    },
  }));

  return (
    <div
      className={`relative rounded-xl overflow-hidden border border-zinc-200 dark:border-zinc-700 bg-white ${className}`}
      style={{ width, height }}
    >
      {/* GeoGebra 注入容器 */}
      <div id={containerId} />

      {/* 加载 / 错误遮罩 */}
      {status !== 'ready' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-white">
          {status === 'loading' ? (
            <>
              <Loader2 size={30} className="animate-spin text-blue-500" />
              <p className="text-sm text-zinc-500 font-medium">正在加载 GeoGebra 引擎…</p>
              <p className="text-xs text-zinc-400">首次加载约需 5–15 秒</p>
            </>
          ) : (
            <>
              <AlertCircle size={30} className="text-red-500" />
              <p className="text-sm text-red-600 font-medium">加载失败</p>
              <p className="text-xs text-red-400 text-center px-8">{errorMsg}</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
