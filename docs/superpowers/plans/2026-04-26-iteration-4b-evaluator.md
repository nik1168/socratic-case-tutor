# Iteration 4b (Student Evaluator) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After each student message, run a parallel Haiku-powered evaluation that scores thinking quality (`shallow` / `developing` / `insightful`) and returns one sentence of feedback, displayed as a badge below the student's message bubble.

**Architecture:** A new `evaluator.py` module exposes `evaluate_message(message, chat_history) -> dict`. The `/chat` endpoint fans out `run_agent` and `evaluate_message` in parallel with `asyncio.gather`, then merges both results into `ChatResponse`. The frontend attaches the score to the preceding user message and renders a colored badge below it.

**Tech Stack:** Python 3.12, FastAPI, LangGraph, langchain-anthropic (`claude-haiku-4-5-20251001`), asyncio. Frontend: React 19, Vite, TypeScript, Tailwind, Vitest, React Testing Library.

---

## Workflow

All work happens on branch `feat/iteration-4b-evaluator`. When all tasks are complete, open a PR against `main`.

## File Map

| File | Change |
|------|--------|
| `backend/src/evaluator.py` | **Create** — `_build_chain`, `evaluate_message` |
| `backend/src/models.py` | **Modify** — add `thinking_quality` + `feedback` to `ChatResponse` |
| `backend/src/main.py` | **Modify** — `asyncio.gather(run_agent, evaluate_message)` |
| `backend/tests/test_evaluator.py` | **Create** — 4 tests |
| `backend/tests/test_models.py` | **Modify** — add 2 tests; update existing `ChatResponse` fixtures |
| `backend/tests/test_chat.py` | **Modify** — mock `evaluate_message` alongside `run_agent` in all tests |
| `frontend/src/api.ts` | **Modify** — `sendMessage` return type gains `thinkingQuality` + `feedback` |
| `frontend/src/components/Chat.tsx` | **Modify** — `Message` interface + badge rendering + `handleSend` state update |
| `frontend/src/components/__tests__/Chat.test.tsx` | **Modify** — update existing mocks; add 2 badge tests |

---

## Task 1: Feature branch + create evaluator.py (TDD)

**Files:**
- Create: `backend/src/evaluator.py`
- Create: `backend/tests/test_evaluator.py`

- [ ] **Step 1: Create the feature branch**

From the repo root:

```bash
git checkout -b feat/iteration-4b-evaluator
```

Expected: `Switched to a new branch 'feat/iteration-4b-evaluator'`

- [ ] **Step 2: Write four failing tests**

Create `backend/tests/test_evaluator.py`:

```python
from unittest.mock import AsyncMock, MagicMock, patch

from langchain_core.messages import AIMessage, HumanMessage

from src.evaluator import evaluate_message


async def test_evaluate_message_returns_insightful():
    mock_result = MagicMock()
    mock_result.content = '{"thinking_quality": "insightful", "feedback": "Great connection to market dynamics."}'
    mock_chain = MagicMock()
    mock_chain.ainvoke = AsyncMock(return_value=mock_result)

    with patch("src.evaluator._build_chain", return_value=mock_chain):
        result = await evaluate_message("What drove their growth strategy?", [])

    assert result["thinking_quality"] == "insightful"
    assert result["feedback"] == "Great connection to market dynamics."


async def test_evaluate_message_returns_shallow():
    mock_result = MagicMock()
    mock_result.content = '{"thinking_quality": "shallow", "feedback": "Try to go deeper than describing what happened."}'
    mock_chain = MagicMock()
    mock_chain.ainvoke = AsyncMock(return_value=mock_result)

    with patch("src.evaluator._build_chain", return_value=mock_chain):
        result = await evaluate_message("What is this case about?", [])

    assert result["thinking_quality"] == "shallow"
    assert result["feedback"] == "Try to go deeper than describing what happened."


async def test_evaluate_message_passes_chat_history():
    history = [HumanMessage(content="First question"), AIMessage(content="First answer")]
    captured = {}

    async def capture_invoke(inputs):
        captured["inputs"] = inputs
        return MagicMock(content='{"thinking_quality": "developing", "feedback": "Keep exploring."}')

    mock_chain = MagicMock()
    mock_chain.ainvoke = capture_invoke

    with patch("src.evaluator._build_chain", return_value=mock_chain):
        await evaluate_message("Follow-up question", history)

    assert captured["inputs"]["chat_history"] == history
    assert captured["inputs"]["input"] == "Follow-up question"


async def test_evaluate_message_falls_back_on_invalid_json():
    mock_result = MagicMock()
    mock_result.content = "not valid json"
    mock_chain = MagicMock()
    mock_chain.ainvoke = AsyncMock(return_value=mock_result)

    with patch("src.evaluator._build_chain", return_value=mock_chain):
        result = await evaluate_message("Some question", [])

    assert result["thinking_quality"] == "developing"
    assert result["feedback"] == ""
```

