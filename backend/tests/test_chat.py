import io
from unittest.mock import AsyncMock, MagicMock, patch


def test_chat_returns_response(client, fake_pdf_bytes):
    upload_response = client.post(
        "/upload",
        files={"file": ("case.pdf", io.BytesIO(fake_pdf_bytes), "application/pdf")},
    )
    file_id = upload_response.json()["file_id"]

    fake_chain = MagicMock()
    fake_chain.ainvoke = AsyncMock(return_value={"answer": "What aspects of this case interest you most?"})

    with patch("src.main.get_rag_chain", return_value=fake_chain):
        response = client.post(
            "/chat",
            json={
                "file_id": file_id,
                "message": "What is this case about?",
                "conversation_history": [],
            },
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


def test_chat_passes_conversation_history_to_chain(client, fake_pdf_bytes):
    from langchain_core.messages import AIMessage, HumanMessage

    upload_response = client.post(
        "/upload",
        files={"file": ("case.pdf", io.BytesIO(fake_pdf_bytes), "application/pdf")},
    )
    file_id = upload_response.json()["file_id"]

    fake_chain = MagicMock()
    fake_chain.ainvoke = AsyncMock(return_value={"answer": "Sure."})

    with patch("src.main.get_rag_chain", return_value=fake_chain):
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

    call_kwargs = fake_chain.ainvoke.call_args[0][0]
    assert len(call_kwargs["chat_history"]) == 2
    assert isinstance(call_kwargs["chat_history"][0], HumanMessage)
    assert call_kwargs["chat_history"][0].content == "First question"
    assert isinstance(call_kwargs["chat_history"][1], AIMessage)
    assert call_kwargs["chat_history"][1].content == "First answer"
