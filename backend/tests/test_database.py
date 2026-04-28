import asyncio
import os

import asyncpg
import pytest

from src.database import get_messages, get_sessions, init_db, save_messages, upsert_session


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
