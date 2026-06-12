// HomeAurora —— 首页「极光」动态背景（Server Component，零 JS、零 WebGL）。
// 纯 CSS 三层：缓漂模糊光斑 ×3 + 180s 旋转 conic 扫光 + feTurbulence 胶片颗粒，
// 样式全在 globals.css 的 .home-aurora-* / [data-home-aurora]（动画只碰 transform，
// 走合成层，GPU 开销可忽略；reduced-motion 自动静止为渐变底）。
//
// 挂载约定：置于页面根容器（需 relative isolate）内的第一个子元素，-z-10 垫底；
// 半透明表面（顶栏 bg-white/80、侧栏 bg-zinc-50/60）会自然透出极光。
export default function HomeAurora() {
  return (
    <div
      aria-hidden
      data-home-aurora
      className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
    >
      <div className="home-aurora-wash" />
      <div className="home-aurora-beam" />
      <div className="home-aurora-blob home-aurora-blob-a" />
      <div className="home-aurora-blob home-aurora-blob-b" />
      <div className="home-aurora-blob home-aurora-blob-c" />
      <div className="home-aurora-grain" />
    </div>
  );
}
