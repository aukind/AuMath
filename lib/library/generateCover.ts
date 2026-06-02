// 客户端封面生成：从已上传的公开 PDF URL 取第 1 页渲染成缩略图 JPEG。
// 内存安全：getDocument 走 Range（disableAutoFetch），只取首页所需的几十 KB，不下整文。
// 仅在浏览器运行时通过 import() 动态加载（其依赖 react-pdf/pdfjs 不可在 SSR 求值）。

import { pdfjs } from './pdf-worker';

/** 取 PDF 第 1 页 → JPEG Blob（失败返回 null，调用方静默忽略即可）。 */
export async function generateCoverBlob(
  pdfUrl: string,
  targetWidth = 480,
): Promise<Blob | null> {
  const task = pdfjs.getDocument({
    url: pdfUrl,
    disableAutoFetch: true,
    rangeChunkSize: 1 << 16,
  });
  try {
    const pdf = await task.promise;
    const page = await pdf.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const scale = targetWidth / base.width;
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    if (!canvas.getContext('2d')) return null;

    // pdfjs 5.x：传 DOM canvas（canvasContext 已转为 legacy）。
    await page.render({ canvas, viewport }).promise;
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.82),
    );
    pdf.cleanup();
    return blob;
  } catch {
    return null;
  } finally {
    task.destroy();
  }
}
