import httpx
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status

from app.core.config import settings
from app.core.logging import get_logger
from app.core.security import verify_internal_secret
from app.models.job import JobAccepted, JobRequest, ProcessingCallback
from app.services.callback import send_callback
from app.services.pdf_processing import UnprocessablePdfError, extract_document

router = APIRouter(prefix="/jobs", tags=["jobs"])
logger = get_logger(__name__)


@router.post(
    "",
    response_model=JobAccepted,
    status_code=status.HTTP_202_ACCEPTED,
    dependencies=[Depends(verify_internal_secret)],
)
async def create_job(job: JobRequest, background_tasks: BackgroundTasks) -> JobAccepted:
    """Accepts a processing job and returns immediately (202); the
    actual extraction/OCR happens in the background so the Node API's
    upload request is never blocked on this. Result is reported back
    via the configured callback URL."""
    background_tasks.add_task(_process_job, job)
    return JobAccepted(job_id=job.job_id)


async def _process_job(job: JobRequest) -> None:
    logger.info("job.started", job_id=job.job_id, paper_id=job.paper_id)
    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.get(job.file_url)
            response.raise_for_status()
            file_bytes = response.content

        if len(file_bytes) > settings.max_upload_mb * 1024 * 1024:
            raise UnprocessablePdfError(f"File exceeds {settings.max_upload_mb}MB limit")

        result = extract_document(file_bytes)

        await send_callback(
            ProcessingCallback(
                job_id=job.job_id,
                paper_id=job.paper_id,
                status="COMPLETED",
                extracted_text=result.extracted_text,
                page_count=result.page_count,
                ocr_used=result.ocr_used,
            )
        )
        logger.info("job.completed", job_id=job.job_id, page_count=result.page_count, ocr_used=result.ocr_used)

    except Exception as exc:  # noqa: BLE001 - any failure must still report back
        logger.error("job.failed", job_id=job.job_id, error=str(exc))
        await send_callback(
            ProcessingCallback(job_id=job.job_id, paper_id=job.paper_id, status="FAILED", error_message=str(exc))
        )


@router.post("/sync-extract", dependencies=[Depends(verify_internal_secret)])
async def sync_extract(job: JobRequest) -> ProcessingCallback:
    """Synchronous variant used by integration tests and by operators
    needing an immediate result rather than the async callback flow."""
    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.get(job.file_url)
            response.raise_for_status()
            file_bytes = response.content
        result = extract_document(file_bytes)
        return ProcessingCallback(
            job_id=job.job_id,
            paper_id=job.paper_id,
            status="COMPLETED",
            extracted_text=result.extracted_text,
            page_count=result.page_count,
            ocr_used=result.ocr_used,
        )
    except UnprocessablePdfError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
