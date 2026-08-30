"""End-to-end tests for the async job pipeline in routers/jobs.py:
_process_job's PROCESSING -> COMPLETED/FAILED callback sequence, the
recoverable/non-recoverable classification the Node API's auto-retry
decision depends on, and the timeout ceiling. Mocks only the network
boundary (the file download and the callback POST, via respx) - the
real extraction/OCR code runs unmodified.
"""

from __future__ import annotations

import asyncio
import json

import fitz
import httpx
import pytest
import respx

from app.core.config import settings
from app.models.job import JobRequest
from app.routers.jobs import _process_job


def _build_text_pdf(text: str = "Sample examination question: what is 2 + 2?") -> bytes:
    document = fitz.open()
    page = document.new_page()
    page.insert_text((72, 72), text)
    data = document.tobytes()
    document.close()
    return data


def _job(file_url: str = "https://storage.example.com/paper.pdf") -> JobRequest:
    return JobRequest(
        jobId="11111111-1111-1111-1111-111111111111",
        paperId="22222222-2222-2222-2222-222222222222",
        fileUrl=file_url,
    )


@pytest.mark.asyncio
@respx.mock
async def test_process_job_reports_processing_then_completed_for_a_real_pdf() -> None:
    file_url = "https://storage.example.com/paper.pdf"
    respx.get(file_url).mock(return_value=httpx.Response(200, content=_build_text_pdf()))
    callback_route = respx.post(settings.node_api_callback_url).mock(return_value=httpx.Response(204))

    await _process_job(_job(file_url))

    assert callback_route.call_count == 2
    first_call, second_call = callback_route.calls
    first_body = json.loads(first_call.request.content)
    second_body = json.loads(second_call.request.content)

    assert first_body["status"] == "PROCESSING"
    assert second_body["status"] == "COMPLETED"
    assert "2 + 2" in second_body["extractedText"]
    assert second_body["ocrUsed"] is False


@pytest.mark.asyncio
@respx.mock
async def test_process_job_reports_recoverable_failure_when_the_file_cannot_be_downloaded() -> None:
    file_url = "https://storage.example.com/expired-signed-url.pdf"
    respx.get(file_url).mock(return_value=httpx.Response(403, text="signed URL expired"))
    callback_route = respx.post(settings.node_api_callback_url).mock(return_value=httpx.Response(204))

    await _process_job(_job(file_url))

    assert callback_route.call_count == 2
    failed_body = json.loads(callback_route.calls[1].request.content)
    assert failed_body["status"] == "FAILED"
    assert failed_body["recoverable"] is True


@pytest.mark.asyncio
@respx.mock
async def test_process_job_reports_non_recoverable_failure_for_a_corrupt_pdf() -> None:
    file_url = "https://storage.example.com/corrupt.pdf"
    respx.get(file_url).mock(return_value=httpx.Response(200, content=b"this is not a pdf at all"))
    callback_route = respx.post(settings.node_api_callback_url).mock(return_value=httpx.Response(204))

    await _process_job(_job(file_url))

    failed_body = json.loads(callback_route.calls[1].request.content)
    assert failed_body["status"] == "FAILED"
    assert failed_body["recoverable"] is False


@pytest.mark.asyncio
@respx.mock
async def test_process_job_reports_non_recoverable_failure_for_an_oversized_file() -> None:
    file_url = "https://storage.example.com/huge.pdf"
    oversized = b"%PDF-1.7\n" + b"0" * (settings.max_upload_mb * 1024 * 1024 + 1)
    respx.get(file_url).mock(return_value=httpx.Response(200, content=oversized))
    callback_route = respx.post(settings.node_api_callback_url).mock(return_value=httpx.Response(204))

    await _process_job(_job(file_url))

    failed_body = json.loads(callback_route.calls[1].request.content)
    assert failed_body["status"] == "FAILED"
    assert failed_body["recoverable"] is False
    assert "exceeds" in failed_body["errorMessage"]


@pytest.mark.asyncio
@respx.mock
async def test_process_job_times_out_a_pathologically_slow_extraction_and_reports_it_as_recoverable(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    file_url = "https://storage.example.com/slow.pdf"
    respx.get(file_url).mock(return_value=httpx.Response(200, content=_build_text_pdf()))
    callback_route = respx.post(settings.node_api_callback_url).mock(return_value=httpx.Response(204))

    monkeypatch.setattr(settings, "processing_timeout_seconds", 0.05)

    def hanging_extract(_file_bytes: bytes):  # noqa: ANN202 - test double for extract_document
        import time

        time.sleep(2)
        raise AssertionError("should have been cancelled by the timeout long before this")

    monkeypatch.setattr("app.routers.jobs.extract_document", hanging_extract)

    await _process_job(_job(file_url))

    failed_body = json.loads(callback_route.calls[1].request.content)
    assert failed_body["status"] == "FAILED"
    assert failed_body["recoverable"] is True
    assert "timed out" in failed_body["errorMessage"]


@pytest.mark.asyncio
@respx.mock
async def test_process_job_offloads_extraction_so_the_event_loop_stays_responsive(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """extract_document is synchronous/CPU-bound; it must run off the
    event loop (asyncio.to_thread), not inline inside the coroutine -
    otherwise it would stall this service's ability to serve any other
    request (health checks, other jobs) for the duration.

    Proven deterministically rather than via a timing race: the faked
    extract_document blocks its *thread* until a concurrent coroutine
    signals it to proceed. If extraction were still called inline (not
    offloaded), the event loop would never get a chance to run that
    signalling coroutine, and the thread would sit blocked until its
    own 2s fallback timeout - so a fast finish here is only possible if
    offloading actually happened.
    """
    import threading

    from app.services.pdf_processing import ExtractionResult

    file_url = "https://storage.example.com/paper-for-concurrency-check.pdf"
    respx.get(file_url).mock(return_value=httpx.Response(200, content=_build_text_pdf()))
    respx.post(settings.node_api_callback_url).mock(return_value=httpx.Response(204))

    extraction_started = threading.Event()
    release_extraction = threading.Event()

    def blocking_extract(_file_bytes: bytes) -> ExtractionResult:
        extraction_started.set()
        release_extraction.wait(timeout=2)
        return ExtractionResult(page_count=1, extracted_text="ok", ocr_used=False)

    monkeypatch.setattr("app.routers.jobs.extract_document", blocking_extract)

    async def release_once_extraction_has_started() -> None:
        for _ in range(200):
            if extraction_started.is_set():
                break
            await asyncio.sleep(0.005)
        assert extraction_started.is_set(), "extraction never started - test setup is broken"
        release_extraction.set()

    loop = asyncio.get_event_loop()
    start = loop.time()
    await asyncio.gather(_process_job(_job(file_url)), release_once_extraction_has_started())
    elapsed = loop.time() - start

    # Comfortably below the 2s fallback timeout: proves the release
    # happened promptly (the event loop was free to run the signalling
    # coroutine concurrently) rather than the whole job waiting out the
    # full 2s because extraction had the loop pinned.
    assert elapsed < 1.0
