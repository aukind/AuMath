"""overpic 代码组装 + SVG→PDF（cairosvg）。

overpic 坐标系：左下原点、y 向上、百分比。与前端 lib/tikz/overpic.ts 保持一致。
"""

from __future__ import annotations

import base64
import re

import cairosvg

from app.pipelines.base import GeoLabel

GRAPHIC_NAME = "clean_geometry.pdf"

_VIEWBOX_RE = re.compile(r'viewBox\s*=\s*["\']\s*[\d.]+\s+[\d.]+\s+([\d.]+)\s+([\d.]+)', re.I)
_WIDTH_RE = re.compile(r'\bwidth\s*=\s*["\']\s*([\d.]+)', re.I)
_HEIGHT_RE = re.compile(r'\bheight\s*=\s*["\']\s*([\d.]+)', re.I)
_XML_ESCAPE = {"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;"}


def _svg_dims(svg: str) -> tuple[float, float]:
    m = _VIEWBOX_RE.search(svg)
    if m:
        return float(m.group(1)), float(m.group(2))
    w = _WIDTH_RE.search(svg)
    h = _HEIGHT_RE.search(svg)
    return (float(w.group(1)) if w else 100.0, float(h.group(1)) if h else 100.0)


def bake_labels_into_svg(svg: str, labels: list[GeoLabel]) -> str:
    """把标签烘焙进 SVG 原生 <text>，产出可直接嵌题库的自包含 SVG。
    与前端 lib/tikz/overpic.ts 的 bakeLabelsIntoSvg 一致（不依赖 dominant-baseline）。"""
    w, h = _svg_dims(svg)
    fs = max(8.0, h * 0.05)
    texts = ""
    for lb in labels:
        x = lb.x_percent / 100 * w
        y = (1 - lb.y_percent / 100) * h + fs * 0.35  # overpic 左下原点→SVG，再下移近似垂直居中
        t = "".join(_XML_ESCAPE.get(c, c) for c in lb.text)
        texts += (
            f'<text x="{x:.1f}" y="{y:.1f}" font-size="{fs:.1f}" '
            f'font-style="italic" text-anchor="middle" fill="#000">{t}</text>'
        )
    return re.sub(r"</svg>\s*$", texts + "</svg>", svg, flags=re.I)


def build(svg: str, labels: list[GeoLabel]) -> tuple[str, str]:
    """返回 (overpic_latex, pdf_base64)。pdf 为 cairosvg 转出的干净底图，供 overpic 编译。"""
    pdf_bytes: bytes = cairosvg.svg2pdf(bytestring=svg.encode("utf-8"))

    lines = [f"\\begin{{overpic}}[percent]{{{GRAPHIC_NAME}}}"]
    for lb in labels:
        lines.append(f"  \\put({lb.x_percent:.1f},{lb.y_percent:.1f}){{${lb.text}$}}")
    lines.append("\\end{overpic}")

    return "\n".join(lines), base64.b64encode(pdf_bytes).decode("ascii")
