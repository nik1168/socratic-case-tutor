import pytest
from pathlib import Path
from unittest.mock import patch

from langchain_core.documents import Document
from langchain_core.embeddings import Embeddings

from src.rag_service import index_pdf


class FakeEmbeddings(Embeddings):
    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        return [[0.1] * 8 for _ in texts]

    def embed_query(self, text: str) -> list[float]:
        return [0.1] * 8


def test_index_pdf_creates_chroma_directory(tmp_path, monkeypatch):
    import src.rag_service as rag_module

    chroma_base = tmp_path / "chroma"
    monkeypatch.setattr(rag_module, "CHROMA_DIR", chroma_base)

    fake_pdf = tmp_path / "test.pdf"
    fake_pdf.write_bytes(b"%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n")

    with patch("src.rag_service.PyPDFLoader") as mock_loader:
        mock_loader.return_value.load.return_value = [
            Document(
                page_content="Airbnb disrupted the hotel industry.",
                metadata={"page": 0},
            )
        ]
        with patch("src.rag_service.OpenAIEmbeddings", return_value=FakeEmbeddings()) as mock_emb:
            index_pdf("file-123", fake_pdf)
        mock_emb.assert_called_once_with(model="text-embedding-3-small")

    assert (chroma_base / "file-123").exists()


from langchain_core.runnables import Runnable, RunnableLambda

from src.rag_service import get_rag_chain


def test_get_rag_chain_returns_runnable(tmp_path, monkeypatch):
    import src.rag_service as rag_module

    chroma_base = tmp_path / "chroma"
    monkeypatch.setattr(rag_module, "CHROMA_DIR", chroma_base)

    # Simulate an already-indexed collection by creating the directory
    (chroma_base / "file-456").mkdir(parents=True)

    fake_runnable = RunnableLambda(lambda x: x)

    with patch("src.rag_service.OpenAIEmbeddings", return_value=FakeEmbeddings()):
        with patch("src.rag_service.Chroma"):
            with patch("src.rag_service.ChatAnthropic"):
                with patch("src.rag_service.create_retrieval_chain", return_value=fake_runnable):
                    chain = get_rag_chain("file-456")

    assert isinstance(chain, Runnable)


def test_get_rag_chain_raises_for_unknown_file(tmp_path, monkeypatch):
    import src.rag_service as rag_module

    monkeypatch.setattr(rag_module, "CHROMA_DIR", tmp_path / "chroma")

    with pytest.raises(ValueError, match="No index found"):
        get_rag_chain("nonexistent-file-id")