- [ ] **Step 3: Run to confirm all 4 tests fail**

```bash
cd backend && uv run pytest tests/test_evaluator.py -v
```

Expected: all 4 FAIL with `ImportError` (module does not exist yet).

- [ ] **Step 4: Create evaluator.py**

Create `backend/src/evaluator.py`:

```python
import json

from langchain_anthropic import ChatAnthropic
from langchain_core.messages import BaseMessage
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder

EVALUATE_PROMPT = (
    "You are assessing the quality of a student's thinking about a business case.\n\n"
    "Given the conversation history and the student's latest message, classify their critical thinking.\n\n"
    "Respond with a JSON object and nothing else (no markdown, no code blocks):\n"
    '{"thinking_quality": "<value>", "feedback": "<one sentence>"}\n\n'
    '"thinking_quality" must be exactly one of:\n'
    '- "shallow": factual questions or surface observations with no analysis\n'
    '- "developing": some analytical thinking but ideas are not yet connected\n'
    '- "insightful": strong critical thinking, connecting concepts or exploring implications\n\n'
    '"feedback" must be one actionable sentence for the student.'
)


def _build_chain():
    llm = ChatAnthropic(model="claude-haiku-4-5-20251001", max_tokens=256)
    prompt = ChatPromptTemplate.from_messages([
        ("system", EVALUATE_PROMPT),
        MessagesPlaceholder("chat_history"),
        ("human", "{input}"),
    ])
    return prompt | llm


async def evaluate_message(message: str, chat_history: list[BaseMessage]) -> dict:
    chain = _build_chain()
    result = await chain.ainvoke({
        "chat_history": chat_history,
        "input": message,
    })
    raw = result.content if isinstance(result.content, str) else ""
    try:
        parsed = json.loads(raw)
        thinking_quality = parsed.get("thinking_quality", "")
        feedback = parsed.get("feedback", "")
        if thinking_quality not in ("shallow", "developing", "insightful"):
            thinking_quality = "developing"
        if not isinstance(feedback, str):
            feedback = ""
        return {"thinking_quality": thinking_quality, "feedback": feedback}
    except (json.JSONDecodeError, AttributeError):
        return {"thinking_quality": "developing", "feedback": ""}
```

- [ ] **Step 5: Run evaluator tests**

```bash
uv run pytest tests/test_evaluator.py -v
```

Expected: all 4 PASS.

- [ ] **Step 6: Run full test suite**

```bash
uv run pytest tests/ -v
```

Expected: all 22 tests PASS (no regressions).

- [ ] **Step 7: Commit**

```bash
git add backend/src/evaluator.py backend/tests/test_evaluator.py
git commit -m "feat: add evaluate_message with Haiku thinking quality scorer"
```

---

## Task 2: Add thinking_quality + feedback to ChatResponse (TDD)

