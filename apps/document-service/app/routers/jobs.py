import asyncio

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

# Bounds how many jobs actually run extraction at once (see the setting's
# own docstring in core/config.py) - acquired around the whole download+
# extract body below, not just extraction, since a queued download also
# holds file_bytes in memory. Module-level and created once at import
# time: every job submitted to this process shares the same semaphore.
_processing_semaphore = asyncio.Semaphore(settings.max_concurrent_processing_jobs)


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

    # A job waiting here for a free slot is genuinely still queued, not
    # processing yet, so the PROCESSING callback (which flips the
    # paper's ocr_status - see Node's internal.routes.ts) is sent only
    # once real work actually begins, not merely once this background
    # task was scheduled.
    async with _processing_semaphore:
        await send_callback(ProcessingCallback(job_id=job.job_id, paper_id=job.paper_id, status="PROCESSING"))
        await _run_job(job)


async def _run_job(job: JobRequest) -> None:
    try:
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                response = await client.get(job.file_url)
                response.raise_for_status()
                file_bytes = response.content
        except httpx.HTTPError as exc:
            # A network blip or an expired/unreachable signed URL - the
            # bytes were never even inspected, so a retry against a
            # freshly re-signed URL is worth trying.
            raise _RecoverableJobError(f"Could not download the file to process: {exc}") from exc

        if len(file_bytes) > settings.max_upload_mb * 1024 * 1024:
            # Not recoverable: re-fetching the exact same file produces
            # the exact same size every time.
            raise UnprocessablePdfError(f"File exceeds {settings.max_upload_mb}MB limit")

        try:
            # extract_document is synchronous/CPU-bound (PyMuPDF page
            # rendering, Tesseract OCR) - run it off the event loop so
            # one job's extraction can't stall this service's health
            # checks or its ability to accept/report on other jobs
            # concurrently, and so the timeout below is actually
            # enforceable (a plain blocking call can't be cancelled by
            # asyncio.wait_for on its own).
            result = await asyncio.wait_for(
                asyncio.to_thread(extract_document, file_bytes),
                timeout=settings.processing_timeout_seconds,
            )
        except TimeoutError as exc:
            raise _RecoverableJobError(
                f"Processing timed out after {settings.processing_timeout_seconds}s"
            ) from exc

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

    except UnprocessablePdfError as exc:
        # Corrupt/invalid/oversized - retrying the identical bytes
        # changes nothing. Terminal until a human intervenes (a
        # different file, a manual reprocess after a config change).
        logger.error("job.failed.unprocessable", job_id=job.job_id, error=str(exc))
        await send_callback(
            ProcessingCallback(
                job_id=job.job_id, paper_id=job.paper_id, status="FAILED", error_message=str(exc), recoverable=False
            )
        )
    except _RecoverableJobError as exc:
        logger.error("job.failed.recoverable", job_id=job.job_id, error=str(exc))
        await send_callback(
            ProcessingCallback(
                job_id=job.job_id, paper_id=job.paper_id, status="FAILED", error_message=str(exc), recoverable=True
            )
        )
    except Exception as exc:  # noqa: BLE001 - any other failure must still report back
        # An unexpected/unclassified error (e.g. an OCR-engine crash) -
        # treated as recoverable by default, since assuming the worst
        # (permanently giving up) is a worse failure mode than one
        # extra automatic retry for something that turns out not to be
        # transient.
        logger.error("job.failed.unexpected", job_id=job.job_id, error=str(exc))
        await send_callback(
            ProcessingCallback(
                job_id=job.job_id, paper_id=job.paper_id, status="FAILED", error_message=str(exc), recoverable=True
            )
        )


class _RecoverableJobError(Exception):
    """Internal-only signal for a failure worth automatically retrying
    (network/timeout) - never sent over the wire itself, only used to
    pick the right `recoverable` flag on the FAILED callback."""


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
