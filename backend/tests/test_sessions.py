from unittest.mock import AsyncMock, patch


def test_get_sessions_returns_list(client):
    sessions = [
        {
            "file_id": "file-1",
            "file_name": "airbnb.pdf",
            "last_active_at": "2026-04-27T10:00:00+00:00",
            "message_count": 4,
        }
    ]
    with patch("src.main.get_sessions", new_callable=AsyncMock, return_value=sessions):
        response = client.get("/sessions/user-abc")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["file_id"] == "file-1"
    assert data[0]["file_name"] == "airbnb.pdf"
    assert data[0]["message_count"] == 4


def test_get_sessions_returns_empty_list_for_new_user(client):
    with patch("src.main.get_sessions", new_callable=AsyncMock, return_value=[]):
        response = client.get("/sessions/brand-new-user")
    assert response.status_code == 200
    assert response.json() == []


def test_get_messages_returns_history(client):
    messages = [
        {
            "role": "user",
            "content": "What is this?",
            "response_type": None,
            "thinking_quality": "shallow",
            "feedback": "Dig deeper.",
        },
        {
            "role": "assistant",
            "content": "Let me ask you something.",
            "response_type": "socratic_response",
            "thinking_quality": None,
            "feedback": None,
        },
    ]
    with patch("src.main.get_messages", new_callable=AsyncMock, return_value=messages):
        response = client.get("/sessions/user-abc/file-1/messages")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 2
    assert data[0]["role"] == "user"
    assert data[1]["role"] == "assistant"
    assert data[1]["response_type"] == "socratic_response"
