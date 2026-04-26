import pytest
from unittest.mock import MagicMock
from fastapi.testclient import TestClient
from src.main import app


@pytest.fixture
def mock_index_pdf(tmp_path, monkeypatch):
    import src.main as main_module
    chroma_dir = tmp_path / "chroma"
    monkeypatch.setattr(main_module, "CHROMA_DIR", chroma_dir)

    def _fake_index(file_id, dest):
        (chroma_dir / file_id).mkdir(parents=True, exist_ok=True)

    mock = MagicMock(side_effect=_fake_index)
    monkeypatch.setattr(main_module, "index_pdf", mock)
    return mock


@pytest.fixture
def client(tmp_path, monkeypatch, mock_index_pdf):
    import src.main as main_module
    monkeypatch.setattr(main_module, "UPLOAD_DIR", tmp_path)
    return TestClient(app)


@pytest.fixture
def fake_pdf_bytes():
    return b"%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n"
