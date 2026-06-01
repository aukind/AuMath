"""版面检测：DocLayout-YOLO 找出页面里的几何图区域（figure 类）。

这是 MinerU 用的那个版面检测模型，单模型(~200MB)，远比整套 MinerU 轻。
模型单例懒加载；首次 predict 自动从 HuggingFace 下载权重。
重依赖（doclayout_yolo/torch）在函数内懒加载，模块导入保持轻量。
"""

from __future__ import annotations

import numpy as np

from app.config import get_settings

_model = None
_FIGURE_CLASS = "figure"  # DocStructBench 类名；排除 figure_caption


def get_model():
    global _model
    if _model is None:
        from doclayout_yolo import YOLOv10
        from huggingface_hub import hf_hub_download

        settings = get_settings()
        # hf_hub_download + YOLOv10(path) 比 from_pretrained 稳（后者会误抓默认 yolov10n.pt）
        weight = hf_hub_download(repo_id=settings.doclayout_model, filename=settings.doclayout_weight_file)
        _model = YOLOv10(weight)
    return _model


def detect_figure_boxes(img_bgr: np.ndarray) -> list[tuple[int, int, int, int, float]]:
    """返回 [(x1,y1,x2,y2,conf), ...]，仅 figure 类，按置信度降序。"""
    settings = get_settings()
    results = get_model().predict(
        img_bgr,
        imgsz=settings.detect_imgsz,
        conf=settings.detect_conf,
        device=settings.detect_device,
        verbose=False,
    )
    res = results[0]
    names = res.names
    h, w = img_bgr.shape[:2]

    xyxy = res.boxes.xyxy.cpu().numpy()
    cls = res.boxes.cls.cpu().numpy()
    conf = res.boxes.conf.cpu().numpy()

    boxes: list[tuple[int, int, int, int, float]] = []
    for (x1, y1, x2, y2), c, cf in zip(xyxy, cls, conf):
        if names[int(c)] != _FIGURE_CLASS:
            continue
        # 夹到图像范围，避免越界裁剪
        bx1, by1 = max(0, int(x1)), max(0, int(y1))
        bx2, by2 = min(w, int(x2)), min(h, int(y2))
        if bx2 - bx1 < 4 or by2 - by1 < 4:
            continue
        boxes.append((bx1, by1, bx2, by2, float(cf)))

    boxes.sort(key=lambda b: b[4], reverse=True)
    return boxes
