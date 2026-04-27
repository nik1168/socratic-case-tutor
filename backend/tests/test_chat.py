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
    ), patch(
        "src.main.evaluate_message",
        new_callable=AsyncMock,
        return_value={"thinking_quality": "developing", "feedback": "Keep exploring the financials."},
    ):
        response = client.post(
            "/chat",
            json={"file_id": file_id, "message": "What is this case about?", "conversation_history": []},
        )

    assert response.status_code == 200
    data = response.json()
    assert data["response"] == "What aspects of this case interest you most?"
    assert data["response_type"] == "socratic_response"
    assert data["thinking_quality"] == "developing"
    assert data["feedback"] == "Keep exploring the financials."


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
    ) as mock_run, patch(
        "src.main.evaluate_message",
        new_callable=AsyncMock,
        return_value={"thinking_quality": "developing", "feedback": ""},
    ) as mock_eval:
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
    assert _file_id == file_id
    assert _message == "Follow-up"
    assert len(chat_history) == 2
    assert isinstance(chat_history[0], HumanMessage)
    assert chat_history[0].content == "First question"
    assert isinstance(chat_history[1], AIMessage)
    assert chat_history[1].content == "First answer"

    eval_message_arg, eval_history_arg = mock_eval.call_args[0]
    assert eval_message_arg == "Follow-up"
    assert len(eval_history_arg) == 2
    assert eval_history_arg[0].content == "First question"
    assert eval_history_arg[1].content == "First answer"


def test_chat_returns_404_when_chroma_index_missing(client, fake_pdf_bytes, tmp_path, monkeypatch):
    import src.main as main_module

    upload_response = client.post(
        "/upload",
        files={"file": ("case.pdf", io.BytesIO(fake_pdf_bytes), "application/pdf")},
    )
    file_id = upload_response.json()["file_id"]

    monkeypatch.setattr(main_module, "CHROMA_DIR", tmp_path / "empty_chroma")

    response = client.post(
        "/chat",
        json={"file_id": file_id, "message": "hello"},
    )

    assert response.status_code == 404
    assert response.json()["detail"] == "File not found. Please upload the PDF again."
