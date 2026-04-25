import io
from unittest.mock import patch


def test_chat_returns_response(client, fake_pdf_bytes):
    upload_response = client.post(
        "/upload",
        files={"file": ("case.pdf", io.BytesIO(fake_pdf_bytes), "application/pdf")},
    )
    file_id = upload_response.json()["file_id"]

    with patch("src.main.extract_text", return_value="This is the case study text."):
        with patch("src.main.ask_claude", return_value="What aspects of this case interest you most?"):
            response = client.post(
                "/chat",
                json={"file_id": file_id, "message": "What is this case about?"},
            )

    assert response.status_code == 200
    assert "response" in response.json()
    assert len(response.json()["response"]) > 0


def test_chat_returns_404_for_unknown_file_id(client):
    response = client.post(
        "/chat",
        json={"file_id": "does-not-exist", "message": "hello"},
    )
    assert response.status_code == 404
