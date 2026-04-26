# Iteration 4a (LangSmith Tracing) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Instrument `run_agent` with a `RunnableConfig` so every `/chat` request emits a named, tagged LangSmith trace with `file_id` and `history_length` as searchable metadata.

**Architecture:** LangSmith tracing activates automatically via env vars. We pass a `RunnableConfig` dict to `graph.ainvoke` with `run_name`, `tags`, and `metadata`. No new runtime dependencies — `RunnableConfig` is already part of `langchain_core`. Node-level state (including `assessment` and `response_type`) is visible inside the trace automatically.

**Tech Stack:** Python 3.12, FastAPI, LangGraph, LangChain Core (`RunnableConfig`), LangSmith (env-var activated).

---

## Workflow

All work happens on branch `feat/iteration-4a-langsmith`. When all tasks are complete, open a PR against `main`. Railway auto-deploys on merge.

## File Map

| File | Change |
|------|--------|
| `backend/src/agent.py` | Import `RunnableConfig`; pass it as `config=` to `graph.ainvoke` in `run_agent` |
| `backend/tests/test_agent.py` | Add `test_run_agent_passes_runnable_config`; fix `capture_invoke` in `test_run_agent_passes_chat_history` to accept `config=None` |
| `backend/.env.example` | Add three LangSmith env vars with placeholder values |

---

## Task 1: Feature branch + instrument run_agent (TDD)

**Files:**
- Modify: `backend/src/agent.py`
- Modify: `backend/tests/test_agent.py`

- [ ] **Step 1: Create the feature branch**

From the repo root:

```bash
git checkout -b feat/iteration-4a-langsmith
```

Expected: `Switched to a new branch 'feat/iteration-4a-langsmith'`

- [ ] **Step 2: Write the failing test + fix the broken one**

Open `backend/tests/test_agent.py`.

**Change 1** — in `test_run_agent_passes_chat_history`, update the `capture_invoke` signature from:
```python
async def capture_invoke(state):
```
to:
```python
async def capture_invoke(state, config=None):
```
This is necessary because `run_agent` will now pass `config=RunnableConfig(...)` as a keyword argument to `graph.ainvoke`, and this custom function would otherwise raise `TypeError: got an unexpected keyword argument 'config'`.

**Change 2** — append a new test at the end of the file:

```python
async def test_run_agent_passes_runnable_config():
    captured = {}

    async def capture_invoke(state, config=None):
        captured["config"] = config
        return {**state, "answer": "ok", "response_type": "socratic_response"}

    mock_graph = MagicMock()
    mock_graph.ainvoke = capture_invoke

    with patch("src.agent.build_graph", return_value=mock_graph):
        await run_agent("file-abc123", "Hello", [])

    config = captured["config"]
    assert isinstance(config, dict)
    assert config["metadata"]["file_id"] == "file-abc123"
    assert config["metadata"]["history_length"] == 0
    assert "case-tutor" in config["tags"]
    assert config["run_name"] == "chat-file-abc"
```

Why `"chat-file-abc"`: `"file-abc123"[:8]` = `"file-abc"`, so `run_name = f"chat-{file_id[:8]}"` = `"chat-file-abc"`.

- [ ] **Step 3: Run to confirm the new test fails and the history test is not broken**

```bash
cd backend && uv run pytest tests/test_agent.py -v
```

Expected:
- `test_run_agent_returns_socratic_response` PASS
- `test_run_agent_returns_clarification` PASS
- `test_run_agent_passes_chat_history` PASS (the `config=None` fix is already in)
- `test_run_agent_raises_value_error_for_unknown_file` PASS
- `test_run_agent_passes_runnable_config` FAIL with `AssertionError` or `KeyError` (config is `None` because `run_agent` doesn't pass it yet)

- [ ] **Step 4: Implement the change in agent.py**

Open `backend/src/agent.py`.

**Change 1** — add `RunnableConfig` to the imports block. The existing imports start with:
```python
from typing import TypedDict

from langchain_anthropic import ChatAnthropic
from langchain_core.documents import Document
from langchain_core.messages import BaseMessage
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langgraph.graph import END, StateGraph
```

Replace with:
```python
from typing import TypedDict

from langchain_anthropic import ChatAnthropic
from langchain_core.documents import Document
from langchain_core.messages import BaseMessage
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_core.runnables import RunnableConfig
from langgraph.graph import END, StateGraph
```

**Change 2** — replace the `run_agent` function (currently lines 123–133) with:

```python
async def run_agent(file_id: str, message: str, chat_history: list[BaseMessage]) -> dict:
    graph = build_graph(file_id)
    result = await graph.ainvoke(
        {
            "input": message,
            "chat_history": chat_history,
            "context": [],
            "assessment": "",
            "answer": "",
            "response_type": "",
        },
        config=RunnableConfig(
            run_name=f"chat-{file_id[:8]}",
            tags=["case-tutor"],
            metadata={"file_id": file_id, "history_length": len(chat_history)},
        ),
    )
    return {"answer": result["answer"], "response_type": result["response_type"]}
```

- [ ] **Step 5: Run all agent tests**

```bash
uv run pytest tests/test_agent.py -v
```

Expected: all 5 tests PASS.

- [ ] **Step 6: Run the full test suite**

```bash
uv run pytest tests/ -v
```

Expected: all 21 tests PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/src/agent.py backend/tests/test_agent.py
git commit -m "feat: add RunnableConfig metadata to run_agent for LangSmith tracing"
```

---

## Task 2: Document env vars + open PR

**Files:**
- Modify: `backend/.env.example`

- [ ] **Step 1: Update .env.example**

Replace the full content of `backend/.env.example` with:

```
ANTHROPIC_API_KEY=your_key_here
OPENAI_API_KEY=your_openai_api_key_here
ALLOWED_ORIGINS=http://localhost:5173

# LangSmith tracing (optional — set in Railway for production observability)
LANGCHAIN_TRACING_V2=true
LANGCHAIN_API_KEY=your-langsmith-api-key
LANGCHAIN_PROJECT=case-tutor
```

- [ ] **Step 2: Run full test suite one final time**

```bash
uv run pytest tests/ -v
```

Expected: all 21 tests PASS.

- [ ] **Step 3: Commit**

```bash
git add backend/.env.example
git commit -m "docs: add LangSmith env vars to .env.example"
```

- [ ] **Step 4: Push the branch and open a PR**

```bash
git push -u origin feat/iteration-4a-langsmith
```

```bash
gh pr create \
  --title "feat: iteration 4a — LangSmith tracing with run metadata" \
  --body "$(cat <<'EOF'
## Summary
- Every `/chat` request now emits a named LangSmith trace with `file_id`, `history_length`, and `case-tutor` tag
- `RunnableConfig` passed to `graph.ainvoke` — no new runtime dependencies
- Node-level state (`assessment`, `response_type`, retrieved context) visible inside each trace automatically
- Tracing activates via env vars; disabled in CI, enabled in Railway

## Activating in Railway
Add these env vars to the Railway backend service:
- `LANGCHAIN_TRACING_V2=true`
- `LANGCHAIN_API_KEY=<your LangSmith key>`
- `LANGCHAIN_PROJECT=case-tutor`

## Test plan
- [ ] Backend: `uv run pytest tests/ -v` — 21 tests pass
- [ ] CI passes on this PR
- [ ] After merge: set LangSmith env vars in Railway, send a chat message, confirm trace appears in LangSmith UI

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Expected: PR URL printed.
