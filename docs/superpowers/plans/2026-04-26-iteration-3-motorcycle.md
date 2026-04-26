# Iteration 3 (Motorcycle) — LangGraph Socratic Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the LCEL RAG chain with a LangGraph agent that decides per-message whether to ask a clarifying question or give a Socratic response, and add Vitest + RTL frontend tests.

**Architecture:** A LangGraph StateGraph with four nodes (retrieve → assess → route → clarify|socratic_respond) runs entirely within a single `/chat` request — stateless, no session stored server-side. The frontend sends full conversation history with every request as before. A new `response_type` field in `ChatResponse` tells the frontend which path the agent took.

**Tech Stack:** Python 3.12, FastAPI, uv, LangGraph 0.2+, LangChain, ChromaDB, OpenAI embeddings, Claude via langchain-anthropic. Frontend: React 19, Vite, TypeScript, Tailwind, Vitest, React Testing Library.

---

## Workflow

All work happens on branch `feat/iteration-3-langgraph`. When all tasks are complete, open a PR against `main`. Railway and Vercel auto-deploy on merge — no manual deploys.

## File Map

| File | Change |
|------|--------|
| `backend/src/agent.py` | **Create** — AgentState, 4 node functions, build_graph, run_agent |
| `backend/src/rag_service.py` | **Modify** — extract `get_retriever` as public function; `get_rag_chain` uses it |
| `backend/src/models.py` | **Modify** — add `response_type` field to `ChatResponse` |
| `backend/src/main.py` | **Modify** — `/chat` calls `run_agent` instead of `get_rag_chain` |
| `backend/pyproject.toml` | **Modify** — add `langgraph`, `pytest-asyncio`; add `asyncio_mode` config |
| `backend/tests/test_agent.py` | **Create** — 4 tests for run_agent |
| `backend/tests/test_rag_service.py` | **Modify** — add 2 tests for get_retriever |
| `backend/tests/test_chat.py` | **Modify** — swap `get_rag_chain` mock for `run_agent` mock |
| `frontend/src/api.ts` | **Modify** — sendMessage returns `{ response, responseType }` |
| `frontend/src/components/Chat.tsx` | **Modify** — Message gains responseType; clarification label rendered |
| `frontend/src/components/__tests__/Chat.test.tsx` | **Create** — 5 RTL tests |
| `frontend/src/components/__tests__/FileUpload.test.tsx` | **Create** — 3 RTL tests |
| `frontend/src/test/setup.ts` | **Create** — jest-dom setup |
| `frontend/vite.config.ts` | **Modify** — add test block |
| `frontend/package.json` | **Modify** — add test script + vitest/RTL devDeps |
| `.github/workflows/ci.yml` | **Modify** — add `npm test -- --run` step to frontend job |

---

## Task 1: Feature branch + backend dependencies

**Files:**
- Modify: `backend/pyproject.toml`

- [ ] **Step 1: Create the feature branch**

```bash
git checkout -b feat/iteration-3-langgraph
```

Expected: switched to a new branch 'feat/iteration-3-langgraph'

- [ ] **Step 2: Add langgraph runtime dependency**

From the `backend/` directory:

```bash
uv add langgraph
```

Expected: `pyproject.toml` updated and `uv.lock` regenerated. No errors.

- [ ] **Step 3: Add pytest-asyncio dev dependency**

```bash
uv add --group dev pytest-asyncio
```

Expected: `pytest-asyncio` added to `[dependency-groups] dev` in `pyproject.toml` and lock updated.

- [ ] **Step 4: Add asyncio_mode config to pyproject.toml**

Open `backend/pyproject.toml` and append at the end:

```toml
[tool.pytest.ini_options]
asyncio_mode = "auto"
```

- [ ] **Step 5: Verify existing tests still pass**

```bash
uv run pytest tests/ -v
```

