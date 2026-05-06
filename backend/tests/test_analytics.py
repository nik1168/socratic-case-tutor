from unittest.mock import AsyncMock, patch


def test_analytics_overview_returns_valid_shape(client):
    payload = {
        "total_sessions": 3,
        "total_messages": 15,
        "quality_distribution": {"shallow": 4, "developing": 7, "insightful": 4},
    }
    with patch("src.main.get_analytics_overview", new_callable=AsyncMock, return_value=payload):
        response = client.get("/analytics/overview")
    assert response.status_code == 200
    data = response.json()
    assert data["total_sessions"] == 3
    assert data["total_messages"] == 15
    assert data["quality_distribution"]["developing"] == 7


def test_analytics_quality_over_time_returns_list(client):
    payload = [
        {"date": "2026-04-25", "shallow": 2, "developing": 3, "insightful": 1},
        {"date": "2026-04-26", "shallow": 1, "developing": 2, "insightful": 3},
    ]
    with patch("src.main.get_quality_over_time", new_callable=AsyncMock, return_value=payload):
        response = client.get("/analytics/quality-over-time")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 2
    assert data[0]["date"] == "2026-04-25"
    assert data[1]["insightful"] == 3


def test_analytics_sessions_returns_list(client):
    payload = [
        {
            "session_id": "s1", "file_id": "f1", "file_name": "airbnb.pdf",
            "last_active_at": "2026-04-27T10:00:00+00:00",
            "message_count": 4, "shallow": 1, "developing": 2, "insightful": 1,
        }
    ]
    with patch("src.main.get_analytics_sessions", new_callable=AsyncMock, return_value=payload):
        response = client.get("/analytics/sessions")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["file_name"] == "airbnb.pdf"
    assert data[0]["message_count"] == 4


def test_analytics_files_returns_list(client):
    payload = [
        {
            "file_id": "f1", "file_name": "airbnb.pdf",
            "session_count": 2, "message_count": 8,
            "shallow": 2, "developing": 4, "insightful": 2,
        }
    ]
    with patch("src.main.get_analytics_files", new_callable=AsyncMock, return_value=payload):
        response = client.get("/analytics/files")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["session_count"] == 2


def test_analytics_overview_returns_empty_when_no_data(client):
    payload = {
        "total_sessions": 0,
        "total_messages": 0,
        "quality_distribution": {"shallow": 0, "developing": 0, "insightful": 0},
    }
    with patch("src.main.get_analytics_overview", new_callable=AsyncMock, return_value=payload):
        response = client.get("/analytics/overview")
    assert response.status_code == 200
    assert response.json()["total_sessions"] == 0
