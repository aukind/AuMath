"""POST /detect-figures —— 自动找出页面里的几何图，返回各图裁剪。

前端拿到候选图后，用户点选某张即可送 Pipeline B（免手动框选）。
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status

from app.models.schemas import DetectResponse, FigureBox, ProcessRequest
from app.utils.images import collect, decode_bgr, decode_data_image, encode_base64, encode_png_bgr
from app.utils.security import require_token

router = APIRouter(tags=["detect"], dependencies=[Depends(require_token)])


@router.post("/detect-figures", response_model=DetectResponse)
async def detect_figures(req: ProcessRequest) -> DetectResponse:
    image = decode_data_image(req.image_base64)
    img = None
    try:
        img = decode_bgr(image)  # 内部按 MAX_EDGE_PX 缩放；裁剪坐标与之一致
        h, w = img.shape[:2]
        try:
            from app.detection.layout import detect_figure_boxes
        except ImportError as exc:
            raise HTTPException(
                status.HTTP_503_SERVICE_UNAVAILABLE,
                "未安装版面检测依赖：pip install -r requirements-detection.txt",
            ) from exc

        boxes = detect_figure_boxes(img)
        figures: list[FigureBox] = []
        for x1, y1, x2, y2, conf in boxes:
            crop = img[y1:y2, x1:x2]
            figures.append(
                FigureBox(
                    x1=x1, y1=y1, x2=x2, y2=y2,
                    confidence=round(conf, 3),
                    crop_base64=encode_base64(encode_png_bgr(crop)),
                )
            )
            del crop
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