Expected: all 12 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/pyproject.toml backend/uv.lock
git commit -m "feat: add langgraph and pytest-asyncio dependencies"
```

---

## Task 2: Extract get_retriever from rag_service.py (TDD)

**Files:**
- Modify: `backend/src/rag_service.py`
- Modify: `backend/tests/test_rag_service.py`

- [ ] **Step 1: Write two failing tests for get_retriever**

Open `backend/tests/test_rag_service.py`. Add after the existing imports (keep all existing code intact):

```python
from unittest.mock import MagicMock, patch
from src.rag_service import index_pdf, get_rag_chain, get_retriever
```

Then append at the end of the file:

```python
def test_get_retriever_returns_retriever(tmp_path, monkeypatch):
    import src.rag_service as rag_module

    chroma_base = tmp_path / "chroma"
    monkeypatch.setattr(rag_module, "CHROMA_DIR", chroma_base)
    (chroma_base / "file-789").mkdir(parents=True)

    mock_vectorstore = MagicMock()
    mock_retriever = MagicMock()
    mock_vectorstore.as_retriever.return_value = mock_retriever

    with patch("src.rag_service.OpenAIEmbeddings", return_value=FakeEmbeddings()):
        with patch("src.rag_service.Chroma", return_value=mock_vectorstore):
            result = get_retriever("file-789")

    assert result is mock_retriever
    mock_vectorstore.as_retriever.assert_called_once_with(search_kwargs={"k": 4})


def test_get_retriever_raises_for_unknown_file(tmp_path, monkeypatch):
    import src.rag_service as rag_module

    monkeypatch.setattr(rag_module, "CHROMA_DIR", tmp_path / "chroma")

    with pytest.raises(ValueError, match="No index found"):
        get_retriever("nonexistent-file-id")
```

- [ ] **Step 2: Run to confirm the two new tests fail**

```bash
uv run pytest tests/test_rag_service.py -v
```

Expected: `test_get_retriever_returns_retriever` and `test_get_retriever_raises_for_unknown_file` FAIL with ImportError or AttributeError (get_retriever not defined yet). The 3 original tests PASS.

- [ ] **Step 3: Implement get_retriever and refactor get_rag_chain**

Replace the full content of `backend/src/rag_service.py` with:

```python
from pathlib import Path

from langchain_anthropic import ChatAnthropic
from langchain_chroma import Chroma
from langchain_classic.chains import create_history_aware_retriever, create_retrieval_chain
from langchain_classic.chains.combine_documents import create_stuff_documents_chain
from langchain_community.document_loaders import PyPDFLoader
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_core.runnables import Runnable
from langchain_core.vectorstores import VectorStoreRetriever
from langchain_openai import OpenAIEmbeddings
from langchain_text_splitters import RecursiveCharacterTextSplitter

CHROMA_DIR = Path(__file__).resolve().parent.parent / "chroma"

SYSTEM_PROMPT = """You are an AI tutor helping students analyze business case studies.
Your role is to help students think critically about the cases they are reading.
Guide students toward insights through thoughtful questions and observations.
Be concise and focused."""


def index_pdf(file_id: str, file_path: Path) -> None:
    loader = PyPDFLoader(str(file_path))
    docs = loader.load()
    splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=200)
    chunks = splitter.split_documents(docs)
    embeddings = OpenAIEmbeddings(model="text-embedding-3-small")
    Chroma.from_documents(
        chunks,
        embeddings,
        persist_directory=str(CHROMA_DIR / file_id),
    )


def get_retriever(file_id: str) -> VectorStoreRetriever:
    chroma_path = CHROMA_DIR / file_id
    if not chroma_path.exists():
        raise ValueError(f"No index found for file_id: {file_id}")
    embeddings = OpenAIEmbeddings(model="text-embedding-3-small")
    vectorstore = Chroma(
        persist_directory=str(chroma_path),
        embedding_function=embeddings,
    )
    return vectorstore.as_retriever(search_kwargs={"k": 4})


def get_rag_chain(file_id: str) -> Runnable:
    retriever = get_retriever(file_id)
    llm = ChatAnthropic(model="claude-sonnet-4-6", max_tokens=1024)

    contextualize_prompt = ChatPromptTemplate.from_messages([
        (
            "system",
            "Given the chat history and the latest user question, rewrite it as a "
            "standalone question. Return it as-is if already standalone.",
        ),
        MessagesPlaceholder("chat_history"),
        ("human", "{input}"),
    ])
    history_aware_retriever = create_history_aware_retriever(
        llm, retriever, contextualize_prompt
    )

    qa_prompt = ChatPromptTemplate.from_messages([
        ("system", SYSTEM_PROMPT + "\n\nRelevant context from the case:\n{context}"),
        MessagesPlaceholder("chat_history"),
        ("human", "{input}"),
    ])
    question_answer_chain = create_stuff_documents_chain(llm, qa_prompt)

    return create_retrieval_chain(history_aware_retriever, question_answer_chain)
