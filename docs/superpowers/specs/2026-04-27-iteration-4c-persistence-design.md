# Iteration 4c (Persistence) — Conversation Persistence Design

**Date:** 2026-04-27
**Status:** Approved

## Goal

Persist conversation history across sessions so a user can close the app and return days later to pick up exactly where they left off. Past cases are shown in a session list on the home screen. Identity is anonymous — a UUID stored in `localStorage` acts as the user's session key, no login required.

## Architecture

### Identity

On first visit, `App.tsx` generates a UUID v4 and stores it in `localStorage` as `session_id`. Every subsequent request to the backend includes this `session_id`. There is no authentication — the session key is trust-based and device-scoped.

### Storage layers

| Data | Storage | Persistence |
|---|---|---|
| Conversation messages | PostgreSQL (Railway addon) | Durable across redeploys |
| PDF files | Filesystem at `$DATA_DIR/uploads/` | Durable via Railway Volume |
| ChromaDB embeddings | Filesystem at `$DATA_DIR/chroma/` | Durable via Railway Volume |

`DATA_DIR` is a new env var (default: repo root). On Railway, set `DATA_DIR=/data` and mount a Volume at `/data`. Locally, the default keeps existing behavior unchanged.

### Backend

A new `backend/src/database.py` module owns the `asyncpg` connection pool and exposes four async functions:

```python
async def upsert_session(pool, session_id: str, file_id: str, file_name: str) -> None
async def save_messages(pool, session_id: str, file_id: str, messages: list[dict]) -> None
async def get_messages(pool, session_id: str, file_id: str) -> list[dict]
async def get_sessions(pool, session_id: str) -> list[dict]
```

Tables are created on app startup via `CREATE TABLE IF NOT EXISTS` — no migration framework.

The `/chat` endpoint changes: it no longer accepts `conversation_history` from the client. Instead it loads history from Postgres, passes it to the agent, then saves both the user message and assistant reply before returning.

### LangGraph graph

Unchanged. The graph receives history as a list of `BaseMessage` objects exactly as before — the only difference is that the history now comes from Postgres instead of the request body.

### Local development

A `docker-compose.yml` at the repo root spins up a Postgres container. `DATABASE_URL` in `.env` points to it. `test_database.py` tests run against the real container.

### CI

`.github/workflows/ci.yml` gains a `services: postgres:` block so the same database tests run in CI without mocking.

## Database Schema

```sql
CREATE TABLE IF NOT EXISTS sessions (
    session_id     TEXT        NOT NULL,
    file_id        TEXT        NOT NULL,
    file_name      TEXT        NOT NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_active_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (session_id, file_id)
);

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
);

CREATE INDEX IF NOT EXISTS idx_messages_session_file
    ON messages (session_id, file_id, created_at);
```

## API Contract

### Modified: `POST /upload`

Gains `session_id` as a multipart form field alongside `file`.

```
Form fields:
  file        (PDF binary)
  session_id  (string, UUID)

Response: { "file_id": "..." }   -- unchanged
```

On success, calls `upsert_session(pool, session_id, file_id, file.filename)`.

### Modified: `POST /chat`

`conversation_history` is removed. `session_id` is added.

```json
Request:
{
  "file_id": "...",
  "session_id": "...",
  "message": "..."
}

Response: (unchanged)
{
  "response": "...",
  "response_type": "socratic_response" | "clarification",
  "thinking_quality": "shallow" | "developing" | "insightful",
  "feedback": "..."
}
```

On request:
1. Load history via `get_messages(pool, session_id, file_id)`
2. Convert to `list[BaseMessage]`, pass to `run_agent` and `evaluate_message`
3. After response, call `save_messages` with the new user + assistant turn
4. Call `upsert_session` to update `last_active_at`

### New: `GET /sessions/{session_id}`

Returns all cases the user has worked on, ordered by `last_active_at` descending.

```json
[
  {
    "file_id": "...",
    "file_name": "airbnb.pdf",
    "last_active_at": "2026-04-27T10:00:00Z",
    "message_count": 12
  }
]
```

### New: `GET /sessions/{session_id}/{file_id}/messages`

Returns the full message history for one case, ordered by `created_at` ascending.

```json
[
  { "role": "user", "content": "What is this case about?", "thinking_quality": "shallow", "feedback": "Try to go deeper." },
  { "role": "assistant", "content": "Let's start with...", "response_type": "socratic_response" }
]
```

## Frontend

### `App.tsx`

The localStorage key is hardcoded as the constant `SESSION_KEY = 'case_tutor_session_id'` inside `App.tsx`.

