# Iteration 2 (Scooter) — RAG Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace full-PDF-in-context with a LangChain RAG pipeline (ChromaDB + OpenAI embeddings) and add conversation history so the Socratic tutor builds on prior exchanges within a session.

**Architecture:** Each uploaded PDF is chunked, embedded via OpenAI `text-embedding-3-small`, and stored in a per-file ChromaDB collection on disk (`backend/chroma/{file_id}/`). Each `/chat` request loads that collection, rewrites the user's question as a standalone query using conversation history, retrieves the top 4 chunks, and passes them to `claude-sonnet-4-6` via a LangChain LCEL chain. The frontend sends the full `conversation_history` array with each request; the server remains stateless.

**Tech Stack:** LangChain 0.3 (LCEL), langchain-anthropic, langchain-openai (text-embedding-3-small), langchain-chroma (ChromaDB), langchain-community (PyPDFLoader), FastAPI, React 18 + TypeScript

---

### Task 1: Install LangChain dependencies and update environment config

**Files:**
- Modify: `backend/pyproject.toml`
- Modify: `backend/.env.example`
- Modify: `.gitignore`

- [ ] **Step 1: Replace the dependencies section in pyproject.toml**

Replace the `dependencies` list in `backend/pyproject.toml`:

```toml
dependencies = [
    "anthropic>=0.97.0",
    "fastapi>=0.136.1",
    "langchain>=0.3.0",
    "langchain-anthropic>=0.3.0",
    "langchain-chroma>=0.1.0",
    "langchain-community>=0.3.0",
    "langchain-openai>=0.2.0",
    "pypdf>=6.10.2",
    "python-dotenv>=1.0.0",
    "python-multipart>=0.0.26",
    "uvicorn[standard]>=0.46.0",
]
```

- [ ] **Step 2: Sync to install new packages**

```bash
cd backend && uv sync
```

Expected: all packages install, `uv.lock` is updated, no errors.

- [ ] **Step 3: Add OPENAI_API_KEY to .env.example**

In `backend/.env.example`, add after the `ANTHROPIC_API_KEY` line:

```
OPENAI_API_KEY=your_openai_api_key_here
```

- [ ] **Step 4: Add backend/chroma/ to .gitignore**

In `.gitignore`, add after the `backend/uploads/` line:

```
backend/chroma/
```

- [ ] **Step 5: Commit**

```bash
git add backend/pyproject.toml backend/uv.lock backend/.env.example .gitignore
git commit -m "chore: install LangChain deps and update env config"
```

---

### Task 2: Update models.py to add Message and conversation_history

**Files:**
- Modify: `backend/src/models.py`
- Create: `backend/tests/test_models.py`

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/test_models.py`:

```python
from src.models import ChatRequest, Message


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


def test_chat_request_defaults_conversation_history_to_empty():
    req = ChatRequest(file_id="abc", message="hello")
    assert req.conversation_history == []
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && uv run pytest tests/test_models.py -v
```

Expected: FAIL — `ImportError: cannot import name 'Message' from 'src.models'`

- [ ] **Step 3: Update models.py**

Replace the entire `backend/src/models.py`:

```python
from pydantic import BaseModel


class UploadResponse(BaseModel):
    file_id: str


