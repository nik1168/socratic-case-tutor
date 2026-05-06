import pytest
from pydantic import ValidationError

from src.models import (
    AnalyticsFile,
    AnalyticsOverview,
    AnalyticsSession,
    ChatRequest,
    ChatResponse,
    MessageItem,
    QualityDay,
    SessionItem,
)


def test_chat_request_requires_session_id():
    req = ChatRequest(file_id="abc", session_id="session-1", message="hello")
    assert req.session_id == "session-1"
    assert req.file_id == "abc"
    assert req.message == "hello"


def test_chat_request_rejects_missing_session_id():
    with pytest.raises(ValidationError):
        ChatRequest(file_id="abc", message="hello")


def test_chat_response_includes_response_type():
    r = ChatResponse(
        response="hello",
        response_type="socratic_response",
        thinking_quality="developing",
        feedback="Keep exploring.",
    )
    assert r.response_type == "socratic_response"
    assert r.model_dump()["response_type"] == "socratic_response"

    c = ChatResponse(
        response="hello",
        response_type="clarification",
        thinking_quality="shallow",
        feedback="Try to go deeper.",
    )
    assert c.response_type == "clarification"
    assert c.model_dump()["response_type"] == "clarification"


def test_chat_response_rejects_invalid_response_type():
    with pytest.raises(ValidationError):
        ChatResponse(
            response="hello",
            response_type="invalid",
            thinking_quality="developing",
            feedback="test",
        )


def test_chat_response_includes_thinking_quality_and_feedback():
    r = ChatResponse(
        response="hello",
        response_type="socratic_response",
        thinking_quality="insightful",
        feedback="Great connection.",
    )
    assert r.thinking_quality == "insightful"
    assert r.feedback == "Great connection."
    assert r.model_dump()["thinking_quality"] == "insightful"


def test_chat_response_rejects_invalid_thinking_quality():
    with pytest.raises(ValidationError):
        ChatResponse(
            response="hello",
            response_type="socratic_response",
            thinking_quality="excellent",
            feedback="test",
        )


def test_session_item_fields():
    s = SessionItem(
        file_id="file-1",
        file_name="airbnb.pdf",
        last_active_at="2026-04-27T10:00:00+00:00",
        message_count=4,
    )
    assert s.file_id == "file-1"
    assert s.file_name == "airbnb.pdf"
    assert s.message_count == 4


def test_message_item_optional_fields_default_to_none():
    m = MessageItem(role="user", content="hello")
    assert m.response_type is None
    assert m.thinking_quality is None
    assert m.feedback is None


def test_message_item_rejects_invalid_role():
    with pytest.raises(ValidationError):
        MessageItem(role="system", content="hello")


def test_analytics_overview_shape():
    m = AnalyticsOverview(
        total_sessions=3,
        total_messages=15,
        quality_distribution={"shallow": 4, "developing": 7, "insightful": 4},
    )
    assert m.total_sessions == 3
    assert m.quality_distribution["insightful"] == 4


def test_quality_day_shape():
    d = QualityDay(date="2026-04-25", shallow=2, developing=3, insightful=1)
    assert d.date == "2026-04-25"
    assert d.insightful == 1


def test_analytics_session_shape():
    s = AnalyticsSession(
        session_id="s1", file_id="f1", file_name="airbnb.pdf",
        last_active_at="2026-04-27T10:00:00+00:00",
        message_count=4, shallow=1, developing=2, insightful=1,
    )
    assert s.file_name == "airbnb.pdf"
    assert s.message_count == 4


def test_analytics_file_shape():
    f = AnalyticsFile(
        file_id="f1", file_name="airbnb.pdf",
        session_count=2, message_count=8,
        shallow=2, developing=4, insightful=2,
    )
    assert f.session_count == 2
    assert f.message_count == 8
