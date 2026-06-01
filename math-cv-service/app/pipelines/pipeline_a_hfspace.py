"""Pipeline A · 云端 HF Space（免本地部署，跑 8B）。

调官方 nllg/DeTikZify Space 的 /generate 端点（gradio_client）。绕开本机 18GB 限制，
直接用最强 detikzify-v2.5-8b。ZeroGPU 会排队，建议 alg='sampling'（快）；mcts 慢但自校验。

/generate 真实签名（view_api 探得）：
  predict(model, image_editor_dict, temp, top_p, top_k, penalty, timeout, expand, preprocess, alg)
    -> (tikz_code:str, compiled_image:filepath, gallery)
"""

from __future__ import annotations

import os
import tempfile
import time

from app.config import get_settings
from app.pipelines.base import Pipeline, PipelineResult

_RETRIES = 3  # 经代理到 HF 偶发 SSL EOF，重试常能过


def _read_compiled_svg(result) -> str:
    """Space /generate 第二项是编译好的图（dvisvgm 出的 SVG 文件路径）。读出来当矢量图用。"""
    if not isinstance(result, (list, tuple)) or len(result) < 2:
        return ""
    comp = result[1]
    path = comp if isinstance(comp, str) else (comp.get("path") or comp.get("name") if isinstance(comp, dict) else None)
    if not path or not os.path.exists(path):
        return ""
    try:
        with open(path, "rb") as fh:
            raw = fh.read()
        head = raw[:256].lstrip()
        if head.startswith(b"<svg") or head.startswith(b"<?xml"):
            return raw.decode("utf-8", "ignore")
    except OSError:
        pass
    return ""


class HfSpacePipelineA(Pipeline):
    name = "A"

    def __init__(self) -> None:
        self._client = None

    def _get_client(self):
        # 不缓存失败的 client；连不上时下次重建
        if self._client is None:
            from gradio_client import Client

            settings = get_settings()
            self._client = Client(settings.detikzify_space, hf_token=(settings.hf_token or None))
        return self._client

    def process(self, image: bytes, mime_type: str = "image/png") -> PipelineResult:
        from gradio_client import handle_file

        settings = get_settings()
        with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tf:
            tf.write(image)
            path = tf.name

        last_err: Exception | None = None
        try:
            for attempt in range(_RETRIES):
                try:
                    client = self._get_client()
                    img_input = {"background": handle_file(path), "layers": [], "composite": handle_file(path)}
                    result = client.predict(
                        settings.detikzify_space_model,  # 模型下拉
                        img_input,                        # ImageEditor
                        0.8, 0.95, 0, 0.6, 10,            # temp/top_p/top_k/penalty/timeout
                        False, True,                      # expand / preprocess
                        settings.detikzify_space_alg,     # 'sampling' | 'mcts'
                        api_name=settings.detikzify_space_api,
                    )
                    tikz = result[0] if isinstance(result, (list, tuple)) and result else (result if isinstance(result, str) else str(result))
                    svg = _read_compiled_svg(result)  # Space 已编译，直接拿矢量图
                    return PipelineResult(pipeline="A", used_engine=f"hf-space:{settings.detikzify_space_model}", tikz=tikz, svg=svg)
                except Exception as exc:  # noqa: BLE001
                    last_err = exc
                    self._client = None  # 链路坏了，重建
                    time.sleep(3)
        finally:
            try:
                os.unlink(path)
            except OSError:
                pass

        raise RuntimeError(f"云端 Space 调用失败（{_RETRIES} 次，多为代理到 HF 抖动）：{last_err}")
