# Iteration 3 (Motorcycle) — LangGraph Socratic Agent Design

**Date:** 2026-04-26
**Status:** Approved

## Goal

Replace the single LCEL chain with a LangGraph agent that reasons about each student message before responding. The agent decides whether to ask a targeted clarifying question or deliver a Socratic response, making the tutor feel more like a thoughtful conversation partner.

## Workflow Change

Starting from iteration 3, all work happens on a feature branch. Once implementation is complete, open a PR against `main` — Railway and Vercel auto-deploy on merge. No manual deploys.

## Architecture

### Agent graph
```
retrieve → assess → route → clarify
                          → socratic_respond
```

**Stateless:** The `AgentState` TypedDict is instantiated at the start of each `/chat` request and discarded when the response is sent. The frontend continues to send the full `conversation_history` array with every request — the server holds no session state between calls.

### Nodes

| Node | Responsibility |
|------|----------------|
| `retrieve` | Rewrite question as standalone (using chat history), retrieve top-4 chunks from ChromaDB |
| `assess` | Call Claude with a classifier prompt: given context + history + question, return `"clarify"` or `"socratic"` |
| `route` | Conditional edge — reads `assessment`, branches to terminal node |
| `clarify` | Call Claude to produce one focused clarifying sub-question |
| `socratic_respond` | Call Claude to produce a Socratic response that guides without giving the answer |

Both `clarify` and `socratic_respond` are terminal — they write to `answer` and the graph ends. One response per student message.

### LangGraph state schema
```python
class AgentState(TypedDict):
    input: str
    chat_history: list[BaseMessage]
    context: list[Document]
    assessment: str          # "clarify" | "socratic"
    answer: str
    response_type: str       # "clarification" | "socratic_response"
```

## API Contract Change

`POST /chat` response gains one field:

```json
{
  "response": "What do you mean by 'struggling' — is it the financials or the operational side?",
  "response_type": "clarification"
}
```

`response_type` is `"clarification"` or `"socratic_response"`. Old clients that ignore the new field continue to work unchanged.

## Files

### New
- `backend/src/agent.py` — `AgentState`, all 4 node functions, conditional edge, compiled LangGraph graph, and `run_agent(file_id, message, chat_history) -> dict` async entry point

### Modified
- `backend/src/rag_service.py` — extract `get_retriever(file_id) -> VectorStoreRetriever` as a standalone function so `agent.py` can use it without rebuilding the full LCEL chain. `get_rag_chain` stays for backwards compatibility during transition but is unused after this iteration.
- `backend/src/models.py` — add `response_type: Literal["clarification", "socratic_response"]` to `ChatResponse`
- `backend/src/main.py` — `/chat` calls `run_agent` instead of `get_rag_chain`
- `frontend/src/api.ts` — `sendMessage` returns `{ response: string, responseType: string }` instead of just `string`
- `frontend/src/components/Chat.tsx` — render a subtle label on clarification bubbles (e.g. "Clarifying question"); pass `responseType` through to the message interface

### Untouched
- `backend/src/pdf_service.py` — still unused, still in place
- `backend/src/rag_service.py` (index_pdf, get_rag_chain) — `index_pdf` unchanged; `get_rag_chain` left in place but no longer called
- All other frontend files
- `backend/Procfile`, deployment config

## Testing

### Backend — `backend/tests/test_agent.py` (new, 4 tests)
- `test_run_agent_returns_socratic_response` — mock assess node to return `"socratic"`, verify `response_type == "socratic_response"`
- `test_run_agent_returns_clarification` — mock assess node to return `"clarify"`, verify `response_type == "clarification"`
- `test_run_agent_passes_chat_history` — verify conversation history reaches the graph as `BaseMessage` objects
- `test_run_agent_raises_for_unknown_file` — `get_retriever` raises `ValueError`, `/chat` returns 404

Existing `test_chat.py`: swap `get_rag_chain` mock for `run_agent` mock. All other tests untouched.

### Frontend — Vitest + React Testing Library (new)
Tests live in `frontend/src/components/__tests__/`.

- `Chat.test.tsx`:
  - renders the upload prompt when no file is loaded
  - submits a message and displays the assistant reply
  - displays a clarification label when `responseType === "clarification"`
  - shows an error message when the API call fails
  - filters error messages from conversation history before sending

- `FileUpload.test.tsx`:
  - renders the upload button
  - calls `uploadFile` and transitions to chat view on success
  - shows an error message on upload failure

RTL test run added to the existing `frontend` CI job (runs after `npm run build`):
```yaml
- run: npm test -- --run
```

## New Dependencies

```
# backend
langgraph>=0.2.0

# frontend (dev)
@testing-library/react
@testing-library/jest-dom
@testing-library/user-event
vitest
jsdom
```

## New Environment Variables

None. All existing env vars (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `ALLOWED_ORIGINS`) remain unchanged.

## What stays the same

- `/upload` API contract — unchanged
- `/chat` request contract — unchanged (`conversation_history` still sent by frontend)
- ChromaDB storage layout (`backend/chroma/{file_id}/`)
- Railway + Vercel deployment (now triggered by PR merge to main)
- Frontend UI structure — only Chat bubble rendering changes
