"""端到端测试：真实 Pipeline B（OCR→inpaint→VTracer→overpic）+ Mock A。

首次运行会触发 easyocr 下载模型（~100MB），稍慢。
"""

from __future__ import annotations

import base64
import io

import pytest
from fastapi.testclient import TestClient
from PIL import Image, ImageDraw, ImageFont

from app.main import app
from app.pipelines.pipeline_b.processor import PipelineBProcessor

client = TestClient(app)

_FONT_CANDIDATES = [
    "/System/Library/Fonts/Supplemental/Arial.ttf",
    "/System/Library/Fonts/Helvetica.ttc",
]


def _font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    for path in _FONT_CANDIDATES:
        try:
            return ImageFont.truetype(path, size)
        except OSError:
            continue
    return ImageFont.load_default()


def _synthetic_geometry_png() -> bytes:
    """白底 + 黑色圆/直线 + A、B、O 三个标注，模拟一道几何图。"""
    img = Image.new("RGB", (640, 480), "white")
    d = ImageDraw.Draw(img)
    d.ellipse([160, 80, 480, 400], outline="black", width=3)  # 圆
    d.line([160, 240, 480, 240], fill="black", width=3)        # 水平直径
    font = _font(40)  # 大号清晰字母，利于 OCR 召回（小字号 easyocr 几乎读不到）
    d.text((118, 220), "A", fill="black", font=font)
    d.text((492, 220), "B", fill="black", font=font)
    d.text((300, 250), "O", fill="black", font=font)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def test_health() -> None:
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"


def test_pipeline_b_real_outputs() -> None:
    result = PipelineBProcessor().process(_synthetic_geometry_png())

    # 确定性产物：必须有 SVG + 可编译 PDF + overpic 代码
    assert result.pipeline == "B"
    assert result.svg and "<svg" in result.svg
    assert result.overpic_latex and "\\begin{overpic}" in result.overpic_latex
    pdf = base64.b64decode(result.pdf_base64)
    assert pdf[:5] == b"%PDF-", "cairosvg 应产出有效 PDF"

    # 标签为 overpic 百分比坐标，范围合法
    for lb in result.labels:
        assert 0 <= lb.x_percent <= 100 and 0 <= lb.y_percent <= 100


def test_pipeline_b_ocr_detects_letters() -> None:
    """OCR 召回（已知较脆）：合成大字母图至少应识别到 1 个标签。"""
    result = PipelineBProcessor().process(_synthetic_geometry_png())
    assert len(result.labels) >= 1, f"OCR 未召回任何标签，实际={result.labels}"


def test_pipeline_a_mock_shape() -> None:
    tiny_png = base64.b64encode(
        bytes.fromhex(
            "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4"
            "890000000a49444154789c6300010000050001a5f645400000000049454e44ae426082"
        )
    ).decode()
    resp = client.post("/pipeline-a/process", json={"image_base64": tiny_png})
    assert resp.status_code == 200
    body = resp.json()
    assert body["pipeline"] == "A"
    assert body["tikz"]