```

- [ ] **Step 4: Run all rag_service tests**

```bash
uv run pytest tests/test_rag_service.py -v
```

Expected: all 5 tests PASS.

- [ ] **Step 5: Run full test suite to confirm nothing broke**

```bash
uv run pytest tests/ -v
```

Expected: all 12 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/src/rag_service.py backend/tests/test_rag_service.py
git commit -m "feat: extract get_retriever from rag_service for use by agent"
```

---

## Task 3: Add response_type to ChatResponse (TDD)

**Files:**
- Modify: `backend/src/models.py`
- Modify: `backend/tests/test_models.py`

- [ ] **Step 1: Write a failing test**

Open `backend/tests/test_models.py`. Append this test:

```python
def test_chat_response_includes_response_type():
    from src.models import ChatResponse
    r = ChatResponse(response="hello", response_type="socratic_response")
    assert r.response_type == "socratic_response"
    assert r.model_dump()["response_type"] == "socratic_response"


def test_chat_response_rejects_invalid_response_type():
    from src.models import ChatResponse
    import pytest
    with pytest.raises(Exception):
        ChatResponse(response="hello", response_type="invalid")
```

- [ ] **Step 2: Run to confirm they fail**

```bash
uv run pytest tests/test_models.py -v
```

Expected: the two new tests FAIL (ChatResponse has no response_type field yet).

- [ ] **Step 3: Add response_type to ChatResponse**

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
```

- [ ] **Step 4: Run model tests**

```bash
uv run pytest tests/test_models.py -v
```

Expected: all tests PASS.

- [ ] **Step 5: Run full test suite**

```bash
uv run pytest tests/ -v
```

Expected: **test_chat.py will have failures** because `ChatResponse` now requires `response_type` but the mocked `run_agent` hasn't been wired up yet. That's expected — we'll fix test_chat.py in Task 5. All other tests PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/src/models.py backend/tests/test_models.py
git commit -m "feat: add response_type field to ChatResponse"
```

---

## Task 4: Create agent.py (TDD)

**Files:**
- Create: `backend/src/agent.py`
- Create: `backend/tests/test_agent.py`

- [ ] **Step 1: Write four failing tests**

Create `backend/tests/test_agent.py`:

```python
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from langchain_core.messages import AIMessage, HumanMessage

from src.agent import run_agent


async def test_run_agent_returns_socratic_response():
    fake_result = {
        "input": "Why did Airbnb succeed?",
        "chat_history": [],
        "context": [],
        "assessment": "socratic",
        "answer": "What factors do you think contributed most to their growth?",
        "response_type": "socratic_response",
    }
    mock_graph = MagicMock()
    mock_graph.ainvoke = AsyncMock(return_value=fake_result)

    with patch("src.agent.build_graph", return_value=mock_graph):
        result = await run_agent("file-001", "Why did Airbnb succeed?", [])

    assert result["response_type"] == "socratic_response"
    assert result["answer"] == "What factors do you think contributed most to their growth?"


async def test_run_agent_returns_clarification():
    fake_result = {
        "input": "Why did it fail?",
        "chat_history": [],
        "context": [],
        "assessment": "clarify",
        "answer": "Are you asking about the financial side or the operational side?",
        "response_type": "clarification",
    }
    mock_graph = MagicMock()
    mock_graph.ainvoke = AsyncMock(return_value=fake_result)

    with patch("src.agent.build_graph", return_value=mock_graph):
        result = await run_agent("file-001", "Why did it fail?", [])

    assert result["response_type"] == "clarification"
    assert result["answer"] == "Are you asking about the financial side or the operational side?"


async def test_run_agent_passes_chat_history():
    history = [HumanMessage(content="First question"), AIMessage(content="First answer")]
    captured = {}

    async def capture_invoke(state):
        captured["chat_history"] = state["chat_history"]
        return {**state, "answer": "ok", "response_type": "socratic_response"}

    mock_graph = MagicMock()
    mock_graph.ainvoke = capture_invoke

    with patch("src.agent.build_graph", return_value=mock_graph):
        await run_agent("file-001", "Follow-up", history)

    assert captured["chat_history"] == history
    assert isinstance(captured["chat_history"][0], HumanMessage)
    assert isinstance(captured["chat_history"][1], AIMessage)


async def test_run_agent_raises_value_error_for_unknown_file():
    with patch("src.agent.get_retriever", side_effect=ValueError("No index found for file_id: unknown")):
        with pytest.raises(ValueError, match="No index found"):
            await run_agent("unknown-file", "Hello", [])
```

