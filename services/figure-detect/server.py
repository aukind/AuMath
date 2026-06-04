"""figure-detect：DocLayout-YOLO 版面检测的极薄 HTTP 服务（Fly 部署）。

只做一件事：给一张试卷页面图 → 返回页面上各「配图」的边界框（figure 类）。
栅格化与像素级裁剪都在 Next.js 客户端完成（pdf.js/canvas），本服务不碰。

契约（与 math-cv-service 的 /detect-figures 对齐，Next 侧 app/actions/detect-figures.ts 消费）：
  POST /detect-figures  { image_base64 }  →
    { success, figures:[{x1,y1,x2,y2,confidence}], page_width, page_height }
    坐标为**像素**，相对返回的 page_width/page_height（已按 MAX_EDGE_PX 缩放后的尺寸）。
  GET  /healthz → "ok"
"""

from __future__ import annotations

from fastapi import Depends, FastAPI, Header, HTTPException, status
from pydantic import BaseModel

from config import get_settings
from images import collect, decode_bgr, decode_data_image
from layout import detect_figure_boxes

app = FastAPI(title="figure-detect", version="1.0.0")


async def require_token(x_cv_token: str | None = Header(default=None)) -> None:
    """若配置了 CV_SERVICE_TOKEN，则校验 X-CV-Token 头；留空则放行（本地开发）。"""
    expected = get_settings().cv_service_token
    if expected and x_cv_token != expected:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "无效或缺失 X-CV-Token")


class DetectRequest(BaseModel):
    image_base64: str


class FigureBox(BaseModel):
    x1: int
    y1: int
    x2: int
    y2: int
    confidence: float


class DetectResponse(BaseModel):
    success: bool
    figures: list[FigureBox] = []
    page_width: int = 0
    page_height: int = 0
    error: str | None = None


@app.get("/healthz")
async def healthz() -> str:
    return "ok"


@app.post("/detect-figures", response_model=DetectResponse, dependencies=[Depends(require_token)])
async def detect_figures(req: DetectRequest) -> DetectResponse:
    image = decode_data_image(req.image_base64)
    img = None
    try:
        img = decode_bgr(image)  # 内部按 MAX_EDGE_PX 缩放；返回框坐标与此尺寸一致
        h, w = img.shape[:2]
        boxes = detect_figure_boxes(img)
        figures = [
            FigureBox(x1=x1, y1=y1, x2=x2, y2=y2, confidence=round(cf, 3))
            for (x1, y1, x2, y2, cf) in boxes
        ]
        return DetectResponse(success=True, figures=figures, page_width=w, page_height=h)
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        return DetectResponse(success=False, error=str(exc))
    finally:
        del image
        if img is not None:
            del img
        collect()
