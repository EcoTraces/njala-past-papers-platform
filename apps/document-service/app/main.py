from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.logging import configure_logging
from app.routers import health, jobs

configure_logging()

app = FastAPI(
    title="Njala Past Papers - Document Processing Service",
    description="Internal service for PDF text extraction and OCR. Only callable by the Node API.",
    version="0.1.0",
    docs_url="/docs",
    openapi_url="/openapi.json",
)

# This service is only ever called server-to-server by apps/api, never
# directly by a browser, so CORS is deliberately locked down rather
# than left wide open.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[],
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(jobs.router)


@app.get("/")
async def root() -> dict[str, str]:
    return {"service": "njala-document-service", "env": settings.document_service_env}
