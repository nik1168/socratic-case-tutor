# Iteration 4a (Car — Tracing) — LangSmith Observability Design

**Date:** 2026-04-26
**Status:** Approved

## Goal

Add LangSmith tracing to the LangGraph agent so every `/chat` request produces a named, tagged trace with searchable metadata. No frontend changes, no new runtime dependencies, no CI changes.

## How It Works

LangSmith tracing activates via environment variables. When `LANGCHAIN_TRACING_V2=true` and `LANGCHAIN_API_KEY` are set, every `graph.ainvoke` call automatically emits a full trace including node-by-node state, latency, and token usage.

We layer `RunnableConfig` on top to make traces useful to filter and compare:

```python
from langchain_core.runnables import RunnableConfig

config = RunnableConfig(
    run_name=f"chat-{file_id[:8]}",
    tags=["case-tutor"],
    metadata={"file_id": file_id, "history_length": len(chat_history)},
)
result = await graph.ainvoke({...}, config=config)
```

`assessment` and `response_type` are already visible inside the trace as node-level state outputs — they do not need to be manually surfaced.

## Architecture

No architectural changes. This is a pure instrumentation layer on top of the existing `run_agent` function in `agent.py`.

## Files

### Modified
- `backend/src/agent.py` — import `RunnableConfig` from `langchain_core.runnables`; pass `config=RunnableConfig(...)` as second argument to `graph.ainvoke` inside `run_agent`
- `backend/.env.example` — add the three LangSmith env vars with placeholder values
- `backend/tests/test_agent.py` — add one test asserting `RunnableConfig` metadata is forwarded correctly; update `capture_invoke` in `test_run_agent_passes_chat_history` to accept `config=None` as a keyword argument (required now that `ainvoke` receives a second positional arg)

### Untouched
- `backend/src/main.py`, `rag_service.py`, `models.py`
- `frontend/` — all files
- `.github/workflows/ci.yml`

## New Environment Variables

Set in Railway only. Never in CI.

```
LANGCHAIN_TRACING_V2=true
LANGCHAIN_API_KEY=<langsmith api key>
LANGCHAIN_PROJECT=case-tutor
```

Add to `backend/.env.example` as:

```
LANGCHAIN_TRACING_V2=true
LANGCHAIN_API_KEY=your-langsmith-api-key
LANGCHAIN_PROJECT=case-tutor
```

## Testing

### Modified: `backend/tests/test_agent.py`

Add one new test:

```python
async def test_run_agent_passes_runnable_config():
    from langchain_core.runnables import RunnableConfig

    captured = {}

    async def capture_invoke(state, config=None):
        captured["config"] = config
        return {**state, "answer": "ok", "response_type": "socratic_response"}

    mock_graph = MagicMock()
    mock_graph.ainvoke = capture_invoke

    with patch("src.agent.build_graph", return_value=mock_graph):
        await run_agent("file-abc123", "Hello", [])

    assert captured["config"] is not None
    assert isinstance(captured["config"], RunnableConfig)
    assert captured["config"].get("metadata", {}).get("file_id") == "file-abc123"
    assert "case-tutor" in captured["config"].get("tags", [])
```

Update `test_run_agent_passes_chat_history` — change `capture_invoke` signature from `async def capture_invoke(state):` to `async def capture_invoke(state, config=None):` so it doesn't error when `config` is passed.

All 5 existing `test_agent.py` tests continue to pass unchanged (AsyncMock accepts arbitrary kwargs automatically).

## What Stays the Same

- `/upload` and `/chat` API contracts — unchanged
- Frontend behaviour — unchanged
- ChromaDB storage layout
- Railway + Vercel deployment (triggered by PR merge to main)
- All 21 existing backend tests pass
- All 8 existing frontend tests pass
