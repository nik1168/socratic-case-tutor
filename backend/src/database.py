_CREATE_SESSIONS = """
CREATE TABLE IF NOT EXISTS sessions (
    session_id     TEXT        NOT NULL,
    file_id        TEXT        NOT NULL,
    file_name      TEXT        NOT NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_active_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (session_id, file_id)
)
"""

_CREATE_MESSAGES = """
CREATE TABLE IF NOT EXISTS messages (
    id               SERIAL PRIMARY KEY,
    session_id       TEXT        NOT NULL,
    file_id          TEXT        NOT NULL,
    role             TEXT        NOT NULL,
    content          TEXT        NOT NULL,
    response_type    TEXT,
    thinking_quality TEXT,
    feedback         TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
)
"""

_CREATE_INDEX = """
CREATE INDEX IF NOT EXISTS idx_messages_session_file
    ON messages (session_id, file_id, created_at)
"""


async def init_db(pool) -> None:
    await pool.execute(_CREATE_SESSIONS)
    await pool.execute(_CREATE_MESSAGES)
    await pool.execute(_CREATE_INDEX)


async def upsert_session(pool, session_id: str, file_id: str, file_name: str) -> None:
    await pool.execute(
        """
        INSERT INTO sessions (session_id, file_id, file_name)
        VALUES ($1, $2, $3)
        ON CONFLICT (session_id, file_id)
        DO UPDATE SET last_active_at = clock_timestamp()
        """,
        session_id, file_id, file_name,
    )


async def save_messages(pool, session_id: str, file_id: str, messages: list[dict]) -> None:
    for msg in messages:
        await pool.execute(
            """
            INSERT INTO messages
                (session_id, file_id, role, content, response_type, thinking_quality, feedback)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            """,
            session_id, file_id,
            msg["role"], msg["content"],
            msg.get("response_type"),
            msg.get("thinking_quality"),
            msg.get("feedback"),
        )


async def get_messages(pool, session_id: str, file_id: str) -> list[dict]:
    rows = await pool.fetch(
        """
        SELECT role, content, response_type, thinking_quality, feedback
        FROM messages
        WHERE session_id = $1 AND file_id = $2
        ORDER BY created_at ASC
        """,
        session_id, file_id,
    )
    return [dict(row) for row in rows]


async def get_sessions(pool, session_id: str) -> list[dict]:
    rows = await pool.fetch(
        """
        SELECT s.file_id, s.file_name, s.last_active_at,
               COUNT(m.id)::int AS message_count
        FROM sessions s
        LEFT JOIN messages m
            ON m.session_id = s.session_id AND m.file_id = s.file_id
        WHERE s.session_id = $1
        GROUP BY s.file_id, s.file_name, s.last_active_at
        ORDER BY s.last_active_at DESC
        """,
        session_id,
    )
    return [
        {
            "file_id": row["file_id"],
            "file_name": row["file_name"],
            "last_active_at": row["last_active_at"].isoformat(),
            "message_count": row["message_count"],
        }
        for row in rows
    ]
