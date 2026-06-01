"""Pipeline 统一协议 —— A/B 彻底解耦的契约。

A（生成式）与 B（逆向工程）各自实现 `Pipeline`，路由层按前端开关选择。
返回 `PipelineResult` 这一与框架无关的 dataclass，HTTP 层再映射为 ProcessResponse。
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field


@dataclass
class GeoLabel:
    """几何标注。x/y 为 overpic 百分比坐标（左下原点，y 向上）。"""

    text: str
    x_percent: float
    y_percent: float
    confidence: float | None = None  # OCR 置信度（0~1）；人工新增标签为 None


@dataclass
class PipelineResult:
    pipeline: str
    used_engine: str | None = None
    # Pipeline B
    svg: str | None = None
    labels: list[GeoLabel] = field(default_factory=list)
    overpic_latex: str | None = None
    pdf_base64: str | None = None
    clean_image_base64: str | None = None
    # Pipeline A
    tikz: str | None = None
    # 源裁剪图感知哈希（有符号 64-bit 的十进制字符串），近重复去重用
    phash: str | None = None


class Pipeline(ABC):
    """喂入裁剪后的几何图字节，产出结构化矢量结果。"""

    name: str

    @abstractmethod
    def process(self, image: bytes, mime_type: str = "image/png") -> PipelineResult:
        ...
