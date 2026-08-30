"""Exercises extract_document against genuinely scanned/image-only PDFs
(no embedded text layer at all - a real PIL-rendered image dropped onto
a page, not a text-based PDF with a low character count), so the OCR
fallback path actually runs Tesseract rather than only being reached in
theory by the native-text-ratio threshold check.
"""

from __future__ import annotations

from io import BytesIO

import fitz
import pytest
from PIL import Image, ImageDraw, ImageFont

from app.services.pdf_processing import UnprocessablePdfError, _ocr_document, extract_document


def _render_text_image(text: str, size: tuple[int, int] = (1000, 300)) -> Image.Image:
    image = Image.new("RGB", size, color="white")
    draw = ImageDraw.Draw(image)
    try:
        font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 48)
    except OSError:
        font = ImageFont.load_default()
    draw.text((20, 100), text, fill="black", font=font)
    return image


def _build_scanned_pdf(pages: list[str]) -> bytes:
    """Builds a PDF where every page is a raster image of text with no
    underlying text layer - exactly what a phone-camera or flatbed-
    scanner past paper produces, and the only way this codebase's OCR
    fallback is ever really needed in production."""
    document = fitz.open()
    for text in pages:
        image = _render_text_image(text)
        buf = BytesIO()
        image.save(buf, format="PNG")
        page = document.new_page(width=image.width, height=image.height)
        page.insert_image(page.rect, stream=buf.getvalue())
    data = document.tobytes()
    document.close()
    return data


def test_extract_document_ocrs_a_genuinely_scanned_pdf() -> None:
    pdf_bytes = _build_scanned_pdf(["NJALA UNIVERSITY EXAM"])
    result = extract_document(pdf_bytes)

    assert result.ocr_used is True
    assert result.page_count == 1
    # Tesseract on a clean, large, high-contrast rendered string should
    # recover at least the distinctive all-caps tokens.
    assert "NJALA" in result.extracted_text.upper()
    assert "EXAM" in result.extracted_text.upper()


def test_extract_document_ocrs_every_page_of_a_multi_page_scanned_pdf() -> None:
    pdf_bytes = _build_scanned_pdf(["FIRST PAGE CONTENT", "SECOND PAGE CONTENT", "THIRD PAGE CONTENT"])
    result = extract_document(pdf_bytes)

    assert result.ocr_used is True
    assert result.page_count == 3
    upper = result.extracted_text.upper()
    assert "FIRST" in upper
    assert "SECOND" in upper
    assert "THIRD" in upper


def test_extract_document_rejects_a_zero_byte_file() -> None:
    with pytest.raises(UnprocessablePdfError):
        extract_document(b"")


def test_extract_document_rejects_a_truncated_pdf_header_with_no_valid_body() -> None:
    # Has the right magic bytes (would pass the API layer's signature
    # sniff, see apps/api/src/services/storage.service.ts) but is
    # otherwise garbage - a genuinely corrupt upload, not just a
    # mislabeled file type.
    with pytest.raises(UnprocessablePdfError):
        extract_document(b"%PDF-1.7\n" + b"\x00\xff\xde\xad\xbe\xef" * 20)


def test_ocr_document_survives_one_page_failing_and_still_returns_the_others(monkeypatch: pytest.MonkeyPatch) -> None:
    pdf_bytes = _build_scanned_pdf(["GOOD PAGE ONE", "GOOD PAGE TWO", "GOOD PAGE THREE"])
    document = fitz.open(stream=pdf_bytes, filetype="pdf")

    import pytesseract

    real_image_to_string = pytesseract.image_to_string
    call_count = {"n": 0}

    def flaky_ocr(image, lang=None):  # noqa: ANN001 - matches pytesseract's own signature loosely
        call_count["n"] += 1
        if call_count["n"] == 2:
            raise RuntimeError("simulated Tesseract engine crash on this page")
        return real_image_to_string(image, lang=lang)

    monkeypatch.setattr(pytesseract, "image_to_string", flaky_ocr)

    text = _ocr_document(document)
    document.close()

    # Page 2's OCR blew up and contributes nothing, but pages 1 and 3
    # are not silently dropped - one bad page must not sink the whole
    # document.
    upper = text.upper()
    assert "GOOD PAGE ONE" in upper
    assert "GOOD PAGE THREE" in upper


def test_ocr_document_caps_processing_at_max_ocr_pages(monkeypatch: pytest.MonkeyPatch) -> None:
    # Building 60+ real scanned pages would make this test slow; instead
    # prove the cap itself is honored by lowering it and using a
    # small, cheap document.
    monkeypatch.setattr("app.services.pdf_processing.MAX_OCR_PAGES", 2)
    pdf_bytes = _build_scanned_pdf(["PAGE ONE TEXT", "PAGE TWO TEXT", "PAGE THREE NEVER OCRED"])
    document = fitz.open(stream=pdf_bytes, filetype="pdf")

    text = _ocr_document(document)
    document.close()

    upper = text.upper()
    assert "PAGE ONE" in upper
    assert "NEVER OCRED" not in upper
