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


_device_override: str | None = None  # MPS 一旦失败就永久回退 cpu，避免每页重复试错

# ── CoreML/ONNX 后端（onnxruntime + CoreML执行器，走 ANE，纯推理实测 ~6x）──────────────
_FIGURE_CLASS_ID = 3   # DocStructBench: 0 title,1 plain text,2 abandon,3 figure,4 figure_caption…
_ort_session = None    # onnxruntime 会话单例
_coreml_disabled = False  # 初始化/推理失败 → 永久回退 torch


def _get_onnx_session():
    """懒加载 onnxruntime 会话，优先 CoreML执行器(ANE)，回退 CPU。缺 onnx 则即时导出。"""
    global _ort_session
    if _ort_session is not None:
        return _ort_session
    import os
    import onnxruntime as ort
    from huggingface_hub import hf_hub_download

    settings = get_settings()
    weight = hf_hub_download(repo_id=settings.doclayout_model, filename=settings.doclayout_weight_file)
    onnx_path = weight.replace(".pt", ".onnx")
    if not os.path.exists(onnx_path):
        from doclayout_yolo import YOLOv10
        print("[layout] 首次使用 coreml 后端：导出 ONNX …", flush=True)
        onnx_path = YOLOv10(weight).export(format="onnx", imgsz=settings.detect_imgsz, opset=12)
    providers = [p for p in ("CoreMLExecutionProvider", "CPUExecutionProvider") if p in ort.get_available_providers()]
    _ort_session = ort.InferenceSession(onnx_path, providers=providers)
    print(f"[layout] onnx 会话就绪 providers={_ort_session.get_providers()}", flush=True)
    return _ort_session


def _letterbox(img_bgr: np.ndarray, size: int):
    """等比缩放 + 居中补边到 size×size（值 114），返回 (画布, scale, pad_x, pad_y)。与 ultralytics 一致。"""
    import cv2
    h, w = img_bgr.shape[:2]
    scale = min(size / w, size / h)
    nw, nh = round(w * scale), round(h * scale)
    canvas = np.full((size, size, 3), 114, np.uint8)
    px, py = (size - nw) // 2, (size - nh) // 2
    canvas[py:py + nh, px:px + nw] = cv2.resize(img_bgr, (nw, nh), interpolation=cv2.INTER_LINEAR)
    return canvas, scale, px, py


def _detect_coreml_raw(img_bgr: np.ndarray) -> list[tuple[float, float, float, float, float]]:
    """ANE 推理：返回 figure 类的原图坐标 (x1,y1,x2,y2,conf)，未夹边未 NMS。"""
    import cv2
    settings = get_settings()
    size = settings.detect_imgsz
    canvas, scale, px, py = _letterbox(img_bgr, size)
    rgb = cv2.cvtColor(canvas, cv2.COLOR_BGR2RGB)  # ultralytics 用 RGB
    blob = np.ascontiguousarray(np.transpose(rgb.astype(np.float32) / 255.0, (2, 0, 1))[None])
    sess = _get_onnx_session()
    out = sess.run(None, {sess.get_inputs()[0].name: blob})[0]  # (1,300,6)=[x1,y1,x2,y2,score,cls]
    res: list[tuple[float, float, float, float, float]] = []
    for row in out[0]:
        score = float(row[4])
        if int(round(row[5])) != _FIGURE_CLASS_ID or score < settings.detect_conf:
            continue
        # 撤销 letterbox → 原图坐标
        res.append(((row[0] - px) / scale, (row[1] - py) / scale,
                    (row[2] - px) / scale, (row[3] - py) / scale, score))
    return res


def _detect_torch_raw(img_bgr: np.ndarray) -> list[tuple[float, float, float, float, float]]:
    """PyTorch 推理：返回 figure 类的原图坐标 (x1,y1,x2,y2,conf)，未夹边未 NMS。device 出错回退 cpu。"""
    global _device_override
    settings = get_settings()
    device = _device_override or settings.detect_device
    try:
        results = get_model().predict(img_bgr, imgsz=settings.detect_imgsz, conf=settings.detect_conf, device=device, verbose=False)
    except Exception as exc:  # noqa: BLE001 — device 不兼容 → 回退 cpu
        if device == "cpu":
            raise
        print(f"[layout] device={device} 失败，回退 cpu：{str(exc)[:120]}", flush=True)
        _device_override = "cpu"
        results = get_model().predict(img_bgr, imgsz=settings.detect_imgsz, conf=settings.detect_conf, device="cpu", verbose=False)
    res = results[0]
    names = res.names
    xyxy = res.boxes.xyxy.cpu().numpy()
    cls = res.boxes.cls.cpu().numpy()
    conf = res.boxes.conf.cpu().numpy()
    return [(x1, y1, x2, y2, float(cf)) for (x1, y1, x2, y2), c, cf in zip(xyxy, cls, conf)
            if names[int(c)] == _FIGURE_CLASS]


def detect_figure_boxes(img_bgr: np.ndarray) -> list[tuple[int, int, int, int, float]]:
    """返回 [(x1,y1,x2,y2,conf), ...]，仅 figure 类，夹到图内、过滤极小框、按置信度降序去重叠。"""
    global _coreml_disabled
    settings = get_settings()
    raw: list[tuple[float, float, float, float, float]]
    if settings.detect_backend == "coreml" and not _coreml_disabled:
        try:
            raw = _detect_coreml_raw(img_bgr)
        except Exception as exc:  # noqa: BLE001 — coreml 不可用 → 永久回退 torch
            print(f"[layout] coreml 后端失败，永久回退 torch：{str(exc)[:160]}", flush=True)
            _coreml_disabled = True
            raw = _detect_torch_raw(img_bgr)
    else:
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
