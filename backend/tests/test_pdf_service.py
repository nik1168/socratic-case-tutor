from pathlib import Path

import pytest
from fpdf import FPDF

from src.pdf_service import extract_text


@pytest.fixture
def pdf_with_text(tmp_path) -> Path:
    pdf = FPDF()
    pdf.add_page()
    pdf.set_font("Helvetica", size=12)
    pdf.cell(200, 10, txt="Hello World from PDF")
    path = tmp_path / "test.pdf"
    pdf.output(str(path))
    return path


@pytest.fixture
def blank_pdf(tmp_path) -> Path:
    pdf = FPDF()
    pdf.add_page()
    path = tmp_path / "blank.pdf"
    pdf.output(str(path))
    return path


def test_extract_text_returns_page_content(pdf_with_text):
    result = extract_text(pdf_with_text)
    assert "Hello World from PDF" in result


def test_extract_text_returns_stripped_string(pdf_with_text):
    result = extract_text(pdf_with_text)
    assert result == result.strip()


def test_extract_text_blank_page_returns_empty_string(blank_pdf):
    result = extract_text(blank_pdf)
    assert result == ""
