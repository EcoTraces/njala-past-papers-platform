from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Environment-driven configuration. See root .env.example."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    document_service_port: int = 8000
    document_service_env: str = "development"

    # Shared secret this service requires from the Node API on inbound
    # /jobs calls, and presents to the Node API on outbound callbacks.
    document_service_shared_secret: str = "change-me-in-production"
    node_api_callback_url: str = "http://localhost:4000/api/internal/processing-callback"

    tesseract_cmd: str = "tesseract"
    ocr_language: str = "eng"
    max_upload_mb: int = 25

    # Below this ratio of extractable characters per page, the document
    # is treated as scanned/image-based and routed through OCR.
    ocr_trigger_chars_per_page: int = 40

    # Hard ceiling on a single job's extraction/OCR work (runs in a
    # worker thread so this timeout is actually enforceable - see
    # routers/jobs.py). A pathological PDF (huge page count, an image
    # that pins Tesseract) fails the job cleanly instead of tying up a
    # worker indefinitely.
    processing_timeout_seconds: int = 120

    # This service runs as a single uvicorn process (see Dockerfile),
    # and each job's extraction can hold a full file (up to
    # max_upload_mb) plus up to MAX_OCR_PAGES decoded page pixmaps in
    # memory at once. FastAPI's BackgroundTasks has no concurrency cap
    # of its own - a burst of simultaneous uploads would otherwise spawn
    # unboundedly many concurrent extractions and risk exhausting memory
    # (Loop 14 perf audit). This bounds how many jobs actually run
    # extraction at once; jobs beyond the limit wait their turn rather
    # than being rejected, so nothing is dropped, just queued.
    max_concurrent_processing_jobs: int = 3


settings = Settings()
