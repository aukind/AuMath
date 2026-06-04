"""版面检测：DocLayout-YOLO 找出页面里的几何图区域（figure 类）。

源自 math-cv-service/app/detection/layout.py，**精简为 torch-only**：
Fly/Linux 无 Mac ANE，原 CoreML/ONNX 加速路径用不上，删掉以瘦身依赖。
torch 路径就是本地实测时 CoreML 不可用的回退路径，画质一致。

模型单例懒加载；权重已在 Docker build 期烤进 HF 缓存，运行时首推不再下载。
"""

from __future__ import annotations

import numpy as np

from config import get_settings

_model = None
_FIGURE_CLASS = "figure"  # DocStructBench 类名；排除 figure_caption
_device_override: str | None = None  # device 一旦失败就永久回退 cpu，避免每页重复试错


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


def _detect_torch_raw(img_bgr: np.ndarray) -> list[tuple[float, float, float, float, float]]:
    """PyTorch 推理：返回 figure 类的原图坐标 (x1,y1,x2,y2,conf)，未夹边未 NMS。device 出错回退 cpu。"""
    global _device_override
    settings = get_settings()
    device = _device_override or settings.detect_device
    try:
        results = get_model().predict(
            img_bgr, imgsz=settings.detect_imgsz, conf=settings.detect_conf, device=device, verbose=False
        )
    except Exception as exc:  # noqa: BLE001 — device 不兼容 → 回退 cpu
        if device == "cpu":
            raise
        print(f"[layout] device={device} 失败，回退 cpu：{str(exc)[:120]}", flush=True)
        _device_override = "cpu"
        results = get_model().predict(
            img_bgr, imgsz=settings.detect_imgsz, conf=settings.detect_conf, device="cpu", verbose=False
        )
    res = results[0]
    names = res.names
    xyxy = res.boxes.xyxy.cpu().numpy()
    cls = res.boxes.cls.cpu().numpy()
    conf = res.boxes.conf.cpu().numpy()
    return [
        (x1, y1, x2, y2, float(cf))
        for (x1, y1, x2, y2), c, cf in zip(xyxy, cls, conf)
        if names[int(c)] == _FIGURE_CLASS
    ]


def detect_figure_boxes(img_bgr: np.ndarray) -> list[tuple[int, int, int, int, float]]:
    """返回 [(x1,y1,x2,y2,conf), ...]，仅 figure 类，夹到图内、过滤极小框、按置信度降序去重叠。"""
    raw = _detect_torch_raw(img_bgr)

    h, w = img_bgr.shape[:2]
    boxes: list[tuple[int, int, int, int, float]] = []
    for (x1, y1, x2, y2, cf) in raw:
        bx1, by1 = max(0, int(x1)), max(0, int(y1))
        bx2, by2 = min(w, int(x2)), min(h, int(y2))
        if bx2 - bx1 < 4 or by2 - by1 < 4:  # 夹边 + 过滤极小框（越界/噪声）
            continue
        boxes.append((bx1, by1, bx2, by2, float(cf)))
    boxes.sort(key=lambda b: b[4], reverse=True)
    return _nms(boxes)


def _iou(a, b) -> float:
    ax1, ay1, ax2, ay2 = a[:4]
    bx1, by1, bx2, by2 = b[:4]
    ix1, iy1 = max(ax1, bx1), max(ay1, by1)
    ix2, iy2 = min(ax2, bx2), min(ay2, by2)
    iw, ih = max(0, ix2 - ix1), max(0, iy2 - iy1)
    inter = iw * ih
    if inter == 0:
        return 0.0
    area_a = (ax2 - ax1) * (ay2 - ay1)
    area_b = (bx2 - bx1) * (by2 - by1)
    return inter / float(area_a + area_b - inter)


def _nms(boxes: list, iou_thresh: float = 0.4) -> list:
    """去重叠检测框（DocLayout 偶把一张图检成多个框 → 一题塞两图）。已按 conf 降序。"""
    kept: list = []
    for b in boxes:
        if all(_iou(b, k) < iou_thresh for k in kept):
            kept.append(b)
    return kept
