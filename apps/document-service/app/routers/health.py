import shutil

from fastapi import APIRouter

from app.core.config import settings

router = APIRouter(tags=["health"])


@router.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/health/ready")
async def readiness() -> dict[str, object]:
    tesseract_available = shutil.which(settings.tesseract_cmd) is not None
    return {"status": "ok" if tesseract_available else "degraded", "tesseract": tesseract_available}
