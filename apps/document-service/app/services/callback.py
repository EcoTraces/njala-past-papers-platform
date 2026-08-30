import httpx

from app.core.config import settings
from app.core.logging import get_logger
from app.models.job import ProcessingCallback

logger = get_logger(__name__)


async def send_callback(callback: ProcessingCallback) -> None:
    payload = callback.model_dump(by_alias=True)
    headers = {"X-Internal-Secret": settings.document_service_shared_secret, "Content-Type": "application/json"}

    async with httpx.AsyncClient(timeout=15.0) as client:
        try:
            response = await client.post(settings.node_api_callback_url, json=payload, headers=headers)
            response.raise_for_status()
        except httpx.HTTPError as exc:
            # The job row in Postgres stays at its last known status if
            # this fails; docs/architecture/document-processing.md
            # covers manual/administrative retry via the library
            # dashboard's "processing failures" view.
            logger.error("callback.failed", job_id=callback.job_id, error=str(exc))
