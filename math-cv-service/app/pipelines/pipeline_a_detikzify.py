"""Pipeline A · DeTikZify（真实生成式，Phase 2）。

API 依官方 potamides/DeTikZify 核实：
    from detikzify.model import load
    from detikzify.infer import DetikzifyPipeline
    pipe = DetikzifyPipeline(*load(model_name_or_path=..., device_map="auto", torch_dtype="bfloat16"))
    fig = pipe.sample(image=PIL.Image)          # fig.code 为 TikZ 源码
    for score, fig in pipe.simulate(image, timeout=600): ...   # MCTS，取最高分

⚠️ 硬件现实：当前最小模型 8B（bf16≈16GB），18GB 统一内存跑不动；且 MCTS/rasterize
   需 TeX Live 2023 + ghostscript + poppler。故默认不启用（config.pipeline_a_engine="mock"），
   面向自托管机/大显存。依赖见 requirements-pipeline-a.txt。

重依赖（torch/detikzify/PIL）全部在方法内懒加载，模块导入保持轻量，不影响 mock 与 Pipeline B。
"""

from __future__ import annotations

import io

from app.config import get_settings
from app.pipelines.base import Pipeline, PipelineResult


class DetikzifyPipelineA(Pipeline):
    name = "A"

    def __init__(self) -> None:
        self._pipe = None  # 懒加载单例，避免每请求重载 8B 权重

    def _get_pipe(self):
        if self._pipe is None:
            from detikzify.infer import DetikzifyPipeline
            from detikzify.model import load

            settings = get_settings()
            self._pipe = DetikzifyPipeline(
                *load(
                    model_name_or_path=settings.detikzify_model,
                    device_map="auto",
                    torch_dtype="bfloat16",
                )
            )
        return self._pipe

    def process(self, image: bytes, mime_type: str = "image/png") -> PipelineResult:
        from PIL import Image

        settings = get_settings()
        pipe = self._get_pipe()
        img = Image.open(io.BytesIO(image)).convert("RGB")

        if settings.detikzify_timeout and settings.detikzify_timeout > 0:
            best = None  # MCTS：迭代取最高分
            for score, fig in pipe.simulate(image=img, timeout=settings.detikzify_timeout):
                if best is None or score > best[0]:
                    best = (score, fig)
            fig = best[1] if best is not None else pipe.sample(image=img)
        else:
            fig = pipe.sample(image=img)

        code = getattr(fig, "code", None) or str(fig)
        img.close()
        return PipelineResult(pipeline="A", used_engine=settings.detikzify_model, tikz=code)
