# CaseTutor

An AI-powered Socratic tutor for business case studies. Upload a PDF case, ask questions, and the tutor guides you toward insight — it never gives direct answers. Every response evaluates your critical thinking in real time, giving you a quality badge and actionable feedback to sharpen your analysis.

Built for the kind of rigorous, iterative case preparation that HBS interviews demand.

---

## How It Works

```mermaid
sequenceDiagram
    participant Browser
    participant FastAPI
    participant PostgreSQL
    participant LangGraph
    participant ChromaDB
    participant Evaluator as Evaluator (claude-haiku)

    Browser->>FastAPI: POST /chat {message, file_id, session_id}
    FastAPI->>PostgreSQL: Load chat history
    PostgreSQL-->>FastAPI: message rows[]

    par asyncio.gather
        FastAPI->>LangGraph: run_agent(file_id, message, history)
        LangGraph->>ChromaDB: Retrieve relevant chunks
        ChromaDB-->>LangGraph: docs[]
        LangGraph->>LangGraph: Assess ambiguity
        Note over LangGraph: routes to clarify or socratic_respond
        LangGraph-->>FastAPI: {answer, response_type}
    and
        FastAPI->>Evaluator: evaluate_message(message, history)
        Evaluator-->>FastAPI: {thinking_quality, feedback}
    end

    FastAPI->>PostgreSQL: Save user + assistant messages
    FastAPI-->>Browser: {response, response_type, thinking_quality, feedback}
```

Each chat turn runs the LangGraph agent and the evaluator in parallel (`asyncio.gather`) to minimize latency. All messages and session metadata are persisted so conversations survive page refreshes and can be resumed across sessions.

---

## Architecture

```mermaid
flowchart TD
    subgraph Vercel["Vercel"]
        FE["React 19 + Vite\nTypeScript · Tailwind CSS v4"]
    end

    subgraph Railway_App["Railway — API"]
        API["FastAPI\nPython 3.12"]
        subgraph parallel["asyncio.gather (parallel)"]
            direction LR
            LG["LangGraph Agent\nclaude-sonnet-4-6"]
            EV["Evaluator\nclaude-haiku-4-5"]
        end
        CV["ChromaDB\nper-file vector collections"]
        API --> parallel
        LG --> CV
    end

    subgraph Railway_DB["Railway — PostgreSQL 16"]
        DB[("sessions\nmessages")]
    end

    FE <-->|"HTTPS / REST"| API
    API <-->|"asyncpg pool"| DB
```

### Key Design Decisions

**Stateless agent per request.** `LangGraph` builds a fresh graph on each `/chat` call and hydrates history from PostgreSQL. This avoids in-memory session state on the server, making the backend horizontally scalable and trivially restartable.

**Parallel evaluation.** The Socratic response and the thinking-quality evaluation run concurrently with `asyncio.gather(..., return_exceptions=True)`. Each is independent — the evaluator never sees the tutor's answer, only the student's message and history.

**ChromaDB co-located with the API.** Each uploaded PDF gets its own ChromaDB collection keyed by `file_id`. Vectors are stored on the local filesystem alongside the API process, trading operational simplicity for the scale requirements of a single-tenant tool.

**PostgreSQL for all persistent state.** Sessions and messages use two tables with a compound primary key `(session_id, file_id)`. Schema is auto-migrated at startup via `asyncpg` — no migration framework required at this scale.

### LangGraph Agent

```mermaid
flowchart LR
    retrieve["retrieve\nRAG lookup"] --> assess
    assess["assess\nambiguity?"] -->|"clarify"| clarify["clarify\none focused question"]
    assess -->|"socratic"| socratic["socratic_respond"]
    clarify --> response["response +\nresponse_type"]
    socratic --> response
```

The `assess` node calls Claude with the retrieved context and returns a single word — `clarify` or `socratic`. A conditional edge routes accordingly. The fallback for any unexpected output is `socratic_respond`, so the agent never gets stuck.

---

## Tech Stack

| Layer | Technology | Version |
|---|---|---|
| Frontend framework | React | 19 |
| Build tool | Vite | 8 |
| Styling | Tailwind CSS | 4 |
| Frontend testing | Vitest + Testing Library | 4 / 16 |
| Backend framework | FastAPI | 0.136 |
| Python runtime | Python | 3.12 |
| Package manager | uv | latest |
| Agent framework | LangGraph | 1.1 |
| LLM (tutor) | Claude Sonnet 4.6 | via Anthropic API |
| LLM (evaluator) | Claude Haiku 4.5 | via Anthropic API |
| LangChain integrations | langchain-anthropic, langchain-chroma | 0.3 |
| Vector store | ChromaDB | local |
| PDF parsing | pypdf | 6 |
| Database driver | asyncpg | 0.31 |
| Database | PostgreSQL | 16 |
| Backend testing | pytest-asyncio | 1.3 |
| CI | GitHub Actions | — |

---

## Local Development

### Prerequisites

- **Docker** (for PostgreSQL)
- **uv** — `curl -LsSf https://astral.sh/uv/install.sh | sh`
- **Node.js 20+** and **npm**
- Anthropic API key

### 1. Clone and set up environment variables

```bash
git clone https://github.com/your-username/case-tutor.git
cd case-tutor
```

Create `backend/.env`:

```env
DATABASE_URL=postgresql://case_tutor:case_tutor@localhost:5433/case_tutor
ANTHROPIC_API_KEY=sk-ant-...
ALLOWED_ORIGINS=http://localhost:5173
```

### 2. Start PostgreSQL

```bash
docker compose up -d
```

This starts PostgreSQL 16 on port **5433** (to avoid conflicts with any local Postgres instance). The database schema is created automatically on first API startup.