**Files:**
- Modify: `backend/src/models.py`
- Modify: `backend/tests/test_models.py`

- [ ] **Step 1: Write two new failing tests**

Open `backend/tests/test_models.py` and append at the end:

```python
def test_chat_response_includes_thinking_quality_and_feedback():
    r = ChatResponse(
        response="hello",
        response_type="socratic_response",
        thinking_quality="insightful",
        feedback="Great connection.",
    )
    assert r.thinking_quality == "insightful"
    assert r.feedback == "Great connection."
    assert r.model_dump()["thinking_quality"] == "insightful"


def test_chat_response_rejects_invalid_thinking_quality():
    with pytest.raises(ValidationError):
        ChatResponse(
            response="hello",
            response_type="socratic_response",
            thinking_quality="excellent",
            feedback="test",
        )
```

- [ ] **Step 2: Run to confirm new tests fail**

```bash
uv run pytest tests/test_models.py -v
```

Expected: `test_chat_response_includes_thinking_quality_and_feedback` and `test_chat_response_rejects_invalid_thinking_quality` FAIL. Existing 4 tests PASS.

- [ ] **Step 3: Update models.py**

Replace the full content of `backend/src/models.py` with:

```python
from typing import Literal

from pydantic import BaseModel, Field


class UploadResponse(BaseModel):
    file_id: str


class Message(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class ChatRequest(BaseModel):
    file_id: str
    message: str
    conversation_history: list[Message] = Field(default_factory=list)


class ChatResponse(BaseModel):
    response: str
    response_type: Literal["clarification", "socratic_response"]
    thinking_quality: Literal["shallow", "developing", "insightful"]
    feedback: str
```

- [ ] **Step 4: Update existing ChatResponse fixtures in test_models.py**

`ChatResponse` now requires `thinking_quality` and `feedback`. The existing tests that construct `ChatResponse` without them will fail. Replace the full content of `backend/tests/test_models.py` with:

```python
import pytest
from pydantic import ValidationError

from src.models import ChatRequest, ChatResponse, Message


def test_chat_request_accepts_conversation_history():
    req = ChatRequest(
        file_id="abc",
        message="hello",
        conversation_history=[
            Message(role="user", content="first"),
            Message(role="assistant", content="second"),
        ],
    )
    assert len(req.conversation_history) == 2
    assert req.conversation_history[0].role == "user"
    assert req.conversation_history[0].content == "first"
    assert req.conversation_history[1].role == "assistant"


def test_chat_request_defaults_conversation_history_to_empty():
    req = ChatRequest(file_id="abc", message="hello")
    assert req.conversation_history == []


def test_chat_response_includes_response_type():
    r = ChatResponse(
        response="hello",
        response_type="socratic_response",
        thinking_quality="developing",
        feedback="Keep exploring.",
    )
    assert r.response_type == "socratic_response"
    assert r.model_dump()["response_type"] == "socratic_response"

    c = ChatResponse(
        response="hello",
        response_type="clarification",
        thinking_quality="shallow",
        feedback="Try to go deeper.",
    )
    assert c.response_type == "clarification"
    assert c.model_dump()["response_type"] == "clarification"


def test_chat_response_rejects_invalid_response_type():
    with pytest.raises(ValidationError):
        ChatResponse(
            response="hello",
            response_type="invalid",
            thinking_quality="developing",
            feedback="test",
        )


def test_chat_response_includes_thinking_quality_and_feedback():
    r = ChatResponse(
        response="hello",
        response_type="socratic_response",
        thinking_quality="insightful",
        feedback="Great connection.",
    )
    assert r.thinking_quality == "insightful"
    assert r.feedback == "Great connection."
    assert r.model_dump()["thinking_quality"] == "insightful"


def test_chat_response_rejects_invalid_thinking_quality():
    with pytest.raises(ValidationError):
        ChatResponse(
            response="hello",
            response_type="socratic_response",
            thinking_quality="excellent",
            feedback="test",
        )
```

