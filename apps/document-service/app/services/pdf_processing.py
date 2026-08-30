"""Core document-processing logic: page count / text extraction via
PyMuPDF, with an OCR fallback (Tesseract) for scanned papers where
PyMuPDF finds little or no embedded text.
"""

from __future__ import annotations

from dataclasses import dataclass
from io import BytesIO

import fitz  # PyMuPDF
import pytesseract
from PIL import Image

from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)

pytesseract.pytesseract.tesseract_cmd = settings.tesseract_cmd

# Cap OCR to a sane number of pages so a malicious/huge PDF can't tie
# up a worker indefinitely - a real past paper is rarely more than a
# few dozen pages.
MAX_OCR_PAGES = 60
OCR_RENDER_DPI = 200


class UnprocessablePdfError(Exception):
    pass


@dataclass
class ExtractionResult:
    page_count: int
    extracted_text: str
    ocr_used: bool


def extract_document(file_bytes: bytes) -> ExtractionResult:
    try:
        document = fitz.open(stream=file_bytes, filetype="pdf")
    except Exception as exc:  # PyMuPDF raises its own exception types
        raise UnprocessablePdfError(f"Could not open PDF: {exc}") from exc

    try:
        page_count = document.page_count
        native_text_per_page = [page.get_text("text") for page in document]
        native_text = "\n\n".join(native_text_per_page).strip()

        average_chars_per_page = len(native_text) / max(page_count, 1)

        if average_chars_per_page >= settings.ocr_trigger_chars_per_page:
            logger.info("extraction.native_text_sufficient", page_count=page_count, chars=len(native_text))
            return ExtractionResult(page_count=page_count, extracted_text=native_text, ocr_used=False)

        logger.info("extraction.falling_back_to_ocr", page_count=page_count, native_chars=len(native_text))
        ocr_text = _ocr_document(document)
        combined = (native_text + "\n\n" + ocr_text).strip()
        return ExtractionResult(page_count=page_count, extracted_text=combined, ocr_used=True)
    finally:
        document.close()


def _ocr_document(document: fitz.Document) -> str:
    pages_to_process = min(document.page_count, MAX_OCR_PAGES)
    if document.page_count > MAX_OCR_PAGES:
        logger.warning("ocr.page_count_capped", total_pages=document.page_count, processed_pages=MAX_OCR_PAGES)
    zoom = OCR_RENDER_DPI / 72
    matrix = fitz.Matrix(zoom, zoom)

    texts: list[str] = []
    for page_index in range(pages_to_process):
        try:
            page = document.load_page(page_index)
            pixmap = page.get_pixmap(matrix=matrix, colorspace=fitz.csRGB)
            image = Image.open(BytesIO(pixmap.tobytes("png")))
            page_text = pytesseract.image_to_string(image, lang=settings.ocr_language)
            texts.append(page_text)
        except Exception as exc:  # noqa: BLE001 - one bad page must not fail the whole document
            logger.warning("ocr.page_failed", page_index=page_index, error=str(exc))
            texts.append("")

    return "\n\n".join(texts).strip()
