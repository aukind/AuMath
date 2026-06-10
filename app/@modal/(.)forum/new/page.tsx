// 拦截路由占位：阻止 (.)forum/[id] 把静态段 /forum/new 误当作帖子 id 拦截。
// 静态段优先于 [id]，软导航 /forum/new 命中此处返回 null（不弹窗），
// children slot 正常渲染全页发帖表单 app/forum/new/page.tsx。
export default function NewPostModalNoop() {
  return null;
}