- [ ] **Step 5: Run model tests**

```bash
uv run pytest tests/test_models.py -v
```

Expected: all 6 tests PASS.

- [ ] **Step 6: Run full suite — expect test_chat.py failures**

```bash
uv run pytest tests/ -v
```

Expected: `test_chat.py` tests FAIL because `main.py` still constructs `ChatResponse` without the new required fields. `test_models.py` and `test_evaluator.py` all PASS. Task 3 fixes the remaining failures.

- [ ] **Step 7: Commit**

```bash
git add backend/src/models.py backend/tests/test_models.py
git commit -m "feat: add thinking_quality and feedback fields to ChatResponse"
```

---

## Task 3: Update main.py + test_chat.py (TDD)

**Files:**
- Modify: `backend/src/main.py`
- Modify: `backend/tests/test_chat.py`

- [ ] **Step 1: Rewrite test_chat.py to mock evaluate_message**

Replace the full content of `backend/tests/test_chat.py` with:

```python
import io
from unittest.mock import AsyncMock, patch


def test_chat_returns_response(client, fake_pdf_bytes):
    upload_response = client.post(
        "/upload",
        files={"file": ("case.pdf", io.BytesIO(fake_pdf_bytes), "application/pdf")},
    )
    file_id = upload_response.json()["file_id"]

    with patch(
        "src.main.run_agent",
        new_callable=AsyncMock,
        return_value={"answer": "What aspects of this case interest you most?", "response_type": "socratic_response"},
    ), patch(
        "src.main.evaluate_message",
        new_callable=AsyncMock,
        return_value={"thinking_quality": "developing", "feedback": "Keep exploring the financials."},
    ):
        response = client.post(
            "/chat",
            json={"file_id": file_id, "message": "What is this case about?", "conversation_history": []},
        )

    assert response.status_code == 200
    data = response.json()
    assert data["response"] == "What aspects of this case interest you most?"
    assert data["response_type"] == "socratic_response"
    assert data["thinking_quality"] == "developing"
    assert data["feedback"] == "Keep exploring the financials."


def test_chat_returns_404_for_unknown_file_id(client):
    response = client.post(
        "/chat",
        json={"file_id": "does-not-exist", "message": "hello"},
    )
    assert response.status_code == 404


def test_chat_passes_conversation_history_to_agent(client, fake_pdf_bytes):
    from langchain_core.messages import AIMessage, HumanMessage

    upload_response = client.post(
        "/upload",
        files={"file": ("case.pdf", io.BytesIO(fake_pdf_bytes), "application/pdf")},
    )
    file_id = upload_response.json()["file_id"]

    with patch(
        "src.main.run_agent",
        new_callable=AsyncMock,
        return_value={"answer": "Sure.", "response_type": "socratic_response"},
    ) as mock_run, patch(
        "src.main.evaluate_message",
        new_callable=AsyncMock,
        return_value={"thinking_quality": "developing", "feedback": ""},
    ):
        client.post(
            "/chat",
            json={
                "file_id": file_id,
                "message": "Follow-up",
                "conversation_history": [
                    {"role": "user", "content": "First question"},
                    {"role": "assistant", "content": "First answer"},
                ],
            },
        )

    _file_id, _message, chat_history = mock_run.call_args[0]
    assert _file_id == file_id
    assert _message == "Follow-up"
    assert len(chat_history) == 2
    assert isinstance(chat_history[0], HumanMessage)
    assert chat_history[0].content == "First question"
    assert isinstance(chat_history[1], AIMessage)
    assert chat_history[1].content == "First answer"


def test_chat_returns_404_when_chroma_index_missing(client, fake_pdf_bytes, tmp_path, monkeypatch):
    import src.main as main_module

    upload_response = client.post(
        "/upload",
        files={"file": ("case.pdf", io.BytesIO(fake_pdf_bytes), "application/pdf")},
    )
    file_id = upload_response.json()["file_id"]

    monkeypatch.setattr(main_module, "CHROMA_DIR", tmp_path / "empty_chroma")

    response = client.post(
        "/chat",
        json={"file_id": file_id, "message": "hello"},
    )

    assert response.status_code == 404
    assert response.json()["detail"] == "File not found. Please upload the PDF again."
```

