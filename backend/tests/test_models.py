import pytest
from pydantic import ValidationError

from src.models import ChatRequest, ChatResponse, Message


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
    assert req.conversation_history[0].content == "first"
    assert req.conversation_history[1].role == "assistant"


def test_chat_request_defaults_conversation_history_to_empty():
    req = ChatRequest(file_id="abc", message="hello")
    assert req.conversation_history == []


def test_chat_response_includes_response_type():
    r = ChatResponse(response="hello", response_type="socratic_response")
    assert r.response_type == "socratic_response"
    assert r.model_dump()["response_type"] == "socratic_response"

    c = ChatResponse(response="hello", response_type="clarification")
    assert c.response_type == "clarification"
    assert c.model_dump()["response_type"] == "clarification"


def test_chat_response_rejects_invalid_response_type():
    with pytest.raises(ValidationError):
        ChatResponse(response="hello", response_type="invalid")
