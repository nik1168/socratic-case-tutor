from src.models import ChatRequest, Message


def test_chat_request_accepts_conversation_history():
    req = ChatRequest(
        file_id="abc",
        message="hello",
        conversation_history=[
            Message(role="user", content="first"),
            Message(role="assistant", content="second"),
        ],
    )
    assert len(req.conversation_history) == 2
    assert req.conversation_history[0].role == "user"


def test_chat_request_defaults_conversation_history_to_empty():
    req = ChatRequest(file_id="abc", message="hello")
    assert req.conversation_history == []