- [ ] **Step 2: Run test_chat.py — expect all 4 to fail**

```bash
uv run pytest tests/test_chat.py -v
```

Expected: all 4 FAIL — `main.py` still constructs `ChatResponse` without the new fields and doesn't import `evaluate_message`.

- [ ] **Step 3: Rewrite main.py**

Replace the full content of `backend/src/main.py` with:

```python
import asyncio
import os
import uuid
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from langchain_core.messages import AIMessage, HumanMessage

from src.agent import run_agent
from src.evaluator import evaluate_message
from src.models import ChatRequest, ChatResponse, UploadResponse
from src.rag_service import CHROMA_DIR, index_pdf

UPLOAD_DIR = Path(__file__).resolve().parent.parent / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)

app = FastAPI(title="CaseTutor API")

allowed_origins = os.environ.get("ALLOWED_ORIGINS", "http://localhost:5173").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/upload", response_model=UploadResponse)
async def upload(file: UploadFile = File(...)):
    base_type = (file.content_type or "").split(";")[0].strip()
    if base_type != "application/pdf":
        raise HTTPException(status_code=400, detail="Only PDF files are accepted")
    file_id = str(uuid.uuid4())
    dest = UPLOAD_DIR / f"{file_id}.pdf"
    content = await file.read()
    dest.write_bytes(content)
    index_pdf(file_id, dest)
    return UploadResponse(file_id=file_id)


@app.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    pdf_path = UPLOAD_DIR / f"{request.file_id}.pdf"
    if not pdf_path.exists():
        raise HTTPException(status_code=404, detail="File not found. Please upload the PDF again.")
    chroma_path = CHROMA_DIR / request.file_id
    if not chroma_path.exists():
        raise HTTPException(status_code=404, detail="File not found. Please upload the PDF again.")
    history = [
        HumanMessage(content=m.content) if m.role == "user"
        else AIMessage(content=m.content)
        for m in request.conversation_history
    ]
    agent_result, eval_result = await asyncio.gather(
        run_agent(request.file_id, request.message, history),
        evaluate_message(request.message, history),
    )
    answer = agent_result.get("answer")
    response_type = agent_result.get("response_type")
    if not answer or not response_type:
        raise HTTPException(status_code=502, detail="The AI agent returned an unexpected response.")
    return ChatResponse(
        response=answer,
        response_type=response_type,
        thinking_quality=eval_result.get("thinking_quality", "developing"),
        feedback=eval_result.get("feedback", ""),
    )
```

- [ ] **Step 4: Run all backend tests**

```bash
uv run pytest tests/ -v
```

