// 隐式 children slot 的防御性兜底。
// 一旦根布局新增具名 slot（@modal），Next.js 会要求所有 slot 在未匹配态可解析；
// 正常页面始终匹配 children，这里仅作廉价保险，静默潜在的 missing-default 构建报错。
export default function RootDefault() {
  return null;
}
