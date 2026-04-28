import pytest
from unittest.mock import AsyncMock, MagicMock
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
    # Mock all DB functions so unit tests don't need a real Postgres connection.
    # Tests that need to assert specific DB behavior can override with patch().
    monkeypatch.setattr(main_module, "upsert_session", AsyncMock(return_value=None))
    monkeypatch.setattr(main_module, "get_messages", AsyncMock(return_value=[]))
    monkeypatch.setattr(main_module, "save_messages", AsyncMock(return_value=None))
    monkeypatch.setattr(main_module, "get_sessions", AsyncMock(return_value=[]))
    # Pool is not needed since all DB functions are mocked above.
    app.state.pool = None
    return TestClient(app)


@pytest.fixture
def fake_pdf_bytes():
    return b"%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n"