Expected: all 26 tests PASS (22 previous + 4 new evaluator tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/main.py backend/tests/test_chat.py
git commit -m "feat: fan out run_agent and evaluate_message in parallel via asyncio.gather"
```

---

## Task 4: Write failing frontend tests (TDD)

**Files:**
- Modify: `frontend/src/components/__tests__/Chat.test.tsx`

- [ ] **Step 1: Replace Chat.test.tsx**

Replace the full content of `frontend/src/components/__tests__/Chat.test.tsx` with:

```tsx
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import Chat from '../Chat'
import * as api from '../../api'

vi.mock('../../api')

describe('Chat', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('renders the empty state prompt', () => {
    render(<Chat fileId="file-1" fileName="case.pdf" />)
    expect(screen.getByText('Ask your first question about the case')).toBeInTheDocument()
  })

  it('submits a message and displays the assistant reply', async () => {
    vi.mocked(api.sendMessage).mockResolvedValue({
      response: 'What do you think drove their growth?',
      responseType: 'socratic_response',
      thinkingQuality: 'developing',
      feedback: 'Try connecting this to the competitive landscape.',
    })
    render(<Chat fileId="file-1" fileName="case.pdf" />)
    await userEvent.type(screen.getByRole('textbox'), 'Tell me about Airbnb')
    await userEvent.click(screen.getByRole('button', { name: /send/i }))
    await waitFor(() =>
      expect(screen.getByText('What do you think drove their growth?')).toBeInTheDocument()
    )
  })

  it('shows a clarification label when responseType is clarification', async () => {
    vi.mocked(api.sendMessage).mockResolvedValue({
      response: 'Are you asking about the financial side or the operational side?',
      responseType: 'clarification',
      thinkingQuality: 'developing',
      feedback: 'Good start.',
    })
    render(<Chat fileId="file-1" fileName="case.pdf" />)
    await userEvent.type(screen.getByRole('textbox'), 'Why did it fail?')
    await userEvent.click(screen.getByRole('button', { name: /send/i }))
    await waitFor(() =>
      expect(screen.getByText('Clarifying question')).toBeInTheDocument()
    )
  })

  it('shows an error message when the API call fails', async () => {
    vi.mocked(api.sendMessage).mockRejectedValue(new Error('Network error'))
    render(<Chat fileId="file-1" fileName="case.pdf" />)
    await userEvent.type(screen.getByRole('textbox'), 'Hello')
    await userEvent.click(screen.getByRole('button', { name: /send/i }))
    await waitFor(() =>
      expect(screen.getByText('Error: could not reach the backend.')).toBeInTheDocument()
    )
  })

  it('filters error messages from conversation history before sending', async () => {
    vi.mocked(api.sendMessage)
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValueOnce({
        response: 'Good question.',
        responseType: 'socratic_response',
        thinkingQuality: 'developing',
        feedback: '',
      })

    render(<Chat fileId="file-1" fileName="case.pdf" />)

    await userEvent.type(screen.getByRole('textbox'), 'First question')
    await userEvent.click(screen.getByRole('button', { name: /send/i }))
    await waitFor(() =>
      expect(screen.getByText('Error: could not reach the backend.')).toBeInTheDocument()
    )

    await userEvent.type(screen.getByRole('textbox'), 'Second question')
    await userEvent.click(screen.getByRole('button', { name: /send/i }))
    await waitFor(() => expect(screen.getByText('Good question.')).toBeInTheDocument())

    const secondCall = vi.mocked(api.sendMessage).mock.calls[1]
    const history = secondCall[2]!
    expect(history).toHaveLength(1)
    expect(history[0].content).toBe('First question')
  })

  it('shows thinking quality badge on user message after response', async () => {
    vi.mocked(api.sendMessage).mockResolvedValue({
      response: 'Good question.',
      responseType: 'socratic_response',
      thinkingQuality: 'insightful',
      feedback: 'Great connection to the competitive landscape.',
    })
    render(<Chat fileId="file-1" fileName="case.pdf" />)
    await userEvent.type(screen.getByRole('textbox'), 'What drove their growth?')
    await userEvent.click(screen.getByRole('button', { name: /send/i }))
    await waitFor(() =>
      expect(screen.getByText(/insightful/i)).toBeInTheDocument()
    )
    expect(screen.getByText('Great connection to the competitive landscape.')).toBeInTheDocument()
  })

  it('shows red badge for shallow thinking quality', async () => {
    vi.mocked(api.sendMessage).mockResolvedValue({
      response: 'Can you clarify what you mean?',
      responseType: 'clarification',
      thinkingQuality: 'shallow',
      feedback: 'Try going deeper than describing what happened.',
    })
    render(<Chat fileId="file-1" fileName="case.pdf" />)
    await userEvent.type(screen.getByRole('textbox'), 'What is Airbnb?')
    await userEvent.click(screen.getByRole('button', { name: /send/i }))
    await waitFor(() =>
      expect(screen.getByText(/shallow/i)).toBeInTheDocument()
    )
    expect(screen.getByText('Try going deeper than describing what happened.')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run to confirm 2 new tests fail, 5 existing pass**

```bash
cd frontend && npm test -- --run
```

Expected:
- 5 existing tests PASS
- `shows thinking quality badge on user message after response` FAIL
- `shows red badge for shallow thinking quality` FAIL

- [ ] **Step 3: Commit the failing tests**

```bash
git add frontend/src/components/__tests__/Chat.test.tsx
git commit -m "test: add failing badge tests for thinking quality evaluation"
```

---

## Task 5: Implement api.ts + Chat.tsx

**Files:**
- Modify: `frontend/src/api.ts`
- Modify: `frontend/src/components/Chat.tsx`

- [ ] **Step 1: Replace api.ts**

Replace the full content of `frontend/src/api.ts` with:

```typescript
const API_URL = import.meta.env.VITE_API_URL
if (!API_URL) throw new Error('VITE_API_URL is not set')

export type ResponseType = 'clarification' | 'socratic_response'

const RESPONSE_TYPES: readonly string[] = ['clarification', 'socratic_response']
function isResponseType(value: unknown): value is ResponseType {
  return typeof value === 'string' && (RESPONSE_TYPES as string[]).includes(value)
}

export async function uploadPdf(file: File): Promise<string> {
  const form = new FormData()
  form.append('file', file)
  const res = await fetch(`${API_URL}/upload`, { method: 'POST', body: form })
  if (!res.ok) throw new Error(`Upload failed: ${res.statusText}`)
  const data = await res.json()
  const fileId = data?.file_id
  if (typeof fileId !== 'string' || fileId === '') throw new Error('Unexpected response: missing file_id')
  return fileId
}

export async function sendMessage(
  fileId: string,
  message: string,
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }> = []
): Promise<{ response: string; responseType: ResponseType; thinkingQuality: string; feedback: string }> {
  const res = await fetch(`${API_URL}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      file_id: fileId,
      message,
      conversation_history: conversationHistory,
    }),
  })
  if (!res.ok) throw new Error(`Chat failed: ${res.statusText}`)
  const data = await res.json()
  const response = data?.response
  const responseType = data?.response_type
  const thinkingQuality = data?.thinking_quality ?? ''
  const feedback = data?.feedback ?? ''
  if (typeof response !== 'string') throw new Error('Unexpected response: missing response')
  if (!isResponseType(responseType)) throw new Error('Unexpected response: invalid response_type')
  return { response, responseType, thinkingQuality: String(thinkingQuality), feedback: String(feedback) }
}
```

- [ ] **Step 2: Replace Chat.tsx**

Replace the full content of `frontend/src/components/Chat.tsx` with:

```tsx
import { useState } from 'react'
import { sendMessage, type ResponseType } from '../api'