class Message(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    file_id: str
    message: str
    conversation_history: list[Message] = []


class ChatResponse(BaseModel):
    response: str
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd backend && uv run pytest tests/test_models.py tests/test_upload.py tests/test_chat.py -v
```

Expected: PASS — 6 tests passing (test_models: 2, test_upload: 2, test_chat: 2)

- [ ] **Step 5: Commit**

```bash
git add backend/src/models.py backend/tests/test_models.py
git commit -m "feat: add Message model and conversation_history to ChatRequest"
```

---

### Task 3: Implement rag_service.py — index_pdf

**Files:**
- Create: `backend/src/rag_service.py`
- Create: `backend/tests/test_rag_service.py`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_rag_service.py`:

```python
from pathlib import Path
from unittest.mock import patch

import pytest
from langchain_core.documents import Document
from langchain_core.embeddings import Embeddings

from src.rag_service import index_pdf


class FakeEmbeddings(Embeddings):
    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        return [[0.1] * 8 for _ in texts]

    def embed_query(self, text: str) -> list[float]:
        return [0.1] * 8


def test_index_pdf_creates_chroma_directory(tmp_path, monkeypatch):
    import src.rag_service as rag_module

    chroma_base = tmp_path / "chroma"
    monkeypatch.setattr(rag_module, "CHROMA_DIR", chroma_base)

    fake_pdf = tmp_path / "test.pdf"
    fake_pdf.write_bytes(b"%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n")

    with patch("src.rag_service.PyPDFLoader") as mock_loader:
        mock_loader.return_value.load.return_value = [
            Document(
                page_content="Airbnb disrupted the hotel industry.",
                metadata={"page": 0},
            )
        ]
        with patch("src.rag_service.OpenAIEmbeddings", return_value=FakeEmbeddings()):
            index_pdf("file-123", fake_pdf)

    assert (chroma_base / "file-123").exists()
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend && uv run pytest tests/test_rag_service.py::test_index_pdf_creates_chroma_directory -v
```

Expected: FAIL — `ModuleNotFoundError: No module named 'src.rag_service'`

- [ ] **Step 3: Create rag_service.py with index_pdf**

Create `backend/src/rag_service.py`:

```python
from pathlib import Path

from langchain.chains import create_history_aware_retriever, create_retrieval_chain
from langchain.chains.combine_documents import create_stuff_documents_chain
from langchain_anthropic import ChatAnthropic
from langchain_chroma import Chroma
from langchain_community.document_loaders import PyPDFLoader
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_core.runnables import Runnable
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
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd backend && uv run pytest tests/test_rag_service.py::test_index_pdf_creates_chroma_directory -v
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/rag_service.py backend/tests/test_rag_service.py
git commit -m "feat: add rag_service index_pdf"
```

---

### Task 4: Implement rag_service.py — get_rag_chain

**Files:**
- Modify: `backend/src/rag_service.py`
- Modify: `backend/tests/test_rag_service.py`

- [ ] **Step 1: Write the failing tests**

Append to `backend/tests/test_rag_service.py` (after the existing content):

```python
from langchain_core.runnables import Runnable, RunnableLambda

from src.rag_service import get_rag_chain


def test_get_rag_chain_returns_runnable(tmp_path, monkeypatch):
    import src.rag_service as rag_module

    chroma_base = tmp_path / "chroma"
    monkeypatch.setattr(rag_module, "CHROMA_DIR", chroma_base)

    # Simulate an already-indexed collection by creating the directory
    (chroma_base / "file-456").mkdir(parents=True)

    fake_runnable = RunnableLambda(lambda x: x)

    with patch("src.rag_service.OpenAIEmbeddings", return_value=FakeEmbeddings()):
        with patch("src.rag_service.Chroma"):
            with patch("src.rag_service.ChatAnthropic"):
                with patch("src.rag_service.create_retrieval_chain", return_value=fake_runnable):
                    chain = get_rag_chain("file-456")

    assert isinstance(chain, Runnable)


def test_get_rag_chain_raises_for_unknown_file(tmp_path, monkeypatch):
    import src.rag_service as rag_module

    monkeypatch.setattr(rag_module, "CHROMA_DIR", tmp_path / "chroma")

    with pytest.raises(ValueError, match="No index found"):
        get_rag_chain("nonexistent-file-id")
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && uv run pytest tests/test_rag_service.py::test_get_rag_chain_returns_runnable tests/test_rag_service.py::test_get_rag_chain_raises_for_unknown_file -v
```

Expected: FAIL — `ImportError: cannot import name 'get_rag_chain' from 'src.rag_service'`

- [ ] **Step 3: Add get_rag_chain to rag_service.py**

Append to `backend/src/rag_service.py` (after the `index_pdf` function):

```python
def get_rag_chain(file_id: str) -> Runnable:
    chroma_path = CHROMA_DIR / file_id
    if not chroma_path.exists():
        raise ValueError(f"No index found for file_id: {file_id}")

    llm = ChatAnthropic(model="claude-sonnet-4-6", max_tokens=1024)
    embeddings = OpenAIEmbeddings(model="text-embedding-3-small")

    vectorstore = Chroma(
        persist_directory=str(chroma_path),
        embedding_function=embeddings,
    )
    retriever = vectorstore.as_retriever(search_kwargs={"k": 4})

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

- [ ] **Step 4: Run all RAG service tests**

```bash
cd backend && uv run pytest tests/test_rag_service.py -v
```

Expected: PASS — 3 tests passing

- [ ] **Step 5: Commit**

```bash
git add backend/src/rag_service.py backend/tests/test_rag_service.py
git commit -m "feat: add rag_service get_rag_chain"
```

---

### Task 5: Wire /upload to call index_pdf

**Files:**
- Modify: `backend/src/main.py`
- Modify: `backend/tests/conftest.py`
- Modify: `backend/tests/test_upload.py`

- [ ] **Step 1: Add index_pdf import to main.py**

In `backend/src/main.py`, add `index_pdf` to the existing `src.rag_service` import (add after the existing `from src.pdf_service import extract_text` line):

```python
from src.rag_service import index_pdf
```

The top of main.py should now look like:

```python
import os
import uuid
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from src.claude_service import ask_claude
from src.models import ChatRequest, ChatResponse, UploadResponse
from src.pdf_service import extract_text
from src.rag_service import index_pdf
```

- [ ] **Step 2: Update conftest.py to mock index_pdf in all tests**

Replace the entire `backend/tests/conftest.py`:

```python
import pytest
from unittest.mock import MagicMock
from fastapi.testclient import TestClient
from src.main import app


@pytest.fixture
def mock_index_pdf(monkeypatch):
    import src.main as main_module
    mock = MagicMock()
    monkeypatch.setattr(main_module, "index_pdf", mock)
    return mock


@pytest.fixture
def client(tmp_path, monkeypatch, mock_index_pdf):
    import src.main as main_module
    monkeypatch.setattr(main_module, "UPLOAD_DIR", tmp_path)
    return TestClient(app)


@pytest.fixture
def fake_pdf_bytes():
    return b"%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n"
```

- [ ] **Step 3: Write the failing test**

Append to `backend/tests/test_upload.py`:

```python
def test_upload_calls_index_pdf(client, mock_index_pdf, fake_pdf_bytes):
    response = client.post(
        "/upload",
        files={"file": ("case.pdf", io.BytesIO(fake_pdf_bytes), "application/pdf")},
    )
    assert response.status_code == 200
    mock_index_pdf.assert_called_once()
    file_id = response.json()["file_id"]
    called_file_id, _ = mock_index_pdf.call_args[0]
    assert called_file_id == file_id
```

- [ ] **Step 4: Run test to verify it fails for the right reason**

```bash
cd backend && uv run pytest tests/test_upload.py::test_upload_calls_index_pdf -v
```

Expected: FAIL — `AssertionError: Expected 'mock' to have been called once. Called 0 times.`

- [ ] **Step 5: Update /upload to call index_pdf**

In `backend/src/main.py`, replace the `/upload` route with:

```python
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
```

- [ ] **Step 6: Run all upload tests**

```bash
cd backend && uv run pytest tests/test_upload.py -v
```

Expected: PASS — 3 tests passing

- [ ] **Step 7: Commit**

```bash
git add backend/src/main.py backend/tests/conftest.py backend/tests/test_upload.py
git commit -m "feat: call index_pdf after upload"
```

---

### Task 6: Wire /chat to use RAG chain and retire claude_service.py

**Files:**
- Modify: `backend/src/main.py`
- Modify: `backend/tests/test_chat.py`
- Delete: `backend/src/claude_service.py`

- [ ] **Step 1: Replace test_chat.py**

Replace the entire `backend/tests/test_chat.py`:

```python
import io
from unittest.mock import MagicMock, patch


def test_chat_returns_response(client, fake_pdf_bytes):
    upload_response = client.post(
        "/upload",
        files={"file": ("case.pdf", io.BytesIO(fake_pdf_bytes), "application/pdf")},
    )
    file_id = upload_response.json()["file_id"]

    fake_chain = MagicMock()
    fake_chain.invoke.return_value = {"answer": "What aspects of this case interest you most?"}

    with patch("src.main.get_rag_chain", return_value=fake_chain):
        response = client.post(
            "/chat",
            json={
                "file_id": file_id,
                "message": "What is this case about?",
                "conversation_history": [],
            },
        )

    assert response.status_code == 200
    assert "response" in response.json()
    assert len(response.json()["response"]) > 0


def test_chat_returns_404_for_unknown_file_id(client):
    response = client.post(
        "/chat",
        json={"file_id": "does-not-exist", "message": "hello"},
    )
    assert response.status_code == 404
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend && uv run pytest tests/test_chat.py::test_chat_returns_response -v
```

Expected: FAIL — `src.main.get_rag_chain` doesn't exist yet; `ask_claude` is still being called.

- [ ] **Step 3: Replace main.py imports and /chat route**

Replace the entire `backend/src/main.py`:

```python
import os
import uuid
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from langchain_core.messages import AIMessage, HumanMessage

from src.models import ChatRequest, ChatResponse, UploadResponse
from src.rag_service import get_rag_chain, index_pdf

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
def chat(request: ChatRequest):
    pdf_path = UPLOAD_DIR / f"{request.file_id}.pdf"
    if not pdf_path.exists():
        raise HTTPException(status_code=404, detail="File not found. Please upload the PDF again.")
    chain = get_rag_chain(request.file_id)
    result = chain.invoke({
        "input": request.message,
        "chat_history": [
            HumanMessage(content=m.content) if m.role == "user"
            else AIMessage(content=m.content)
            for m in request.conversation_history
        ],
    })
    return ChatResponse(response=result["answer"])
```

- [ ] **Step 4: Delete claude_service.py**

```bash
rm backend/src/claude_service.py
```

- [ ] **Step 5: Run all backend tests**

```bash
cd backend && uv run pytest tests/ -v
```

Expected: PASS — 10 tests passing (test_models: 2, test_upload: 3, test_chat: 2, test_rag_service: 3)

- [ ] **Step 6: Commit**

```bash
git add backend/src/main.py backend/tests/test_chat.py
git rm backend/src/claude_service.py
git commit -m "feat: switch /chat to RAG chain, retire claude_service"
```

---

### Task 7: Update frontend to send conversation_history

**Files:**
- Modify: `frontend/src/api.ts`
- Modify: `frontend/src/components/Chat.tsx`

- [ ] **Step 1: Update sendMessage in api.ts**

In `frontend/src/api.ts`, replace the `sendMessage` function:

```typescript
export async function sendMessage(
  fileId: string,
  message: string,
  conversationHistory: Array<{ role: string; content: string }> = []
): Promise<string> {
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
  if (typeof response !== 'string') throw new Error('Unexpected response: missing response')
  return response
}
```

- [ ] **Step 2: Update handleSend in Chat.tsx**

In `frontend/src/components/Chat.tsx`, replace the `handleSend` function:

```typescript
  async function handleSend() {
    const trimmed = input.trim()
    if (!trimmed || loading) return
    const userMessage: Message = { role: 'user', content: trimmed }
    const history = [...messages]
    setMessages((prev) => [...prev, userMessage])
    setInput('')
    setLoading(true)
    try {
      const reply = await sendMessage(fileId, trimmed, history)
      setMessages((prev) => [...prev, { role: 'assistant', content: reply }])
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: 'Error: could not reach the backend.' },
      ])
    } finally {
      setLoading(false)
    }
  }
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd frontend && npm run build
```

Expected: Build succeeds with no TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/api.ts frontend/src/components/Chat.tsx
git commit -m "feat: send conversation_history with each chat request"
```

