import fitz
import pytest

from app.services.pdf_processing import UnprocessablePdfError, extract_document


def _build_text_pdf(pages: int = 2) -> bytes:
    document = fitz.open()
    for i in range(pages):
        page = document.new_page()
        page.insert_text((72, 72), f"Sample examination question {i + 1}: What is 2 + 2?")
    data = document.tobytes()
    document.close()
    return data


def test_extract_document_reads_native_text() -> None:
    pdf_bytes = _build_text_pdf(pages=3)
    result = extract_document(pdf_bytes)

    assert result.page_count == 3
    assert "Sample examination question" in result.extracted_text
    assert result.ocr_used is False


def test_extract_document_rejects_invalid_pdf() -> None:
    with pytest.raises(UnprocessablePdfError):
        extract_document(b"not a real pdf")
