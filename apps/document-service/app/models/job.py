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
    status: Literal["COMPLETED", "FAILED"]
    extracted_text: str | None = Field(default=None, serialization_alias="extractedText")
    page_count: int | None = Field(default=None, serialization_alias="pageCount")
    ocr_used: bool = Field(default=False, serialization_alias="ocrUsed")
    error_message: str | None = Field(default=None, serialization_alias="errorMessage")

    model_config = {"populate_by_name": True}
