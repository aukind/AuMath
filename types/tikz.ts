// 与后端 math-cv-service/app/models/schemas.py 对齐的共享类型。

export type PipelineId = 'A' | 'B';

/** 几何标注。坐标为 overpic 百分比：左下原点、y 向上。 */
export interface GeoLabel {
  text: string;
  x_percent: number;
  y_percent: number;
  confidence?: number | null; // OCR 置信度（0~1）；人工新增标签为 undefined
}

export interface ProcessResult {
  success: boolean;
  pipeline: PipelineId;
  used_engine?: string | null;
  // Pipeline B
  svg?: string | null;
  labels: GeoLabel[];
  overpic_latex?: string | null;
  pdf_base64?: string | null;
  clean_image_base64?: string | null;
  // Pipeline A
  tikz?: string | null;
  phash?: string | null; // 源图感知哈希（字符串，避免 JS 64-bit 丢精度）
  error?: string | null;
}

export interface RasterizePage {
  page: number;
  image_base64: string;
  width: number;
  height: number;
}

export interface FigureBox {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  confidence: number;
  crop_base64: string; // 该图区域裁剪 PNG（base64，无前缀）
}