On mount:
1. Read `session_id` from `localStorage[SESSION_KEY]`; generate UUID v4 and save if missing
2. Call `getSessions(session_id)`
3. Render `SessionList` if sessions exist, `FileUpload` otherwise
4. State machine: `view: 'sessions' | 'upload' | 'chat'`

### New: `frontend/src/components/SessionList.tsx`

Renders the list of past cases. Each row: file name, last active date, message count. Two CTAs: "Continue" (sets view to `chat`) and "Upload new case" (sets view to `upload`).

### Modified: `frontend/src/components/Chat.tsx`

- Accepts `sessionId: string` prop
- On mount: calls `getMessages(sessionId, fileId)` and populates `messages` state
- `handleSend`: sends `{ file_id, session_id, message }` — no `conversation_history`
- Local `messages` state is still used for rendering; it is populated from the server on mount and appended to on each new turn

### Modified: `frontend/src/api.ts`

```typescript
uploadPdf(file: File, sessionId: string): Promise<string>
sendMessage(fileId: string, sessionId: string, message: string): Promise<...>
getSessions(sessionId: string): Promise<SessionItem[]>
getMessages(sessionId: string, fileId: string): Promise<MessageItem[]>
```

`conversation_history` parameter removed from `sendMessage`.

## Files

### New
- `backend/src/database.py` — connection pool, `init_db`, `upsert_session`, `save_messages`, `get_messages`, `get_sessions`
- `backend/tests/test_database.py` — integration tests against real Postgres (Docker locally, service in CI)
- `backend/tests/test_sessions.py` — unit tests for `GET /sessions/{session_id}` and `GET /sessions/{session_id}/{file_id}/messages`
- `frontend/src/components/SessionList.tsx` — past sessions list UI
- `docker-compose.yml` — Postgres container for local dev and testing

### Modified
- `backend/src/models.py` — update `ChatRequest` (remove `conversation_history`, add `session_id`); add `SessionItem`, `MessageItem` response models; add `session_id: str` to upload form handling
- `backend/src/main.py` — lifespan for DB pool init; update `/upload` and `/chat`; add two new GET endpoints; update `DATA_DIR` path handling
- `backend/tests/test_chat.py` — mock `get_messages`, `save_messages`, `upsert_session`; remove `conversation_history` from requests
- `backend/.env.example` — add `DATABASE_URL`, `DATA_DIR`
- `.github/workflows/ci.yml` — add Postgres service
- `frontend/src/api.ts` — updated signatures, new functions
- `frontend/src/components/Chat.tsx` — `sessionId` prop, load history on mount, remove history tracking
- `frontend/src/App.tsx` — session_id lifecycle, view state machine

### Untouched
- `backend/src/agent.py`
- `backend/src/evaluator.py`
- `backend/src/rag_service.py`
- `frontend/src/components/FileUpload.tsx`

## Testing

### New: `backend/tests/test_database.py`
Uses a real Postgres connection (from `DATABASE_URL` env var). Tests:
- `test_upsert_session_creates_record`
- `test_upsert_session_updates_last_active_at`
- `test_save_and_get_messages_round_trip`
- `test_get_sessions_returns_ordered_by_last_active`
- `test_get_messages_returns_empty_for_unknown_session`

Each test runs in a transaction that is rolled back on teardown — no persistent test data.

### New: `backend/tests/test_sessions.py`
Mocks `database` functions. Tests:
- `test_get_sessions_returns_list`
- `test_get_sessions_returns_empty_list_for_new_user`
- `test_get_messages_returns_history`

### Modified: `backend/tests/test_chat.py`
- Remove `conversation_history` from all request bodies
- Add `session_id` to all request bodies
- Mock `src.main.get_messages` returning `[]` (or a history list for history test)
- Mock `src.main.save_messages` and `src.main.upsert_session`

### New: `frontend/src/components/__tests__/SessionList.test.tsx`
- `renders list of sessions`
- `calls onContinue with correct fileId when Continue is clicked`
- `calls onUploadNew when Upload new case is clicked`

### Modified: `frontend/src/components/__tests__/Chat.test.tsx`
- Mock `getMessages` to return empty array (or history)
- Remove `conversationHistory` from `sendMessage` mock signature
- Add `sessionId` prop to all `<Chat>` renders

## New Environment Variables

| Variable | Where | Purpose |
|---|---|---|
| `DATABASE_URL` | Railway + local `.env` | Postgres connection string |
| `DATA_DIR` | Railway only | Root for uploads/ and chroma/ (set to `/data`) |

## What Stays the Same

- LangGraph agent graph — unchanged
- ChromaDB storage layout — same paths, just relocated under `DATA_DIR`
- `/upload` response contract — unchanged
- Evaluator logic — unchanged
- Railway + Vercel deployment (triggered by PR merge to main)
