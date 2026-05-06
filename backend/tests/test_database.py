import asyncio
import os

import asyncpg
import pytest

from src.database import (
    get_analytics_files,
    get_analytics_overview,
    get_analytics_sessions,
    get_messages,
    get_quality_over_time,
    get_sessions,
    init_db,
    save_messages,
    upsert_session,
)


@pytest.fixture
async def conn():
    pool = await asyncpg.create_pool(os.environ["DATABASE_URL"])
    async with pool.acquire() as c:
        tr = c.transaction()
        await tr.start()
        await init_db(c)
        yield c
        await tr.rollback()
    await pool.close()


async def test_upsert_session_creates_record(conn):
    await upsert_session(conn, "user-1", "file-1", "airbnb.pdf")
    row = await conn.fetchrow(
        "SELECT session_id, file_id, file_name FROM sessions WHERE session_id=$1 AND file_id=$2",
        "user-1", "file-1",
    )
    assert row["session_id"] == "user-1"
    assert row["file_id"] == "file-1"
    assert row["file_name"] == "airbnb.pdf"


async def test_upsert_session_updates_last_active_at(conn):
    await upsert_session(conn, "user-1", "file-1", "airbnb.pdf")
    before = await conn.fetchval(
        "SELECT last_active_at FROM sessions WHERE session_id=$1 AND file_id=$2",
        "user-1", "file-1",
    )
    await asyncio.sleep(0.01)
    await upsert_session(conn, "user-1", "file-1", "airbnb.pdf")
    after = await conn.fetchval(
        "SELECT last_active_at FROM sessions WHERE session_id=$1 AND file_id=$2",
        "user-1", "file-1",
    )
    assert after > before


async def test_save_and_get_messages_round_trip(conn):
    await upsert_session(conn, "user-1", "file-1", "airbnb.pdf")
    await save_messages(conn, "user-1", "file-1", [
        {"role": "user", "content": "What is this about?"},
        {
            "role": "assistant",
            "content": "It is about Airbnb.",
            "response_type": "socratic_response",
            "thinking_quality": "shallow",
            "feedback": "Dig deeper.",
        },
    ])
    msgs = await get_messages(conn, "user-1", "file-1")
    assert len(msgs) == 2
    assert msgs[0]["role"] == "user"
    assert msgs[0]["content"] == "What is this about?"
    assert msgs[1]["role"] == "assistant"
    assert msgs[1]["content"] == "It is about Airbnb."
    assert msgs[1]["response_type"] == "socratic_response"
    assert msgs[1]["thinking_quality"] == "shallow"


async def test_get_sessions_returns_ordered_by_last_active(conn):
    await upsert_session(conn, "user-1", "file-a", "first.pdf")
    await asyncio.sleep(0.01)
    await upsert_session(conn, "user-1", "file-b", "second.pdf")
    await asyncio.sleep(0.01)
    # Touch file-a again — it should become the most recent
    await upsert_session(conn, "user-1", "file-a", "first.pdf")
    sessions = await get_sessions(conn, "user-1")
    assert len(sessions) == 2
    assert sessions[0]["file_id"] == "file-a"
    assert sessions[1]["file_id"] == "file-b"


async def test_get_messages_returns_empty_for_unknown_session(conn):
    msgs = await get_messages(conn, "no-such-user", "no-such-file")
    assert msgs == []


async def test_analytics_overview_counts_sessions_and_messages(conn):
    await upsert_session(conn, "s1", "f1", "airbnb.pdf")
    await upsert_session(conn, "s1", "f2", "netflix.pdf")
    await save_messages(conn, "s1", "f1", [
        {"role": "user", "content": "Hello"},
        {"role": "assistant", "content": "Hi", "response_type": "socratic_response",
         "thinking_quality": "shallow", "feedback": "dig deeper"},
    ])
    await save_messages(conn, "s1", "f2", [
        {"role": "user", "content": "What is this?"},
        {"role": "assistant", "content": "Good question", "response_type": "socratic_response",
         "thinking_quality": "insightful", "feedback": "excellent"},
    ])
    result = await get_analytics_overview(conn)
    assert result["total_sessions"] == 2
    assert result["total_messages"] == 2   # user messages only
    assert result["quality_distribution"]["shallow"] == 1
    assert result["quality_distribution"]["insightful"] == 1
    assert result["quality_distribution"]["developing"] == 0


async def test_quality_over_time_groups_by_day(conn):
    await upsert_session(conn, "s1", "f1", "airbnb.pdf")
    # Two assistant messages inserted at the DB default timestamp (NOW())
    # Both land in today's bucket
    await save_messages(conn, "s1", "f1", [
        {"role": "user", "content": "Q1"},
        {"role": "assistant", "content": "A1", "response_type": "socratic_response",
         "thinking_quality": "shallow", "feedback": "ok"},
        {"role": "user", "content": "Q2"},
        {"role": "assistant", "content": "A2", "response_type": "socratic_response",
         "thinking_quality": "insightful", "feedback": "great"},
    ])
    rows = await get_quality_over_time(conn)
    assert len(rows) == 1          # one day bucket
    today = rows[0]
    assert "date" in today
    assert today["shallow"] == 1
    assert today["insightful"] == 1
    assert today["developing"] == 0


async def test_quality_over_time_excludes_null_quality(conn):
    await upsert_session(conn, "s1", "f1", "airbnb.pdf")
    await save_messages(conn, "s1", "f1", [
        {"role": "user", "content": "Q1"},   # user rows have NULL quality — excluded
    ])
    rows = await get_quality_over_time(conn)
    assert rows == []


async def test_analytics_sessions_returns_per_session_stats(conn):
    await upsert_session(conn, "s1", "f1", "airbnb.pdf")
    await save_messages(conn, "s1", "f1", [
        {"role": "user", "content": "Q1"},
        {"role": "assistant", "content": "A1", "response_type": "socratic_response",
         "thinking_quality": "developing", "feedback": "ok"},
        {"role": "user", "content": "Q2"},
        {"role": "assistant", "content": "A2", "response_type": "socratic_response",
         "thinking_quality": "insightful", "feedback": "great"},
    ])
    rows = await get_analytics_sessions(conn)
    assert len(rows) == 1
    row = rows[0]
    assert row["session_id"] == "s1"
    assert row["file_id"] == "f1"
    assert row["file_name"] == "airbnb.pdf"
    assert row["message_count"] == 2    # user messages only
    assert row["developing"] == 1
    assert row["insightful"] == 1
    assert row["shallow"] == 0
    assert "last_active_at" in row


async def test_analytics_files_aggregates_across_sessions(conn):
    # Two different students use the same file_id
    await upsert_session(conn, "s1", "f1", "airbnb.pdf")
    await upsert_session(conn, "s2", "f1", "airbnb.pdf")
    await save_messages(conn, "s1", "f1", [
        {"role": "user", "content": "Q"},
        {"role": "assistant", "content": "A", "response_type": "socratic_response",
         "thinking_quality": "shallow", "feedback": "ok"},
    ])
    await save_messages(conn, "s2", "f1", [
        {"role": "user", "content": "Q"},
        {"role": "assistant", "content": "A", "response_type": "socratic_response",
         "thinking_quality": "insightful", "feedback": "great"},
    ])
    rows = await get_analytics_files(conn)
    assert len(rows) == 1
    row = rows[0]
    assert row["file_id"] == "f1"
    assert row["file_name"] == "airbnb.pdf"
    assert row["session_count"] == 2
    assert row["message_count"] == 2   # user messages across both sessions
    assert row["shallow"] == 1
    assert row["insightful"] == 1
