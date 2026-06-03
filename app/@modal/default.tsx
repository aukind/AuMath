// 并行路由 @modal 的兜底状态。
// 拦截路由只在「软导航」时挂载弹窗；硬刷新 / 直接打开 / 非匹配页面时，
// 该 slot 无活跃路由，必须返回 null，否则 Next.js 会抛并行路由 404。
export default function ModalDefault() {
  return null;
}
