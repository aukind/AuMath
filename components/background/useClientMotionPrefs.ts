'use client';

// 背景层共用的两个无副作用 hook：用 useSyncExternalStore 替代
// 「useEffect 里 setMounted/setReduced」旧模式（新 react-hooks 规则禁止 set-state-in-effect）。
import { useSyncExternalStore } from 'react';

const emptySubscribe = () => () => {};

/** 水合完成检测：SSR/首次水合渲染为 false，随后为 true（无闪烁、无级联渲染）。 */
export function useMounted(): boolean {
  return useSyncExternalStore(emptySubscribe, () => true, () => false);
}

const REDUCED_QUERY = '(prefers-reduced-motion: reduce)';

function subscribeReducedMotion(onChange: () => void) {
  const mq = window.matchMedia(REDUCED_QUERY);
  mq.addEventListener('change', onChange);
  return () => mq.removeEventListener('change', onChange);
}

/** 「减弱动态效果」系统偏好（实时订阅变更；服务端恒为 false）。 */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia(REDUCED_QUERY).matches,
    () => false,
  );
}