- [ ] **Step 2: Run to confirm they all fail**

```bash
uv run pytest tests/test_agent.py -v
```

Expected: all 4 tests FAIL with ImportError (src.agent does not exist yet).

- [ ] **Step 3: Create agent.py**

Create `backend/src/agent.py`:

```python
from typing import TypedDict

from langchain_anthropic import ChatAnthropic
from langchain_core.documents import Document
from langchain_core.messages import BaseMessage
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langgraph.graph import END, StateGraph

from src.rag_service import get_retriever

ASSESS_PROMPT = (
    "You are deciding how to respond to a student studying a business case.\n\n"
    "Given the retrieved context, conversation history, and the student's latest question, decide:\n"
    "- Return \"clarify\" if the question is ambiguous and a targeted clarifying question would help\n"
    "- Return \"socratic\" if you can guide the student toward insight with a Socratic response\n\n"
    "Respond with ONLY one word: \"clarify\" or \"socratic\"."
)

CLARIFY_PROMPT = (
    "You are a Socratic tutor helping a student analyze a business case.\n\n"
    "The student's question needs clarification before you can guide them well.\n"
    "Ask ONE focused, specific clarifying question. Do not answer the original question yet.\n\n"
    "Relevant context from the case:\n{context}"
)

SOCRATIC_PROMPT = (
    "You are a Socratic tutor helping a student analyze a business case.\n\n"
    "Guide the student toward insight through thoughtful questions and observations.\n"
    "Do NOT give direct answers — ask questions that help the student discover the insight themselves.\n"
    "Be concise and focused.\n\n"
    "Relevant context from the case:\n{context}"
)


class AgentState(TypedDict):
    input: str
    chat_history: list[BaseMessage]
    context: list[Document]
    assessment: str
    answer: str
    response_type: str


def _format_context(docs: list[Document]) -> str:
    return "\n\n".join(d.page_content for d in docs)


def build_graph(file_id: str):
    llm = ChatAnthropic(model="claude-sonnet-4-6", max_tokens=1024)
    retriever = get_retriever(file_id)

    async def retrieve(state: AgentState) -> AgentState:
        docs = await retriever.ainvoke(state["input"])
        return {**state, "context": docs}

    async def assess(state: AgentState) -> AgentState:
        prompt = ChatPromptTemplate.from_messages([
            ("system", ASSESS_PROMPT),
            MessagesPlaceholder("chat_history"),
            ("human", "Context:\n{context}\n\nQuestion: {input}"),
        ])
        chain = prompt | llm
        result = await chain.ainvoke({
            "chat_history": state["chat_history"],
            "context": _format_context(state["context"]),
            "input": state["input"],
        })
        assessment = result.content.strip().lower()
        if assessment not in ("clarify", "socratic"):
            assessment = "socratic"
        return {**state, "assessment": assessment}

    def route(state: AgentState) -> str:
        return "clarify" if state["assessment"] == "clarify" else "socratic_respond"

    async def clarify(state: AgentState) -> AgentState:
        prompt = ChatPromptTemplate.from_messages([
            ("system", CLARIFY_PROMPT),
            MessagesPlaceholder("chat_history"),
            ("human", "{input}"),
        ])
        chain = prompt | llm
        result = await chain.ainvoke({
            "context": _format_context(state["context"]),
            "chat_history": state["chat_history"],
            "input": state["input"],
        })
        return {**state, "answer": result.content, "response_type": "clarification"}

    async def socratic_respond(state: AgentState) -> AgentState:
        prompt = ChatPromptTemplate.from_messages([
            ("system", SOCRATIC_PROMPT),
            MessagesPlaceholder("chat_history"),
            ("human", "{input}"),
        ])
        chain = prompt | llm
        result = await chain.ainvoke({
            "context": _format_context(state["context"]),
            "chat_history": state["chat_history"],
            "input": state["input"],
        })
        return {**state, "answer": result.content, "response_type": "socratic_response"}

    builder = StateGraph(AgentState)
    builder.add_node("retrieve", retrieve)
    builder.add_node("assess", assess)
    builder.add_node("clarify", clarify)
    builder.add_node("socratic_respond", socratic_respond)
    builder.set_entry_point("retrieve")
    builder.add_edge("retrieve", "assess")
    builder.add_conditional_edges(
        "assess",
        route,
        {"clarify": "clarify", "socratic_respond": "socratic_respond"},
    )
    builder.add_edge("clarify", END)
    builder.add_edge("socratic_respond", END)
    return builder.compile()


async def run_agent(file_id: str, message: str, chat_history: list[BaseMessage]) -> dict:
    graph = build_graph(file_id)
    result = await graph.ainvoke({
        "input": message,
        "chat_history": chat_history,
        "context": [],
        "assessment": "",
        "answer": "",
        "response_type": "",
    })
    return {"answer": result["answer"], "response_type": result["response_type"]}
```

