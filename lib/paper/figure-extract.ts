// 客户端：把试卷 PDF 逐页光栅化成 canvas，并按归一化 bbox 裁出几何图。
// 复用资源大厅的 pdf.js 配置（lib/library/pdf-worker），与 generateCover 同套路。
// 仅在浏览器运行（用到 document / canvas / pdfjs），由客户端组件调用。

// pdfjs（react-pdf）只在浏览器可用，且在模块求值时会触碰 DOMMatrix；故**不在顶层 import**，
// 改在用到它的 rasterizePdfPages 内动态 import —— 否则被 SSR 的录入工作台会在预渲染阶段崩
// 「DOMMatrix is not defined」。其余函数只用 canvas/Image，不依赖 pdfjs。

export interface PageRaster {
  /** 1-based 页码（图片型上传恒为 1） */
  pageNumber: number;
  canvas: HTMLCanvasElement;
}

const PDF_POINT_DPI = 72; // PDF 1pt = 1/72 inch

/** PDF（公开/签名 URL）逐页光栅化为全分辨率 canvas（默认 ~150 DPI）。 */
export async function rasterizePdfPages(url: string, dpi = 150): Promise<PageRaster[]> {
  const { pdfjs } = await import('@/lib/library/pdf-worker');
  const task = pdfjs.getDocument({ url, rangeChunkSize: 1 << 16 });
  const out: PageRaster[] = [];
  try {
    const pdf = await task.promise;
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: dpi / PDF_POINT_DPI });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      if (!canvas.getContext('2d')) continue;
      await page.render({ canvas, viewport }).promise;
      out.push({ pageNumber: i, canvas });
    }
    pdf.cleanup();
  } finally {
    task.destroy();
  }
  return out;
}

/** 图片型上传（JPG/PNG/WebP 卷子）→ 单页 canvas。 */
export async function rasterizeImageUrl(url: string): Promise<PageRaster> {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('图片加载失败'));
    img.src = url;
  });
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  canvas.getContext('2d')?.drawImage(img, 0, 0);
  return { pageNumber: 1, canvas };
}

/**
 * 把页 canvas 编码成给检测用的 base64。
 * 用**无损 PNG**且上限 2000px（对齐 figure-detect 服务的 MAX_EDGE_PX）——
 * 几何图多是细线/虚线，JPEG 压缩会把线糊掉导致 YOLO 漏检或框小；PNG 保真。
 * bbox 归一化不受缩放影响，故缩到 2000px 不影响坐标。
 */
export function canvasToDetectBase64(
  canvas: HTMLCanvasElement,
  maxDim = 2000,
): { base64: string; mime: 'image/png' } {
  const scale = Math.min(1, maxDim / Math.max(canvas.width, canvas.height));
  let send = canvas;
  if (scale < 1) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(canvas.width * scale));
    c.height = Math.max(1, Math.round(canvas.height * scale));
    c.getContext('2d')?.drawImage(canvas, 0, 0, c.width, c.height);
    send = c;
  }
  try {
    const dataUrl = send.toDataURL('image/png');
    return { base64: dataUrl.split(',')[1] ?? '', mime: 'image/png' };
  } catch {
    return { base64: '', mime: 'image/png' }; // 跨域污染 → 调用方按失败处理
  }
}

/**
 * 从全分辨率页 canvas 按归一化 bbox [ymin,xmin,ymax,xmax]（0–1000）裁出 PNG（base64，无前缀）。
 * padding **相对框本身**、小幅且封顶——防裁掉边线/标注，又不把邻行题面/选项文字撑进来。
 * （旧版按整页比例 1.5% 加 padding，150DPI A4 下每边 ≈一整行字，会把文字带进裁剪。）
 */
export function cropBox(
  canvas: HTMLCanvasElement,
  box: [number, number, number, number],
  padFrac = 0.06,
  padCapPx = 30,
): string | null {
  const [ymin, xmin, ymax, xmax] = box;
  const W = canvas.width;
  const H = canvas.height;
  const boxW = ((xmax - xmin) / 1000) * W;
  const boxH = ((ymax - ymin) / 1000) * H;
  const padX = Math.min(boxW * padFrac, padCapPx);
  const padY = Math.min(boxH * padFrac, padCapPx);
  const x0 = Math.max(0, Math.round((xmin / 1000) * W - padX));
  const y0 = Math.max(0, Math.round((ymin / 1000) * H - padY));
  const x1 = Math.min(W, Math.round((xmax / 1000) * W + padX));
  const y1 = Math.min(H, Math.round((ymax / 1000) * H + padY));
  const cw = x1 - x0;
  const ch = y1 - y0;
  if (cw < 4 || ch < 4) return null;
  const c = document.createElement('canvas');
  c.width = cw;
  c.height = ch;
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  // 白底，避免透明 PNG 在题卡上发灰
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, cw, ch);
  ctx.drawImage(canvas, x0, y0, cw, ch, 0, 0, cw, ch);
  try {
    return c.toDataURL('image/png').split(',')[1] ?? null;
  } catch {
    return null; // 跨域污染
  }
}

/** Gemini bbox [ymin,xmin,ymax,xmax] → RawFigure 用的 [x1,y1,x2,y2]（与 cv-service box 同序，喂给阅读顺序排序）。 */
export function toXYXY(box: [number, number, number, number]): [number, number, number, number] {
  const [ymin, xmin, ymax, xmax] = box;
  return [xmin, ymin, xmax, ymax];
}
