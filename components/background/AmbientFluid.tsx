'use client';

/**
 * AmbientFluid —— R3F 核心组件：满屏 PlaneGeometry + 自定义 ShaderMaterial。
 *
 * 性能防御（对应需求阶段四）：
 *  1. GPU 热节流：frameloop="demand" + 自建节流 rAF，按 1000/TARGET_FPS 才推进 uTime 并
 *     invalidate() 触发恰好一帧 → 真·~20fps 出图（肉眼无感的模糊背景省 ≥70% GPU）。
 *  2. 视窗外冻结：visibilitychange / blur / focus 彻底停循环且不累加 uTime，GPU 静默。
 *  4. 内存泄漏阻断：cleanup 显式 material.dispose() + geometry.dispose() + 解绑监听。
 * （3. Prefers Reduced Motion 在上层 BackgroundProvider 处理：reduce 时根本不挂载本组件。）
 */

import { useEffect, useMemo, useRef } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { vertexShader, fragmentShader } from './FluidShader';

// 全站唯一 three 消费者：关闭颜色管理，让极淡的 #hex 靛紫蓝调色板「所见即所得」直出，
// 避免 linear↔sRGB 往返把本就极低明度的微光压暗/偏色。
THREE.ColorManagement.enabled = false;

export interface FluidUniforms {
  uTime: { value: number };
  uMouse: { value: THREE.Vector2 };
  uResolution: { value: THREE.Vector2 };
  uColor1: { value: THREE.Color };
  uColor2: { value: THREE.Color };
  uColor3: { value: THREE.Color }; // 第三主色调（契约允许 2~3 种）
  uSpeed: { value: number };
}

export interface AmbientFluidProps {
  /** 当前站点主题，驱动 Uniform 颜色在亮/暗调色板间平滑插值 */
  theme?: 'light' | 'dark';
}

// 极度克制的靛紫蓝调色板（对标 Stripe），明度/饱和度压到极低，仅作底色微光
const PALETTE: Record<'light' | 'dark', [string, string, string]> = {
  light: ['#eef2ff', '#faf5ff', '#ecfeff'],
  dark: ['#0c0c16', '#100b1c', '#0a1016'],
};

const TARGET_FPS = 20; // 帧率上限，落在需求要求的 15–24fps 区间内
const FRAME_INTERVAL = 1000 / TARGET_FPS;
const COLOR_LERP = 0.06; // 主题切换调色板插值阻尼（~0.6s 平滑过渡）
const MOUSE_LERP = 0.06; // 鼠标跟随阻尼
const DEFAULT_SPEED = 0.15; // 极缓流动

