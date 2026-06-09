// Supabase Storage 图片变换（Pro 内置 render/image 端点）。
//
// 把公共桶原图直链改写为按显示尺寸缩放 + WebP/质量压缩的变换链接，省 egress + 提速首屏。
// 在「渲染层」改写字符串，不动已落库的 cover_url/avatar_url，零迁移、可随时回退。
//
// 不变换的情形（原样返回）：
//   - 空值
//   - 非本项目公共桶 URL（不含 /storage/v1/object/public/）
//   - SVG（矢量，栅格变换无意义且 Supabase 不支持）

export interface ImgTransformOptions {
  width?: number;
  height?: number;
  /** 1–100，默认 72：肉眼无损但体积显著更小 */
  quality?: number;
  /** cover（裁切填满，默认）| contain（完整不裁）| fill（拉伸） */
  resize?: 'cover' | 'contain' | 'fill';
}

export function imgTransform(url?: string | null, o: ImgTransformOptions = {}): string {
  if (!url || !url.includes('/storage/v1/object/public/') || /\.svg(\?|$)/i.test(url)) {
    return url ?? '';
  }
  const q = new URLSearchParams();
  if (o.width) q.set('width', String(o.width));
  if (o.height) q.set('height', String(o.height));
  q.set('quality', String(o.quality ?? 72));
  q.set('resize', o.resize ?? 'cover');
  return url.replace('/object/public/', '/render/image/public/') + '?' + q.toString();
}
