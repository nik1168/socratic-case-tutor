import io
from unittest.mock import AsyncMock, patch


def test_chat_returns_response(client, fake_pdf_bytes):
    upload_response = client.post(
        "/upload",
        files={"file": ("case.pdf", io.BytesIO(fake_pdf_bytes), "application/pdf")},
        data={"session_id": "test-session"},
    )
    assert upload_response.status_code == 200
    file_id = upload_response.json()["file_id"]

    with patch(
        "src.main.run_agent",
        new_callable=AsyncMock,
        return_value={"answer": "What aspects interest you most?", "response_type": "socratic_response"},
    ), patch(
        "src.main.evaluate_message",
        new_callable=AsyncMock,
        return_value={"thinking_quality": "developing", "feedback": "Keep exploring."},
    ):
        response = client.post(
            "/chat",
            json={"file_id": file_id, "session_id": "test-session", "message": "What is this case about?"},
        )

    assert response.status_code == 200
    data = response.json()
    assert data["response"] == "What aspects interest you most?"
    assert data["response_type"] == "socratic_response"
    assert data["thinking_quality"] == "developing"
    assert data["feedback"] == "Keep exploring."


def test_chat_returns_404_for_unknown_file_id(client):
    response = client.post(
        "/chat",
        json={"file_id": "does-not-exist", "session_id": "test-session", "message": "hello"},
    )
    assert response.status_code == 404


def test_chat_loads_history_from_database(client, fake_pdf_bytes):
    from langchain_core.messages import AIMessage, HumanMessage

    upload_response = client.post(
        "/upload",
        files={"file": ("case.pdf", io.BytesIO(fake_pdf_bytes), "application/pdf")},
        data={"session_id": "test-session"},
    )
    file_id = upload_response.json()["file_id"]

    stored = [
        {"role": "user", "content": "First question", "response_type": None, "thinking_quality": None, "feedback": None},
        {"role": "assistant", "content": "First answer", "response_type": "socratic_response", "thinking_quality": None, "feedback": None},
    ]

    with patch(
        "src.main.get_messages",
        new_callable=AsyncMock,
        return_value=stored,
    ) as mock_get, patch(
        "src.main.run_agent",
        new_callable=AsyncMock,
        return_value={"answer": "Follow-up answer.", "response_type": "socratic_response"},
    ) as mock_run, patch(
        "src.main.evaluate_message",
        new_callable=AsyncMock,
        return_value={"thinking_quality": "developing", "feedback": ""},
    ):
        client.post(
            "/chat",
            json={"file_id": file_id, "session_id": "test-session", "message": "Follow-up"},
        )

    _file_id, _message, chat_history = mock_run.call_args[0]
    assert len(chat_history) == 2
    assert isinstance(chat_history[0], HumanMessage)
    assert chat_history[0].content == "First question"
    assert isinstance(chat_history[1], AIMessage)
    assert chat_history[1].content == "First answer"


def test_chat_saves_messages_after_response(client, fake_pdf_bytes):
    upload_response = client.post(
        "/upload",
        files={"file": ("case.pdf", io.BytesIO(fake_pdf_bytes), "application/pdf")},
        data={"session_id": "test-session"},
    )
    file_id = upload_response.json()["file_id"]

    with patch(
        "src.main.run_agent",
        new_callable=AsyncMock,
        return_value={"answer": "Good question.", "response_type": "socratic_response"},
    ), patch(
        "src.main.evaluate_message",
        new_callable=AsyncMock,
        return_value={"thinking_quality": "insightful", "feedback": "Great thinking."},
    ), patch(
        "src.main.save_messages", new_callable=AsyncMock, return_value=None
    ) as mock_save:
        client.post(
            "/chat",
            json={"file_id": file_id, "session_id": "test-session", "message": "Why did they grow?"},
        )

    mock_save.assert_awaited_once()
    _pool, _session_id, _file_id, messages = mock_save.call_args[0]
    assert len(messages) == 2
    assert messages[0] == {"role": "user", "content": "Why did they grow?"}
    assert messages[1]["role"] == "assistant"
    assert messages[1]["content"] == "Good question."
    assert messages[1]["thinking_quality"] == "insightful"
    assert messages[1]["feedback"] == "Great thinking."


def test_chat_returns_404_when_chroma_index_missing(client, fake_pdf_bytes, tmp_path, monkeypatch):
    import src.main as main_module

    upload_response = client.post(
        "/upload",
        files={"file": ("case.pdf", io.BytesIO(fake_pdf_bytes), "application/pdf")},
        data={"session_id": "test-session"},
    )
    file_id = upload_response.json()["file_id"]

    monkeypatch.setattr(main_module, "CHROMA_DIR", tmp_path / "empty_chroma")

    response = client.post(
        "/chat",
        json={"file_id": file_id, "session_id": "test-session", "message": "hello"},
    )

    assert response.status_code == 404
    assert response.json()["detail"] == "File not found. Please upload the PDF again."
