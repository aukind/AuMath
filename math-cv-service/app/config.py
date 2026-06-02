"""集中配置：从 .env 读取，全程单例。"""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # 鉴权：留空 = 关闭校验（本地开发）。自托管上线时务必设置。
    cv_service_token: str = ""

    # CORS 白名单（逗号分隔字符串）
    allowed_origins: str = "http://localhost:3000,http://127.0.0.1:3000"

    # 单张图片字节上限，与 Next serverActions.bodySizeLimit (15mb) 对齐
    max_image_bytes: int = 15 * 1024 * 1024

    # PDF 栅格化
    rasterize_dpi: int = 120  # 检测框不需高分；120 比 150 图更小、栅格化+YOLO 更快（大卷收益大）
    rasterize_max_pages: int = 30

    # 版面检测（DocLayout-YOLO，自动找几何图）。torch 已随 easyocr 在位。
    doclayout_model: str = "juliozhao/DocLayout-YOLO-DocStructBench"
    doclayout_weight_file: str = "doclayout_yolo_docstructbench_imgsz1024.pt"
    detect_device: str = "cpu"  # torch 后端用；实测 mps 单图反而更慢，故 cpu。layout.py 有出错回退
    # 检测后端："coreml" = ONNX + onnxruntime CoreML执行器(走 ANE，实测纯推理快 ~6x)；"torch" = 原 PyTorch。
    # coreml 路径若初始化失败（缺 onnx/onnxruntime 等）会自动回退 torch。
    detect_backend: str = "coreml"
    detect_conf: float = 0.2
    detect_imgsz: int = 1024
    # 成组小图（如三视图 图①-⑤）裁剪时向下扩，把下方「图①」编号一起裁进图；孤图不扩。
    caption_in_crop: bool = True

    # Pipeline A 引擎："mock"（默认）| "detikzify"（本地）| "hf-space"（云端，免本地部署）
    pipeline_a_engine: str = "mock"
    # 本地 DeTikZify：18GB 本机只能跑 tl-1.1b；8B 需大显存
    detikzify_model: str = "nllg/detikzify-tl-1.1b"
    detikzify_timeout: int = 0  # 0=单次 sample；>0=MCTS 秒数（取最高分），需 TeX Live/ghostscript
    # 云端 HF Space（gradio_client 调 /generate，可选任意模型，含 8B）
    detikzify_space: str = "nllg/DeTikZify"
    detikzify_space_api: str = "/generate"
    detikzify_space_model: str = "nllg/detikzify-v2.5-8b"  # 云端用最强 8B
    detikzify_space_alg: str = "sampling"  # 'sampling'(快) | 'mcts'(慢但自校验)
    hf_token: str = ""  # 私有/限流 Space 可能需要

    @property
    def origins_list(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
