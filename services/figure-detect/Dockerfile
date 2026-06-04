# figure-detect 镜像：DocLayout-YOLO 版面检测（detection-only，CPU 推理）。
# 镜像里烤进模型权重，运行时首推不再联网下载。
FROM python:3.11-slim

# OpenCV / torch 运行所需的系统库（headless 仍需 libGL、glib）。
RUN apt-get update \
    && apt-get install -y --no-install-recommends libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 先单独装 CPU 版 torch/torchvision，避免 doclayout-yolo 拉到带 CUDA 的巨型默认轮子。
RUN pip install --no-cache-dir --index-url https://download.pytorch.org/whl/cpu \
    torch==2.3.1 torchvision==0.18.1

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# 构建期烤模型权重进 HF 缓存（放到固定目录，运行时非 root 用户可读）。
ENV HF_HOME=/opt/hf-cache
RUN python -c "from huggingface_hub import hf_hub_download; \
hf_hub_download(repo_id='juliozhao/DocLayout-YOLO-DocStructBench', filename='doclayout_yolo_docstructbench_imgsz1024.pt')" \
    && chmod -R a+rX /opt/hf-cache

COPY config.py images.py layout.py server.py ./

# 固定 torch 后端 + cpu；端口对齐 fly.toml internal_port。
ENV DETECT_DEVICE=cpu \
    PORT=8080 \
    PYTHONUNBUFFERED=1

# 非 root 运行（最小权限）。
RUN useradd -m -u 10001 cvrunner
USER cvrunner

EXPOSE 8080
CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8080"]
