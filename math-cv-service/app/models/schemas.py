"""HTTP 层 Pydantic 模型。字段需与前端 types/tikz.ts 保持对齐。"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

PipelineId = Literal["A", "B"]


class GeoLabel(BaseModel):
    """几何图上的一个标注（字母/数字）。坐标为 overpic 百分比（左下原点，y 向上）。"""

    text: str
    x_percent: float = Field(ge=0, le=100)
    y_percent: float = Field(ge=0, le=100)
    confidence: float | None = None


# ── 处理请求 / 响应 ───────────────────────────────────────────────────────
class ProcessRequest(BaseModel):
    image_base64: str = Field(description="裁剪后的几何图，base64（可带 data URL 前缀）")
    mime_type: str = "image/png"


class ProcessResponse(BaseModel):
    success: bool
    pipeline: PipelineId
    used_engine: str | None = None
    # Pipeline B 产物
    svg: str | None = None
    labels: list[GeoLabel] = Field(default_factory=list)
    overpic_latex: str | None = None
    pdf_base64: str | None = None          # cairosvg 转出的干净底图 PDF（overpic 编译用）
    clean_image_base64: str | None = None  # 抹字后的位图预览（调试用，可选）
    # Pipeline A 产物
    tikz: str | None = None
    phash: str | None = None  # 源图感知哈希（字符串避免 JS 64-bit 丢精度）
    error: str | None = None


# ── PDF 栅格化 ────────────────────────────────────────────────────────────
class RasterizeRequest(BaseModel):
    pdf_base64: str
    dpi: int | None = None
    max_pages: int | None = None


class RasterizePage(BaseModel):
    page: int
    image_base64: str
    width: int
    height: int


class RasterizeResponse(BaseModel):
    success: bool
    pages: list[RasterizePage] = Field(default_factory=list)
    error: str | None = None


# ── 版面检测（自动找几何图）──────────────────────────────────────────────
class FigureBox(BaseModel):
    x1: int
    y1: int
    x2: int
    y2: int
    confidence: float
    crop_base64: str  # 该图区域裁剪出的 PNG，直接喂 Pipeline B


class DetectResponse(BaseModel):
    success: bool
    figures: list[FigureBox] = Field(default_factory=list)
    page_width: int = 0
    page_height: int = 0
    error: str | None = None


# ── 整页自动：检测 + 归属题号 + 还原矢量 + 烘焙内联 SVG ─────────────────────
class AutoFigure(BaseModel):
    question_number: int | None = None  # 归属题号；认不准为 null（前端列为「未归属」）
    crop_base64: str = ""               # 原图裁剪 PNG（无损位图嵌入用，和原卷一模一样）
    inline_svg: str = ""                # 矢量化产物（Pipeline B 烘焙 / 云端编译 SVG）
    svg: str = ""                       # 云端 8B 编译好的矢量 SVG（cloud-vector 模式）
    tikz: str = ""                      # 云端 8B 的 TikZ 源码
    labels: list[GeoLabel] = Field(default_factory=list)
    confidence: float                   # 检测置信度
    box: list[int]                      # [x1,y1,x2,y2]
    page: int | None = None             # 来自第几页（多页 PDF）


class AutoDocRequest(BaseModel):
    url: str                            # 签名 URL；后端直接 fetch，绕开 Server Action 体积限制
    file_type: Literal["pdf", "image"] = "image"
    vectorize: bool = True              # Pipeline B 矢量化（mode=image 时无关）
    mode: Literal["image", "cloud-vector"] = "image"  # image=裁原图；cloud-vector=云端8B→编译SVG
    job_id: str | None = None           # 进度跟踪：前端轮询 /auto-figures-progress/{job_id} 拿百分比


class AutoFiguresResponse(BaseModel):
    success: bool
    figures: list[AutoFigure] = Field(default_factory=list)
    page_width: int = 0
    page_height: int = 0
    error: str | None = None
