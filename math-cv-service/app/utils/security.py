"""共享密钥鉴权（预留）：Server Action 带 X-CV-Token 头。

留空 CV_SERVICE_TOKEN 时放行，便于本地开发；自托管上线时设置即生效。
"""

from fastapi import Header, HTTPException, status

from app.config import get_settings


async def require_token(x_cv_token: str | None = Header(default=None)) -> None:
    expected = get_settings().cv_service_token
    if not expected:
        return  # 未配置 token → 开发模式放行
    if x_cv_token != expected:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="invalid or missing X-CV-Token",
        )
