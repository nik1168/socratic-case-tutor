import io
from unittest.mock import AsyncMock, patch


def test_chat_returns_response(client, fake_pdf_bytes):
    upload_response = client.post(
        "/upload",
        files={"file": ("case.pdf", io.BytesIO(fake_pdf_bytes), "application/pdf")},
    )
    file_id = upload_response.json()["file_id"]

    with patch(
        "src.main.run_agent",
        new_callable=AsyncMock,
        return_value={"answer": "What aspects of this case interest you most?", "response_type": "socratic_response"},
    ):
        response = client.post(
            "/chat",
            json={"file_id": file_id, "message": "What is this case about?", "conversation_history": []},
        )

    assert response.status_code == 200
    assert response.json()["response"] == "What aspects of this case interest you most?"
    assert response.json()["response_type"] == "socratic_response"


def test_chat_returns_404_for_unknown_file_id(client):
    response = client.post(
        "/chat",
        json={"file_id": "does-not-exist", "message": "hello"},
    )
    assert response.status_code == 404


def test_chat_passes_conversation_history_to_agent(client, fake_pdf_bytes):
    from langchain_core.messages import AIMessage, HumanMessage

    upload_response = client.post(
        "/upload",
        files={"file": ("case.pdf", io.BytesIO(fake_pdf_bytes), "application/pdf")},
    )
    file_id = upload_response.json()["file_id"]

    with patch(
        "src.main.run_agent",
        new_callable=AsyncMock,
        return_value={"answer": "Sure.", "response_type": "socratic_response"},
    ) as mock_run:
        client.post(
            "/chat",
            json={
                "file_id": file_id,
                "message": "Follow-up",
                "conversation_history": [
                    {"role": "user", "content": "First question"},
                    {"role": "assistant", "content": "First answer"},
                ],
            },
        )

    _file_id, _message, chat_history = mock_run.call_args[0]
    assert len(chat_history) == 2
    assert isinstance(chat_history[0], HumanMessage)
    assert chat_history[0].content == "First question"
    assert isinstance(chat_history[1], AIMessage)
    assert chat_history[1].content == "First answer"


def test_chat_returns_404_when_chroma_index_missing(client, fake_pdf_bytes):
    upload_response = client.post(
        "/upload",
        files={"file": ("case.pdf", io.BytesIO(fake_pdf_bytes), "application/pdf")},
    )
    file_id = upload_response.json()["file_id"]

    with patch("src.main.run_agent", side_effect=ValueError("No index found")):
        response = client.post(
            "/chat",
            json={"file_id": file_id, "message": "hello"},
        )

    assert response.status_code == 404