### 3. Start the backend

```bash
cd backend
uv sync
uv run uvicorn src.main:app --reload
```

The API is available at `http://localhost:8000`. Swagger docs at `/docs`.

### 4. Start the frontend

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`.

---

## Environment Variables

### Backend

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | ✅ | PostgreSQL connection string (`postgresql://user:pass@host:port/db`) |
| `ANTHROPIC_API_KEY` | ✅ | Anthropic API key for Claude access |
| `ALLOWED_ORIGINS` | optional | Comma-separated list of allowed CORS origins (default: `http://localhost:5173`) |
| `DATA_DIR` | optional | Base directory for PDF uploads and ChromaDB collections (default: repo root) |

### Frontend

The frontend talks to the backend via a relative `/api` proxy configured in `vite.config.ts` for local development. For production builds, set the `VITE_API_URL` environment variable to the deployed backend URL.

---

## API Reference

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Health check |
| `POST` | `/upload` | Upload a PDF; returns `file_id` |
| `POST` | `/chat` | Send a message; returns tutor response + evaluation |
| `GET` | `/sessions/{session_id}` | List all sessions for a user |
| `GET` | `/sessions/{session_id}/{file_id}/messages` | Full message history for a session |

### `/upload`

Multipart form: `file` (PDF) + `session_id` (UUID string). Saves the file, indexes it into ChromaDB, and registers the session in PostgreSQL.

### `/chat`

```json
{
  "session_id": "uuid",
  "file_id":    "uuid",
  "message":    "What was the key strategic mistake?"
}
```

Response:

```json
{
  "response":         "What aspects of the competitive landscape stood out to you?",
  "response_type":    "socratic_response",
  "thinking_quality": "developing",
  "feedback":         "Try connecting the pricing decision to the broader market position."
}
```

`response_type` is either `socratic_response` or `clarification`. `thinking_quality` is one of `shallow`, `developing`, or `insightful`.

---

## Database Schema

```sql
CREATE TABLE sessions (
    session_id     TEXT        NOT NULL,
    file_id        TEXT        NOT NULL,
    file_name      TEXT        NOT NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_active_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (session_id, file_id)
);

CREATE TABLE messages (
    id               SERIAL PRIMARY KEY,
    session_id       TEXT        NOT NULL,
    file_id          TEXT        NOT NULL,
    role             TEXT        NOT NULL,   -- 'user' | 'assistant'
    content          TEXT        NOT NULL,
    response_type    TEXT,                   -- 'socratic_response' | 'clarification'
    thinking_quality TEXT,                   -- 'shallow' | 'developing' | 'insightful'
    feedback         TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_messages_session_file ON messages (session_id, file_id, created_at);
```

Evaluator metadata (`thinking_quality`, `feedback`) is stored on the **assistant** row to keep the messages table normalized. The frontend re-attaches it to the preceding user message on load so badges render in the correct visual position.

---

## Testing

### Backend

```bash
cd backend
uv run pytest tests/ -v
```

Tests use a real PostgreSQL database (same schema as production). Integration tests cover all API endpoints and the database layer.

### Frontend

```bash
cd frontend
npm test
```

Component tests cover file upload, session list rendering, chat history loading with evaluator badge re-attachment, and the send/receive message flow.

---

## CI/CD

GitHub Actions runs on every push and pull request to `main`.

**Backend job**: spins up a `postgres:16` service container, runs `uv sync --frozen`, then `pytest`.

**Frontend job**: `npm ci`, `vitest --run`, `vite build` — validates type correctness and produces a production bundle.

Both jobs must pass before merging. The matrix is intentionally minimal: no mocking, no test doubles for the database. The backend tests hit a real Postgres instance to catch schema-level bugs.

---

## Deployment

The application is deployed on **Railway** (backend + PostgreSQL) and **Vercel** (frontend).

**Backend**: Railway auto-deploys from `main`. The `Procfile` at the repo root tells Railway how to start the API:

```
web: uvicorn src.main:app --host 0.0.0.0 --port $PORT
```

Set `DATABASE_URL`, `ANTHROPIC_API_KEY`, and `ALLOWED_ORIGINS` (the Vercel frontend URL) as Railway environment variables. The database schema is created automatically on first deploy.

**Frontend**: Vercel auto-deploys from `main`. Set `VITE_API_URL` to the Railway backend URL in the Vercel project settings.

---

## Project Structure

```
case-tutor/
├── backend/
│   ├── src/
│   │   ├── main.py          # FastAPI app, lifespan, all endpoints
│   │   ├── agent.py         # LangGraph 4-node Socratic agent
│   │   ├── evaluator.py     # Parallel thinking-quality evaluator
│   │   ├── rag_service.py   # ChromaDB indexing and retrieval
│   │   ├── database.py      # asyncpg pool, schema init, CRUD
│   │   ├── pdf_service.py   # pypdf text extraction
│   │   └── models.py        # Pydantic request/response models
│   ├── tests/               # pytest integration tests
│   ├── pyproject.toml
│   └── Procfile
├── frontend/
│   ├── src/
│   │   ├── App.tsx           # Root: routing, session state, theme
│   │   ├── api.ts            # Typed API client
│   │   ├── index.css         # CSS custom properties, light/dark themes
│   │   └── components/
│   │       ├── Chat.tsx       # Message thread, evaluator badges
│   │       ├── FileUpload.tsx # Drag-and-drop PDF uploader
│   │       └── SessionList.tsx# Previous sessions grid
│   ├── index.html            # No-flash theme script
│   └── package.json
├── docker-compose.yml        # Local PostgreSQL (port 5433)
└── .github/workflows/ci.yml  # Backend + frontend CI
```
