from fastapi import APIRouter

from app import SERVICE_NAME, SERVICE_VERSION

router = APIRouter(tags=["health"])


@router.get("/health")
async def health() -> dict:
    return {"status": "ok", "service": SERVICE_NAME, "version": SERVICE_VERSION}
