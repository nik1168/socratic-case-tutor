import io
import uuid


def test_upload_returns_file_id(client, fake_pdf_bytes):
    response = client.post(
        "/upload",
        files={"file": ("case.pdf", io.BytesIO(fake_pdf_bytes), "application/pdf")},
        data={"session_id": "test-session"},
    )
    assert response.status_code == 200
    body = response.json()
    assert "file_id" in body
    uuid.UUID(body["file_id"])  # raises ValueError if not a valid UUID


def test_upload_rejects_non_pdf(client):
    response = client.post(
        "/upload",
        files={"file": ("doc.txt", io.BytesIO(b"hello"), "text/plain")},
        data={"session_id": "test-session"},
    )
    assert response.status_code == 400


def test_upload_calls_index_pdf(client, mock_index_pdf, fake_pdf_bytes):
    response = client.post(
        "/upload",
        files={"file": ("case.pdf", io.BytesIO(fake_pdf_bytes), "application/pdf")},
        data={"session_id": "test-session"},
    )
    assert response.status_code == 200
    mock_index_pdf.assert_called_once()
    file_id = response.json()["file_id"]
    called_file_id, _ = mock_index_pdf.call_args[0]
    assert called_file_id == file_id