---

### Task 8: Deploy to Railway + Vercel and smoke test

**Files:** No code changes — deployment and verification only.

- [ ] **Step 1: Add OPENAI_API_KEY to local .env**

In `backend/.env`, add:

```
OPENAI_API_KEY=<your actual OpenAI API key>
```

- [ ] **Step 2: Smoke test index_pdf locally**

Start the backend:

```bash
cd backend && uv run uvicorn src.main:app --reload
```

Upload the mock PDF (in a separate terminal):

```bash
curl -X POST http://localhost:8000/upload \
  -F "file=@mock/sample.pdf" \
  -H "Accept: application/json"
```

Expected: `{"file_id": "<uuid>"}` and a new directory at `backend/chroma/<uuid>/`.

- [ ] **Step 3: Smoke test /chat locally**

```bash
curl -X POST http://localhost:8000/chat \
  -H "Content-Type: application/json" \
  -d '{"file_id": "<uuid from above>", "message": "What is this case about?", "conversation_history": []}'
```

Expected: `{"response": "..."}` containing a Socratic question from Claude.

- [ ] **Step 4: Set OPENAI_API_KEY in Railway**

```bash
railway variables set OPENAI_API_KEY=<your actual OpenAI API key>
```

Expected: confirmation line `Set OPENAI_API_KEY`.

- [ ] **Step 5: Deploy backend**

```bash
railway up --detach
```

Expected: deploy starts; monitor Railway dashboard until status shows "Success".

- [ ] **Step 6: Deploy frontend**

```bash
cd frontend && npx vercel --prod
```

Expected: deployment URL printed, production deploy succeeds.

- [ ] **Step 7: End-to-end smoke test on production**

1. Open https://case-tutor.vercel.app
2. Upload `mock/sample.pdf`
3. Send "What is the main challenge discussed in this case?"
4. Verify a Socratic response arrives
5. Send a follow-up referencing the first answer (e.g. "Why does that challenge matter?")
6. Verify the response builds on the prior exchange — confirms `conversation_history` is flowing end to end