interface Message {
  role: 'user' | 'assistant'
  content: string
  isError?: boolean
  responseType?: ResponseType
  thinkingQuality?: string
  feedback?: string
}

interface Props {
  fileId: string
  fileName: string
}

export default function Chat({ fileId, fileName }: Props) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSend() {
    const trimmed = input.trim()
    if (!trimmed || loading) return
    const userMessage: Message = { role: 'user', content: trimmed }
    const history = messages.filter((m) => !m.isError).map(({ role, content }) => ({ role, content }))
    setMessages((prev) => [...prev, userMessage])
    setInput('')
    setLoading(true)
    try {
      const { response: reply, responseType, thinkingQuality, feedback } = await sendMessage(fileId, trimmed, history)
      setMessages((prev) => {
        const updated = [...prev]
        const lastUserIdx = updated.map((m) => m.role).lastIndexOf('user')
        if (lastUserIdx !== -1) {
          updated[lastUserIdx] = { ...updated[lastUserIdx], thinkingQuality, feedback }
        }
        return [...updated, { role: 'assistant', content: reply, responseType }]
      })
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: 'Error: could not reach the backend.', isError: true },
      ])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-2 bg-gray-100 border-b text-sm text-gray-600">
        Case: <span className="font-medium">{fileName}</span>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && (
          <p className="text-gray-400 text-sm text-center mt-8">
            Ask your first question about the case
          </p>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={msg.role === 'user' ? 'flex flex-col items-end' : ''}>
            <div
              className={`max-w-2xl px-4 py-3 rounded-lg text-sm whitespace-pre-wrap ${
                msg.role === 'user'
                  ? 'bg-blue-600 text-white'
                  : 'mr-auto bg-white border text-gray-800'
              }`}
            >
              {msg.role === 'assistant' && msg.responseType === 'clarification' && (
                <p className="text-xs text-blue-500 mb-1 font-medium">Clarifying question</p>
              )}
              {msg.content}
            </div>
            {msg.role === 'user' && msg.thinkingQuality && msg.feedback && (
              <div
                className={`mt-1 text-xs rounded px-2 py-1 ${
                  msg.thinkingQuality === 'insightful'
                    ? 'bg-green-50 text-green-700'
                    : msg.thinkingQuality === 'shallow'
                    ? 'bg-red-50 text-red-700'
                    : 'bg-amber-50 text-amber-700'
                }`}
              >
                <span className="font-medium capitalize">{msg.thinkingQuality}</span>
                {' — '}
                {msg.feedback}
              </div>
            )}
          </div>
        ))}
        {loading && (
          <div className="mr-auto bg-white border rounded-lg px-4 py-3 text-sm text-gray-400">
            Thinking…
          </div>
        )}
      </div>
      <div className="p-4 border-t flex gap-2">
        <input
          className="flex-1 border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Ask about the case…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          disabled={loading}
        />
        <button
          className="px-4 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:opacity-50"
          onClick={handleSend}
          disabled={loading}
        >
          Send
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Run frontend tests**

