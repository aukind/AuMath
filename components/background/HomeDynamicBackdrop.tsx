'use client';

/**
 * HomeDynamicBackdrop —— 首页「看得见的流动」GLSL 动态背景。
 *
 * 复用 AmbientFluid 引擎（同一套 fbm + domain warping shader），但换上
 * 高饱和可见调色板 + 0.5 流速 + 30fps：丝绸般的靛紫青光带肉眼可见地涌动，
 * 这是「高级感动态背景」的主角（全站那层微光在首页被实色根容器挡住，与此无关）。
 *
 * 约定与 BackgroundProvider 一致：
 *  - reduced-motion → 不挂 Canvas，由父层 HomeAurora 的静态渐变兜底；
 *  - 水合前不渲染（无亮暗错配闪烁），three 经 dynamic(ssr:false) 懒加载；
 *  - 定位 absolute 填满父层（父层即首页根容器内 -z-10 的 data-home-aurora）。
 */

import dynamic from 'next/dynamic';
import { useTheme } from 'next-themes';
import { useMounted, useReducedMotion } from './useClientMotionPrefs';
import type { FluidPalette } from './AmbientFluid';

const AmbientFluid = dynamic(() => import('./AmbientFluid'), { ssr: false });

// 首页可见调色板：亮=晨雾丝绸（靛/粉紫/青的粉彩），暗=深空极光（靛蓝/深紫/青蓝光带）
const HOME_PALETTE: FluidPalette = {
  light: ['#c7d2fe', '#f1d8fe', '#a5f3fc'],
  dark: ['#2b2a6e', '#4c1d80', '#0e5e74'],
};

export default function HomeDynamicBackdrop() {
  const { resolvedTheme } = useTheme();
  const theme: 'light' | 'dark' = resolvedTheme === 'dark' ? 'dark' : 'light';

  const mounted = useMounted();
  const reduced = useReducedMotion();

  if (!mounted || reduced) return null;

  return (
    <div aria-hidden className="absolute inset-0">
      <AmbientFluid theme={theme} palette={HOME_PALETTE} speed={1.1} fps={30} />
    </div>
  );
}
