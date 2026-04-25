import io
import uuid


def test_upload_returns_file_id(client, fake_pdf_bytes):
    response = client.post(
        "/upload",
        files={"file": ("case.pdf", io.BytesIO(fake_pdf_bytes), "application/pdf")},
    )
    assert response.status_code == 200
    body = response.json()
    assert "file_id" in body
    uuid.UUID(body["file_id"])  # raises ValueError if not a valid UUID


def test_upload_rejects_non_pdf(client):
    response = client.post(
        "/upload",
        files={"file": ("doc.txt", io.BytesIO(b"hello"), "text/plain")},
    )
    assert response.status_code == 400
