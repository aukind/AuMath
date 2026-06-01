"""POST /pipeline-b/process —— 逆向工程路线（MVP 主体，Step 1 暂返回 Mock）。"""

from __future__ import annotations

from fastapi import APIRouter, Depends

from app.models.schemas import GeoLabel, ProcessRequest, ProcessResponse
from app.pipelines.pipeline_b.processor import PipelineBProcessor
from app.utils.images import collect, decode_data_image
from app.utils.security import require_token

router = APIRouter(prefix="/pipeline-b", tags=["pipeline-b"], dependencies=[Depends(require_token)])

_processor = PipelineBProcessor()


@router.post("/process", response_model=ProcessResponse)
async def process(req: ProcessRequest) -> ProcessResponse:
    image = decode_data_image(req.image_base64)
    try:
        result = _processor.process(image, req.mime_type)
    finally:
        del image
        collect()
    return ProcessResponse(
        success=True,
        pipeline="B",
        used_engine=result.used_engine,
        svg=result.svg,
        labels=[
            GeoLabel(text=l.text, x_percent=l.x_percent, y_percent=l.y_percent, confidence=l.confidence)
            for l in result.labels
        ],
        overpic_latex=result.overpic_latex,
        pdf_base64=result.pdf_base64,
        clean_image_base64=result.clean_image_base64,
        phash=result.phash,
    )