- [ ] **Step 4: Run agent tests**

```bash
uv run pytest tests/test_agent.py -v
```

Expected: all 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/agent.py backend/tests/test_agent.py
git commit -m "feat: add LangGraph Socratic agent with clarify/socratic_respond routing"
```

---

## Task 5: Update main.py + test_chat.py

**Files:**
- Modify: `backend/src/main.py`
- Modify: `backend/tests/test_chat.py`

- [ ] **Step 1: Rewrite test_chat.py to target run_agent**

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
    ):
        response = client.post(
            "/chat",
            json={"file_id": file_id, "message": "What is this case about?", "conversation_history": []},
        )

    assert response.status_code == 200
    assert response.json()["response"] == "What aspects of this case interest you most?"
    assert response.json()["response_type"] == "socratic_response"


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
    ) as mock_run:
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
    assert len(chat_history) == 2
    assert isinstance(chat_history[0], HumanMessage)
    assert chat_history[0].content == "First question"
    assert isinstance(chat_history[1], AIMessage)
    assert chat_history[1].content == "First answer"


def test_chat_returns_404_when_chroma_index_missing(client, fake_pdf_bytes):
    upload_response = client.post(
        "/upload",
        files={"file": ("case.pdf", io.BytesIO(fake_pdf_bytes), "application/pdf")},
    )
    file_id = upload_response.json()["file_id"]

    with patch("src.main.run_agent", side_effect=ValueError("No index found")):
        response = client.post(
            "/chat",
            json={"file_id": file_id, "message": "hello"},
        )

    assert response.status_code == 404
```

- [ ] **Step 2: Run to confirm test_chat.py failures (expected)**

```bash
uv run pytest tests/test_chat.py -v
```

