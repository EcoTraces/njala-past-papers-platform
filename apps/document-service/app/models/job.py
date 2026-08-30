from typing import Literal

from pydantic import BaseModel, Field


class JobRequest(BaseModel):
    job_id: str = Field(alias="jobId")
    paper_id: str = Field(alias="paperId")
    file_url: str = Field(alias="fileUrl")

    model_config = {"populate_by_name": True}


class JobAccepted(BaseModel):
    job_id: str
    status: Literal["QUEUED"] = "QUEUED"


class ProcessingCallback(BaseModel):
    job_id: str = Field(serialization_alias="jobId")
    paper_id: str = Field(serialization_alias="paperId")
    # PROCESSING is sent once, as soon as the background task actually
    # starts work (distinct from QUEUED, which the Node API sets the
    # instant it creates the job row) - see routers/jobs.py.
    status: Literal["PROCESSING", "COMPLETED", "FAILED"]
    extracted_text: str | None = Field(default=None, serialization_alias="extractedText")
    page_count: int | None = Field(default=None, serialization_alias="pageCount")
    ocr_used: bool = Field(default=False, serialization_alias="ocrUsed")
    error_message: str | None = Field(default=None, serialization_alias="errorMessage")
    # Only meaningful when status == FAILED. True for a failure that a
    # plain retry might fix (the file couldn't be downloaded, the job
    # timed out, an unexpected OCR-engine error) - the Node API will
    # automatically re-queue a bounded number of these. False for a
    # failure retrying the exact same bytes will never fix (a corrupt/
    # unreadable PDF, an oversized file) - Node marks these terminally
    # FAILED and leaves any retry to a human via POST /:id/reprocess.
    recoverable: bool = Field(default=False, serialization_alias="recoverable")

    model_config = {"populate_by_name": True}
