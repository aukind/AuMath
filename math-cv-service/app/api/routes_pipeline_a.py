"""POST /pipeline-a/process —— 生成式路线（MVP: Mock，真实后端=DeTikZify/Phase 2）。"""

from __future__ import annotations

from fastapi import APIRouter, Depends

from app.config import get_settings
from app.models.schemas import ProcessRequest, ProcessResponse
from app.pipelines.base import Pipeline
from app.utils.images import collect, decode_data_image
from app.utils.security import require_token

router = APIRouter(prefix="/pipeline-a", tags=["pipeline-a"], dependencies=[Depends(require_token)])

_pipeline: Pipeline | None = None


def _get_pipeline() -> Pipeline:
    """按 config 选引擎；detikzify/torch 仅在启用时才 import（不拖累 mock/B）。"""
    global _pipeline
    if _pipeline is None:
        engine = get_settings().pipeline_a_engine
        if engine == "detikzify":
            from app.pipelines.pipeline_a_detikzify import DetikzifyPipelineA

            _pipeline = DetikzifyPipelineA()
        elif engine == "hf-space":
            from app.pipelines.pipeline_a_hfspace import HfSpacePipelineA

            _pipeline = HfSpacePipelineA()
        else:
            from app.pipelines.pipeline_a_mock import MockPipelineA

            _pipeline = MockPipelineA()
    return _pipeline


@router.post("/process", response_model=ProcessResponse)
async def process(req: ProcessRequest) -> ProcessResponse:
    image = decode_data_image(req.image_base64)
    try:
        result = _get_pipeline().process(image, req.mime_type)
    finally:
        del image
        collect()
    return ProcessResponse(
        success=True,
        pipeline="A",
        used_engine=result.used_engine,
        tikz=result.tikz,
    )