```bash
npm test -- --run
```

Expected: all 7 tests PASS.

- [ ] **Step 4: Run TypeScript build**

```bash
npm run build
```

Expected: clean build, no TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/api.ts frontend/src/components/Chat.tsx
git commit -m "feat: update api.ts and Chat.tsx to display thinking quality badge"
```

---

## Task 6: Open PR

- [ ] **Step 1: Run final local checks**

```bash
cd backend && uv run pytest tests/ -v
```

Expected: 26 tests PASS.

```bash
cd ../frontend && npm test -- --run
```

Expected: 7 tests PASS (was 8 — FileUpload has 3, Chat now has 7 — wait: FileUpload.test.tsx has 3, Chat.test.tsx has 7 = 10 total).

Actually re-counting: FileUpload.test.tsx has 3 tests. Chat.test.tsx now has 7 tests. Total = 10 frontend tests.

- [ ] **Step 2: Push and open PR**

```bash
git push -u origin feat/iteration-4b-evaluator
```

```bash
gh pr create \
  --title "feat: iteration 4b — student thinking quality evaluator" \
  --body "$(cat <<'EOF'
## Summary
- Adds parallel Haiku-powered evaluation of student thinking quality on every /chat request
- New fields in /chat response: thinking_quality (shallow | developing | insightful) and feedback (one sentence)
- Frontend shows a colored badge below the student's message bubble after each response
- asyncio.gather runs agent and evaluator in parallel — zero added latency
- No new env vars required (uses existing ANTHROPIC_API_KEY)

## Test plan
- [ ] Backend: uv run pytest tests/ -v — 26 tests pass
- [ ] Frontend: npm test -- --run — 10 tests pass
- [ ] Frontend: npm run build — clean TypeScript build
- [ ] CI passes on this PR
- [ ] After merge: send a message in the app and verify the badge appears below your message

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```
