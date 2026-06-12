// HomeAurora —— 首页动态背景编排层（Server Component 外壳）。
// 层序（下→上）：
//   ① wash    静态渐变兜底（shader 加载前的首帧 / reduced-motion 降级底色）
//   ② GLSL    HomeDynamicBackdrop：可见流动的丝绸光带（主角，client 懒加载）
//   ③ veil    半透明薄纱压一档饱和度——光从「幕后」透出来，高级感关键
//   ④ beam    巨幅 conic 扫光（CSS 慢旋转，叠加层次）
//   ⑤ grain   feTurbulence 胶片颗粒压色带
// 挂载约定：页面根容器（relative isolate）内第一个子元素，-z-10 垫底；
// Zen Mode 由 globals.css 的 .zen-active [data-home-aurora] 整层淡出。
import HomeDynamicBackdrop from './HomeDynamicBackdrop';

export default function HomeAurora() {
  return (
    <div
      aria-hidden
      data-home-aurora
      className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
    >
      <div className="home-aurora-wash" />
      <HomeDynamicBackdrop />
      <div className="absolute inset-0 bg-zinc-50/35 dark:bg-zinc-950/45" />
      <div className="home-aurora-beam" />
      <div className="home-aurora-grain" />
    </div>
  );
}
