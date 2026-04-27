# Iteration 4b (Car — Evaluator) — Student Response Evaluator Design

**Date:** 2026-04-26
**Status:** Approved

## Goal

After each student message, run a fast parallel evaluation that scores the quality of the student's thinking and returns a one-line piece of feedback. The score and feedback are attached to the student's own message bubble in the UI.

## Architecture

### Backend

A new `backend/src/evaluator.py` module exposes one async function:

```python
async def evaluate_message(message: str, chat_history: list[BaseMessage]) -> dict:
    # calls claude-haiku-4-5-20251001
    # returns {"thinking_quality": "shallow"|"developing"|"insightful", "feedback": str}
```

The prompt instructs Haiku to assess the student's critical thinking given the message and conversation history, then return a JSON object with exactly two fields: `thinking_quality` (one of three literal values) and `feedback` (one sentence).

In `main.py`, the `/chat` endpoint fans out both calls in parallel:

```python
agent_result, eval_result = await asyncio.gather(
    run_agent(file_id, message, history),
    evaluate_message(message, history),
)
```

Both results are merged into a single `ChatResponse`.

### LangGraph graph

Unchanged. The evaluator has no knowledge of the LangGraph graph and the graph has no knowledge of the evaluator.

### API contract

`POST /chat` response gains two new fields:

```json
{
  "response": "What do you think drove their early growth?",
  "response_type": "socratic_response",
  "thinking_quality": "developing",
  "feedback": "Try connecting this to the competitive landscape."
}
```

`thinking_quality` is one of: `"shallow"`, `"developing"`, `"insightful"`.
`feedback` is a single sentence of actionable guidance.

Old clients that ignore the new fields continue to work unchanged.

### Frontend

`sendMessage` in `api.ts` returns the two new fields alongside existing ones:

```typescript
Promise<{
  response: string
  responseType: ResponseType
  thinkingQuality: string
  feedback: string
}>
```

The `Message` interface in `Chat.tsx` gains two optional fields:

```typescript
interface Message {
  role: 'user' | 'assistant'
  content: string
  isError?: boolean
  responseType?: ResponseType
  thinkingQuality?: string
  feedback?: string
}
```

When the agent response arrives, `thinkingQuality` and `feedback` are attached to the preceding user message by updating the message list:

```typescript
setMessages((prev) => {
  const updated = [...prev]
  const lastUserIdx = updated.map((m) => m.role).lastIndexOf('user')
  if (lastUserIdx !== -1) {
    updated[lastUserIdx] = { ...updated[lastUserIdx], thinkingQuality, feedback }
  }
  return [...updated, { role: 'assistant', content: reply, responseType }]
})
```

User message bubbles render a colored badge below the text when `thinkingQuality` is set:

| Value | Color class | Label |
|---|---|---|
| `shallow` | `text-red-500` / `bg-red-50` | Shallow |
| `developing` | `text-amber-500` / `bg-amber-50` | Developing |
| `insightful` | `text-green-500` / `bg-green-50` | Insightful |

The badge renders a colored dot + label + feedback line below the message content, inside the user bubble.

## Files

### New
- `backend/src/evaluator.py` — `evaluate_message` async function with Haiku prompt and JSON parsing

### Modified
- `backend/src/models.py` — add `thinking_quality: Literal["shallow", "developing", "insightful"]` and `feedback: str` to `ChatResponse`
- `backend/src/main.py` — replace single `run_agent` call with `asyncio.gather(run_agent(...), evaluate_message(...))`
- `frontend/src/api.ts` — `sendMessage` return type gains `thinkingQuality` and `feedback`
- `frontend/src/components/Chat.tsx` — `Message` interface gains optional fields; user bubble renders evaluation badge

### Untouched
- `backend/src/agent.py`
- `backend/src/rag_service.py`
- `backend/src/pdf_service.py`
- All other frontend files
- `.github/workflows/ci.yml`

## Testing

### New: `backend/tests/test_evaluator.py`
- `test_evaluate_message_returns_insightful` — mock Haiku to return `{"thinking_quality": "insightful", "feedback": "..."}`, assert fields
- `test_evaluate_message_returns_shallow` — mock Haiku to return `{"thinking_quality": "shallow", ...}`, assert fields
- `test_evaluate_message_passes_chat_history` — capture invoke, verify history forwarded
- `test_evaluate_message_falls_back_on_invalid_json` — mock Haiku to return malformed JSON, assert fallback to `{"thinking_quality": "developing", "feedback": ""}`

### Modified: `backend/tests/test_chat.py`
- All `run_agent` mocks updated to include `thinking_quality` and `feedback` in return values
- Mock `evaluate_message` alongside `run_agent` in each test using `AsyncMock`

### Modified: `frontend/src/components/__tests__/Chat.test.tsx`
- Add test: `sendMessage` mock returns `thinkingQuality` and `feedback`; verify badge renders on user bubble
- Add test: `thinkingQuality === "insightful"` renders green label
- Add test: `thinkingQuality === "shallow"` renders red label

## New Environment Variables

None. Uses the existing `ANTHROPIC_API_KEY`.

## What Stays the Same

- `/upload` API contract — unchanged
- `/chat` request contract — unchanged
- LangGraph agent graph — unchanged
- ChromaDB storage layout
- Railway + Vercel deployment (triggered by PR merge to main)