Expected: all 4 tests FAIL (main.py still imports `get_rag_chain`, `run_agent` doesn't exist there yet).

- [ ] **Step 3: Rewrite main.py**

Replace the full content of `backend/src/main.py` with:

```python
import os
import uuid
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from langchain_core.messages import AIMessage, HumanMessage

from src.agent import run_agent
from src.models import ChatRequest, ChatResponse, UploadResponse
from src.rag_service import index_pdf

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
    try:
        result = await run_agent(
            request.file_id,
            request.message,
            [
                HumanMessage(content=m.content) if m.role == "user"
                else AIMessage(content=m.content)
                for m in request.conversation_history
            ],
        )
    except ValueError:
        raise HTTPException(status_code=404, detail="File not found. Please upload the PDF again.")
    answer = result.get("answer")
    response_type = result.get("response_type")
    if not answer or not response_type:
        raise HTTPException(status_code=502, detail="The AI agent returned an unexpected response.")
    return ChatResponse(response=answer, response_type=response_type)
```

- [ ] **Step 4: Run all backend tests**

```bash
uv run pytest tests/ -v
```

Expected: all 16 tests PASS (12 original + 4 new agent tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/main.py backend/tests/test_chat.py
git commit -m "feat: wire main.py to LangGraph agent, update chat tests"
```

---

## Task 6: Frontend test infrastructure

**Files:**
- Modify: `frontend/package.json`
- Modify: `frontend/vite.config.ts`
- Create: `frontend/src/test/setup.ts`

- [ ] **Step 1: Install Vitest and React Testing Library**

From the `frontend/` directory:

```bash
npm install --save-dev vitest jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event
```

Expected: packages added to `devDependencies` in `package.json`, `package-lock.json` updated.

- [ ] **Step 2: Add test script to package.json**

Open `frontend/package.json`. Add `"test": "vitest"` to the `scripts` block. The scripts section should look like:

```json
"scripts": {
  "dev": "vite",
  "build": "tsc -b && vite build",
  "lint": "eslint .",
  "preview": "vite preview",
  "test": "vitest"
},
```

- [ ] **Step 3: Update vite.config.ts to add test configuration**

Replace the full content of `frontend/vite.config.ts` with:

```typescript
/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    env: {
      VITE_API_URL: 'http://localhost:8000',
    },
  },
})
```

- [ ] **Step 4: Create setup file**

Create `frontend/src/test/setup.ts`:

```typescript
import '@testing-library/jest-dom'
```

- [ ] **Step 5: Verify infrastructure works (no tests yet)**

```bash
npm test -- --run
```

Expected: vitest runs and exits 0 with "No test files found".

- [ ] **Step 6: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/vite.config.ts frontend/src/test/setup.ts
git commit -m "feat: add Vitest and React Testing Library test infrastructure"
```

---

## Task 7: Write failing frontend tests (TDD)

**Files:**
- Create: `frontend/src/components/__tests__/Chat.test.tsx`
- Create: `frontend/src/components/__tests__/FileUpload.test.tsx`

- [ ] **Step 1: Create Chat.test.tsx**

Create `frontend/src/components/__tests__/Chat.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import Chat from '../Chat'
import * as api from '../../../api'

vi.mock('../../../api')

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
      .mockResolvedValueOnce({ response: 'Good question.', responseType: 'socratic_response' })

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
})
```

- [ ] **Step 2: Create FileUpload.test.tsx**

Create `frontend/src/components/__tests__/FileUpload.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import FileUpload from '../FileUpload'
import * as api from '../../../api'

vi.mock('../../../api')

describe('FileUpload', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('renders the upload button', () => {
    render(<FileUpload onUpload={vi.fn()} />)
    expect(screen.getByRole('button', { name: /choose pdf/i })).toBeInTheDocument()
  })

  it('calls onUpload with fileId and fileName on successful upload', async () => {
    vi.mocked(api.uploadPdf).mockResolvedValue('file-123')
    const onUpload = vi.fn()
    render(<FileUpload onUpload={onUpload} />)

    const file = new File(['%PDF-1.4'], 'case.pdf', { type: 'application/pdf' })
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    await userEvent.upload(input, file)

    await waitFor(() => expect(onUpload).toHaveBeenCalledWith('file-123', 'case.pdf'))
  })

  it('shows an error message on upload failure', async () => {
    vi.mocked(api.uploadPdf).mockRejectedValue(new Error('Server error'))
    render(<FileUpload onUpload={vi.fn()} />)

    const file = new File(['%PDF-1.4'], 'case.pdf', { type: 'application/pdf' })
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    await userEvent.upload(input, file)

    await waitFor(() =>
      expect(
        screen.getByText('Upload failed. Check that the backend is running.')
      ).toBeInTheDocument()
    )
  })
})
```

- [ ] **Step 3: Run to confirm tests fail**

```bash
npm test -- --run
```

Expected: 8 tests FAIL. The `sendMessage` mock returning `{ response, responseType }` doesn't match `Chat.tsx` which currently expects a plain string. `FileUpload` tests for "renders the upload button" may PASS already.

- [ ] **Step 4: Commit the failing tests**

```bash
git add frontend/src/components/__tests__/
git commit -m "test: add failing RTL tests for Chat and FileUpload components"
```