function FluidScene({ theme = 'light' }: AmbientFluidProps) {
  const gl = useThree((s) => s.gl);
  const invalidate = useThree((s) => s.invalidate);

  // 显式 new —— 便于在 cleanup 里手动 dispose 释放 WebGL 显存
  const geometry = useMemo(() => new THREE.PlaneGeometry(2, 2), []);

  // uniforms 只初始化一次：主题切换走颜色 lerp，不重建 material
  const uniforms = useMemo<FluidUniforms>(() => {
    const [c1, c2, c3] = PALETTE[theme];
    return {
      uTime: { value: 0 },
      uMouse: { value: new THREE.Vector2(0, 0) },
      uResolution: { value: new THREE.Vector2(1, 1) },
      uColor1: { value: new THREE.Color(c1) },
      uColor2: { value: new THREE.Color(c2) },
      uColor3: { value: new THREE.Color(c3) },
      uSpeed: { value: DEFAULT_SPEED },
    };
    // 初始主题仅作首帧底色；后续切换由下方 effect 更新 lerp 目标
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        uniforms: uniforms as unknown as Record<string, THREE.IUniform>,
        depthTest: false,
        depthWrite: false,
        transparent: false,
      }),
    [uniforms]
  );

  // 鼠标 NDC 目标 & 主题色插值目标，存 ref 供节流循环消费
  const mouseTarget = useRef(new THREE.Vector2(0, 0));
  const colorTargets = useRef<[THREE.Color, THREE.Color, THREE.Color]>([
    new THREE.Color(PALETTE[theme][0]),
    new THREE.Color(PALETTE[theme][1]),
    new THREE.Color(PALETTE[theme][2]),
  ]);

  // 主题变化 → 仅更新插值目标，material 不重建
  useEffect(() => {
    const [c1, c2, c3] = PALETTE[theme];
    colorTargets.current[0].set(c1);
    colorTargets.current[1].set(c2);
    colorTargets.current[2].set(c3);
  }, [theme]);

  useEffect(() => {
    let rafId = 0;
    let running = false;
    let lastTickMs = performance.now(); // 上次推进 uTime 的时刻（冻结时不推进）
    let lastRenderMs = 0; // 上次实际出图时刻（节流基准）

    const setResolution = () => {
      const canvas = gl.domElement;
      uniforms.uResolution.value.set(
        canvas.width || canvas.clientWidth || 1,
        canvas.height || canvas.clientHeight || 1
      );
    };
    setResolution();

    const tick = (nowMs: number) => {
      rafId = requestAnimationFrame(tick);
      // 节流到 ~TARGET_FPS（减 4ms 容差，抵消 60Hz rAF 量化导致的掉速）
      if (nowMs - lastRenderMs < FRAME_INTERVAL - 4) return;

      const dt = Math.min((nowMs - lastTickMs) / 1000, 0.1); // clamp 防时间跳变
      lastTickMs = nowMs;
      lastRenderMs = nowMs;

      uniforms.uTime.value += dt;
      uniforms.uMouse.value.lerp(mouseTarget.current, MOUSE_LERP);
      uniforms.uColor1.value.lerp(colorTargets.current[0], COLOR_LERP);
      uniforms.uColor2.value.lerp(colorTargets.current[1], COLOR_LERP);
      uniforms.uColor3.value.lerp(colorTargets.current[2], COLOR_LERP);
      setResolution();

      invalidate(); // frameloop="demand" 下精确触发一帧渲染
    };

    const start = () => {
      if (running) return;
      running = true;
      lastTickMs = performance.now(); // 恢复时重置基准，避免冻结期累积成时间跳变
      rafId = requestAnimationFrame(tick);
    };
    const stop = () => {
      running = false;
      cancelAnimationFrame(rafId);
    };

    // 视窗外冻结：切 Tab / 失焦 → 停循环、不累加 uTime、不 invalidate（GPU 静默）
    const onVisibility = () => (document.hidden ? stop() : start());
    const onBlur = () => stop();
    const onFocus = () => start();

    // 鼠标 → NDC（canvas 为 pointer-events:none，故监听 window）
    const onPointerMove = (e: PointerEvent) => {
      mouseTarget.current.set(
        (e.clientX / window.innerWidth) * 2 - 1,
        -((e.clientY / window.innerHeight) * 2 - 1)
      );
    };
    const onResize = () => setResolution();

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', onFocus);
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('resize', onResize);

    if (!document.hidden) start();

    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('resize', onResize);
      // 显式释放 WebGL 显存（需求阶段四·4）
      material.dispose();
      geometry.dispose();
    };
  }, [gl, invalidate, uniforms, material, geometry]);

  return <mesh geometry={geometry} material={material} frustumCulled={false} />;
}

export default function AmbientFluid({ theme = 'light' }: AmbientFluidProps) {
  return (
    <Canvas
      // linear + flat：不做色彩管理/色调映射，保证极淡调色板所见即所得
      linear
      flat
      frameloop="demand" // 关键：默认不自动渲染，全由节流循环手动 invalidate
      dpr={[0.6, 1]} // 高度模糊背景降采样，封顶 1x 省 GPU
      gl={{
        alpha: true,
        antialias: false,
        depth: false,
        stencil: false,
        powerPreference: 'low-power',
      }}
      style={{ width: '100%', height: '100%', display: 'block' }}
    >
      <FluidScene theme={theme} />
    </Canvas>
  );
}