---

## Task 8: Implement api.ts + Chat.tsx changes

**Files:**
- Modify: `frontend/src/api.ts`
- Modify: `frontend/src/components/Chat.tsx`

- [ ] **Step 1: Update sendMessage in api.ts**

Replace the full content of `frontend/src/api.ts` with:

```typescript
const API_URL = import.meta.env.VITE_API_URL
if (!API_URL) throw new Error('VITE_API_URL is not set')

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
): Promise<{ response: string; responseType: string }> {
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
  if (typeof response !== 'string') throw new Error('Unexpected response: missing response')
  if (typeof responseType !== 'string') throw new Error('Unexpected response: missing response_type')
  return { response, responseType }
}
```

- [ ] **Step 2: Update Chat.tsx**

Replace the full content of `frontend/src/components/Chat.tsx` with:

```tsx
import { useState } from 'react'
import { sendMessage } from '../api'

interface Message {
  role: 'user' | 'assistant'
  content: string
  isError?: boolean
  responseType?: string
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
    const history = messages.filter((m) => !m.isError)
    setMessages((prev) => [...prev, userMessage])
    setInput('')
    setLoading(true)
    try {
      const { response: reply, responseType } = await sendMessage(fileId, trimmed, history)
      setMessages((prev) => [...prev, { role: 'assistant', content: reply, responseType }])
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
          <div
            key={i}
            className={`max-w-2xl px-4 py-3 rounded-lg text-sm whitespace-pre-wrap ${
              msg.role === 'user'
                ? 'ml-auto bg-blue-600 text-white'
                : 'mr-auto bg-white border text-gray-800'
            }`}
          >
            {msg.role === 'assistant' && msg.responseType === 'clarification' && (
              <p className="text-xs text-blue-500 mb-1 font-medium">Clarifying question</p>
            )}
            {msg.content}
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

Expected: all 8 tests PASS.

- [ ] **Step 4: Verify TypeScript build still passes**

```bash
npm run build
```

Expected: build succeeds with no TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/api.ts frontend/src/components/Chat.tsx
git commit -m "feat: update api.ts and Chat.tsx for response_type support"
```

---

## Task 9: Update CI and open PR

**Files:**
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Add test step to frontend CI job**

Replace the full content of `.github/workflows/ci.yml` with:

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  backend:
    name: Backend tests
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: backend
    steps:
      - uses: actions/checkout@v4
      - uses: astral-sh/setup-uv@v4
      - run: uv sync --frozen
      - run: uv run pytest tests/ -v

  frontend:
    name: Frontend build + tests
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: frontend
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: npm
          cache-dependency-path: frontend/package-lock.json
      - run: npm ci
      - run: npm test -- --run
      - run: npm run build
```

- [ ] **Step 2: Commit the CI change**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add frontend test step to CI workflow"
```

- [ ] **Step 3: Verify final state of all tests locally**

```bash
cd backend && uv run pytest tests/ -v
```

Expected: 16 tests PASS.

```bash
cd ../frontend && npm test -- --run
```

Expected: 8 tests PASS.

- [ ] **Step 4: Push the branch and open a PR**

```bash
git push -u origin feat/iteration-3-langgraph
```

```bash
gh pr create \
  --title "feat: iteration 3 — LangGraph Socratic agent with clarify/socratic routing" \
  --body "$(cat <<'EOF'
## Summary
- Adds a LangGraph agent that decides per-message whether to ask a clarifying question or give a Socratic response
- New `response_type` field (`clarification` | `socratic_response`) in `/chat` response
- Frontend shows a subtle "Clarifying question" label on clarification bubbles
- Adds Vitest + React Testing Library with 8 frontend tests (Chat, FileUpload)
- CI updated to run frontend tests before build

## Test plan
- [ ] Backend: `uv run pytest tests/ -v` — 16 tests pass
- [ ] Frontend: `npm test -- --run` — 8 tests pass
- [ ] Frontend: `npm run build` — clean TypeScript build
- [ ] CI passes on the PR
- [ ] After merge: Railway and Vercel auto-deploy
EOF
)"
```

Expected: PR URL printed. Share it for review before merging.
