# Iteration 1 (Skateboard) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deploy a working end-to-end AI tutor: upload a PDF, ask questions about it, get Claude's response — backend on Railway, frontend on Vercel.

**Architecture:** FastAPI backend exposes two endpoints — `/upload` saves a PDF to disk and returns a `file_id`, `/chat` loads that PDF, puts the full text in a Claude prompt, and returns the response. React frontend has a file picker and a chat UI that call these endpoints.

**Tech Stack:** Python 3.12 + FastAPI + uv + Anthropic SDK + pypdf / React 18 + Vite + TypeScript + Tailwind CSS / Railway (backend) + Vercel (frontend)

---

## File Map

```
case-tutor/
├── backend/
│   ├── pyproject.toml         # uv project config + dependencies
│   ├── .python-version        # pins Python 3.12 for uv
│   ├── Procfile               # Railway start command
│   ├── .env.example           # documents required env vars
│   ├── src/
│   │   ├── __init__.py
│   │   ├── main.py            # FastAPI app, all routes
│   │   ├── models.py          # Pydantic request/response schemas
│   │   ├── pdf_service.py     # PDF → text extraction
│   │   └── claude_service.py  # Anthropic SDK call
│   └── tests/
│       ├── __init__.py
│       ├── conftest.py        # shared fixtures
│       ├── test_health.py
│       ├── test_upload.py
│       └── test_chat.py
├── frontend/
│   ├── package.json
│   ├── vite.config.ts
│   ├── tsconfig.json
│   ├── index.html
│   └── src/
│       ├── main.tsx
│       ├── App.tsx
│       ├── api.ts             # fetch wrapper for all backend calls
│       └── components/
│           ├── FileUpload.tsx
│           └── Chat.tsx
└── README.md
```

---

## Task 1: Initialize the Python backend project with uv

**Files:**
- Create: `backend/pyproject.toml`
- Create: `backend/.python-version`
- Create: `backend/.env.example`
- Create: `backend/src/__init__.py`
- Create: `backend/tests/__init__.py`

- [ ] **Step 1: Initialize the uv project**

```bash
cd /path/to/case-tutor
mkdir -p backend && cd backend
uv init --no-workspace
```

Expected output:
```
Initialized project `backend`
```

This creates `pyproject.toml` and `hello.py`. Delete `hello.py` — we don't need it.

```bash
rm hello.py
```

- [ ] **Step 2: Pin Python version**

```bash
echo "3.12" > .python-version
```

- [ ] **Step 3: Add dependencies**

```bash
uv add fastapi "uvicorn[standard]" anthropic pypdf python-multipart
uv add --dev pytest pytest-asyncio httpx
```

Expected: uv downloads and pins all packages in `pyproject.toml` and `uv.lock`.

- [ ] **Step 4: Create source and test directories**

```bash
mkdir -p src tests
touch src/__init__.py tests/__init__.py
```

- [ ] **Step 5: Create `.env.example`**

```bash
cat > .env.example << 'EOF'
ANTHROPIC_API_KEY=your_key_here
ALLOWED_ORIGINS=http://localhost:5173
EOF
```

- [ ] **Step 6: Verify the project structure**

```bash
ls -R .
```

Expected:
```
./pyproject.toml
./uv.lock
./.python-version
./.env.example
./src/__init__.py
./tests/__init__.py
```

- [ ] **Step 7: Commit**

```bash
cd ..  # back to case-tutor root
git init
git add backend/
git commit -m "chore: initialize Python backend with uv"
```

---

## Task 2: FastAPI health check endpoint (test first)

**Files:**
- Create: `backend/src/main.py`
- Create: `backend/tests/test_health.py`

- [ ] **Step 1: Write the failing test**

`backend/tests/test_health.py`:
```python
from fastapi.testclient import TestClient
from src.main import app

client = TestClient(app)


def test_health_returns_ok():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
cd backend
uv run pytest tests/test_health.py -v
```

Expected: `FAILED` — `ModuleNotFoundError: No module named 'src.main'`

- [ ] **Step 3: Implement the minimal FastAPI app**

`backend/src/main.py`:
```python
import os
from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

UPLOAD_DIR = Path("uploads")
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
```

- [ ] **Step 4: Run the test — it should pass**

```bash
uv run pytest tests/test_health.py -v
```

Expected:
```
PASSED tests/test_health.py::test_health_returns_ok
1 passed in 0.XXs
```

- [ ] **Step 5: Verify the server runs locally**

```bash
uv run uvicorn src.main:app --reload
```

Open http://localhost:8000/health in browser. Expected: `{"status":"ok"}`. Stop with Ctrl+C.

- [ ] **Step 6: Commit**

```bash
git add backend/src/main.py backend/tests/test_health.py
git commit -m "feat: add FastAPI app with health check endpoint"
```

---

## Task 3: Deploy backend skeleton to Railway

**Files:**
- Create: `backend/Procfile`

- [ ] **Step 1: Create the Procfile**

`backend/Procfile`:
```
web: uvicorn src.main:app --host 0.0.0.0 --port $PORT
```

Railway injects `$PORT` at runtime. We must use it — Railway will not expose the default port 8000.

- [ ] **Step 2: Install Railway CLI (if not installed)**

```bash
npm install -g @railway/cli
railway --version
```

- [ ] **Step 3: Login and initialize Railway project**

```bash
cd backend
railway login
railway init
```

At the prompt, name the project `case-tutor-backend`. Select "Empty project".

- [ ] **Step 4: Set the ANTHROPIC_API_KEY environment variable in Railway**

```bash
railway variables set ANTHROPIC_API_KEY=<your_key>
railway variables set ALLOWED_ORIGINS=https://placeholder.vercel.app
```

We'll update `ALLOWED_ORIGINS` after the Vercel URL is known (Task 6).

- [ ] **Step 5: Deploy**

```bash
railway up --detach
```

Expected output ends with something like:
```
Deployment started: https://case-tutor-backend-production.up.railway.app
```

Copy this URL — you'll need it for the frontend.

- [ ] **Step 6: Verify the deployed health endpoint**

```bash
curl https://<your-railway-url>/health
```

Expected: `{"status":"ok"}`

- [ ] **Step 7: Commit**

```bash
git add backend/Procfile
git commit -m "chore: add Procfile for Railway deployment"
```

---

## Task 4: Initialize the React + Vite + TypeScript frontend

**Files:**
- Create: `frontend/` (entire scaffold)

- [ ] **Step 1: Scaffold the Vite project**

```bash
cd /path/to/case-tutor
npm create vite@latest frontend -- --template react-ts
cd frontend
npm install
```

- [ ] **Step 2: Add Tailwind CSS**

```bash
npm install -D tailwindcss @tailwindcss/vite
```

Replace `frontend/src/index.css` with:
```css
@import "tailwindcss";
```

Update `frontend/vite.config.ts`:
```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
})
```

- [ ] **Step 3: Create a minimal placeholder App.tsx**

Replace the default `frontend/src/App.tsx` with:
```tsx
export default function App() {
  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center">
      <h1 className="text-2xl font-bold text-gray-800">CaseTutor — coming soon</h1>
    </main>
  )
}
```

Remove `frontend/src/App.css` and `frontend/src/assets/react.svg` (no longer needed):
```bash
rm src/App.css src/assets/react.svg
```

- [ ] **Step 4: Set the backend URL via env var**

Create `frontend/.env.local` (gitignored):
```
VITE_API_URL=http://localhost:8000
```

Create `frontend/.env.production` (committed, safe — it's just a URL):
```
VITE_API_URL=https://<your-railway-url>
```

Replace `<your-railway-url>` with the URL from Task 3 Step 5.

- [ ] **Step 5: Verify it runs locally**

```bash
npm run dev
```

Open http://localhost:5173 — should show "CaseTutor — coming soon". Stop with Ctrl+C.

- [ ] **Step 6: Commit**

```bash
cd ..
git add frontend/
git commit -m "chore: scaffold React + Vite + TypeScript + Tailwind frontend"
```

---

## Task 5: Deploy frontend to Vercel

- [ ] **Step 1: Install Vercel CLI (if not installed)**

```bash
npm install -g vercel
```

- [ ] **Step 2: Deploy**

```bash
cd frontend
vercel
```

Follow prompts:
- Set up and deploy? **Y**
- Which scope? Select your account
- Link to existing project? **N**
- Project name: `case-tutor`
- Framework: Vercel auto-detects Vite — confirm

- [ ] **Step 3: Set the production env var in Vercel**

```bash
vercel env add VITE_API_URL production
```

When prompted, enter: `https://<your-railway-url>`

- [ ] **Step 4: Redeploy with the env var**

```bash
vercel --prod
```

Copy the production URL (e.g. `https://case-tutor.vercel.app`).

- [ ] **Step 5: Update Railway's ALLOWED_ORIGINS**

```bash
cd ../backend
railway variables set ALLOWED_ORIGINS=https://case-tutor.vercel.app
```

Redeploy backend so it picks up the new CORS config:
```bash
railway up --detach
```

- [ ] **Step 6: Verify cross-origin health check works**

Open browser console on `https://case-tutor.vercel.app`, run:
```js
fetch('https://<your-railway-url>/health').then(r => r.json()).then(console.log)
```

Expected: `{status: "ok"}` — no CORS errors.

- [ ] **Step 7: Commit**

```bash
cd ..
git add frontend/.env.production
git commit -m "chore: configure Vercel deployment and CORS"
```

---

## Task 6: Pydantic models and PDF service (test first)

**Files:**
- Create: `backend/src/models.py`
- Create: `backend/src/pdf_service.py`
- Create: `backend/tests/conftest.py`
- Create: `backend/tests/test_upload.py`

- [ ] **Step 1: Create Pydantic models**

`backend/src/models.py`:
```python
from pydantic import BaseModel


class UploadResponse(BaseModel):
    file_id: str


class ChatRequest(BaseModel):
    file_id: str
    message: str


class ChatResponse(BaseModel):
    response: str
```

- [ ] **Step 2: Write the failing upload test**

`backend/tests/conftest.py`:
```python
import io
import pytest
from fastapi.testclient import TestClient
from src.main import app


@pytest.fixture
def client(tmp_path, monkeypatch):
    import src.main as main_module
    monkeypatch.setattr(main_module, "UPLOAD_DIR", tmp_path)
    return TestClient(app)


@pytest.fixture
def fake_pdf_bytes():
    # Minimal valid PDF header — enough for file type validation
    return b"%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n"
```

`backend/tests/test_upload.py`:
```python
import io


def test_upload_returns_file_id(client, fake_pdf_bytes):
    response = client.post(
        "/upload",
        files={"file": ("case.pdf", io.BytesIO(fake_pdf_bytes), "application/pdf")},
    )
    assert response.status_code == 200
    body = response.json()
    assert "file_id" in body
    assert len(body["file_id"]) == 36  # UUID format


def test_upload_rejects_non_pdf(client):
    response = client.post(
        "/upload",
        files={"file": ("doc.txt", io.BytesIO(b"hello"), "text/plain")},
    )
    assert response.status_code == 400
```

- [ ] **Step 3: Run tests — confirm they fail**

```bash
cd backend
uv run pytest tests/test_upload.py -v
```

Expected: `FAILED` — routes don't exist yet.

- [ ] **Step 4: Implement pdf_service.py**

`backend/src/pdf_service.py`:
```python
from pathlib import Path
from pypdf import PdfReader


def extract_text(file_path: Path) -> str:
    reader = PdfReader(str(file_path))
    pages = [page.extract_text() or "" for page in reader.pages]
    return "\n".join(pages).strip()
```

- [ ] **Step 5: Implement the /upload route in main.py**

Add to `backend/src/main.py` — insert after the imports section, before the health route:

```python
import uuid
from fastapi import FastAPI, File, HTTPException, UploadFile
from src.models import UploadResponse, ChatRequest, ChatResponse
```

Then add the upload route:
```python
@app.post("/upload", response_model=UploadResponse)
async def upload(file: UploadFile = File(...)):
    if file.content_type != "application/pdf":
        raise HTTPException(status_code=400, detail="Only PDF files are accepted")
    file_id = str(uuid.uuid4())
    dest = UPLOAD_DIR / f"{file_id}.pdf"
    content = await file.read()
    dest.write_bytes(content)
    return UploadResponse(file_id=file_id)
```

The full updated `backend/src/main.py`:
```python
import os
import uuid
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from src.models import ChatRequest, ChatResponse, UploadResponse

UPLOAD_DIR = Path("uploads")
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
    if file.content_type != "application/pdf":
        raise HTTPException(status_code=400, detail="Only PDF files are accepted")
    file_id = str(uuid.uuid4())
    dest = UPLOAD_DIR / f"{file_id}.pdf"
    content = await file.read()
    dest.write_bytes(content)
    return UploadResponse(file_id=file_id)
```

- [ ] **Step 6: Run upload tests — they should pass**

```bash
uv run pytest tests/test_upload.py -v
```

Expected:
```
PASSED tests/test_upload.py::test_upload_returns_file_id
PASSED tests/test_upload.py::test_upload_rejects_non_pdf
2 passed
```

- [ ] **Step 7: Commit**

```bash
git add backend/src/models.py backend/src/pdf_service.py backend/src/main.py backend/tests/
git commit -m "feat: add /upload endpoint with PDF validation"
```

---

## Task 7: Claude service and /chat endpoint (test first)

**Files:**
- Create: `backend/src/claude_service.py`
- Create: `backend/tests/test_chat.py`

- [ ] **Step 1: Write the failing chat test**

`backend/tests/test_chat.py`:
```python
import io
from unittest.mock import patch


def test_chat_returns_response(client, fake_pdf_bytes, tmp_path):
    # Upload a fake PDF first
    upload_response = client.post(
        "/upload",
        files={"file": ("case.pdf", io.BytesIO(fake_pdf_bytes), "application/pdf")},
    )
    file_id = upload_response.json()["file_id"]

    # Mock both PDF extraction and Claude to avoid real API calls in tests
    with patch("src.main.extract_text", return_value="This is the case study text."):
        with patch("src.main.ask_claude", return_value="What aspects of this case interest you most?"):
            response = client.post(
                "/chat",
                json={"file_id": file_id, "message": "What is this case about?"},
            )

    assert response.status_code == 200
    assert "response" in response.json()
    assert len(response.json()["response"]) > 0


def test_chat_returns_404_for_unknown_file_id(client):
    with patch("src.main.ask_claude", return_value="irrelevant"):
        response = client.post(
            "/chat",
            json={"file_id": "does-not-exist", "message": "hello"},
        )
    assert response.status_code == 404
```

- [ ] **Step 2: Run tests — confirm they fail**

```bash
uv run pytest tests/test_chat.py -v
```

Expected: `FAILED` — `/chat` route doesn't exist.

- [ ] **Step 3: Implement claude_service.py**

`backend/src/claude_service.py`:
```python
import os
import anthropic

_client = anthropic.Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY"))

SYSTEM_PROMPT = """You are an AI tutor helping students analyze business case studies.
Your role is to help students think critically about the cases they are reading.
Guide students toward insights through thoughtful questions and observations.
Be concise and focused."""


def ask_claude(pdf_text: str, question: str) -> str:
    message = _client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=1024,
        system=SYSTEM_PROMPT,
        messages=[
            {
                "role": "user",
                "content": f"Case study content:\n\n{pdf_text}\n\n---\n\nStudent question: {question}",
            }
        ],
    )
    return message.content[0].text
```

- [ ] **Step 4: Implement the /chat route in main.py**

Add to `backend/src/main.py`:
```python
from src.claude_service import ask_claude
from src.pdf_service import extract_text
```

Then add the chat route:
```python
@app.post("/chat", response_model=ChatResponse)
def chat(request: ChatRequest):
    pdf_path = UPLOAD_DIR / f"{request.file_id}.pdf"
    if not pdf_path.exists():
        raise HTTPException(status_code=404, detail="File not found. Please upload the PDF again.")
    pdf_text = extract_text(pdf_path)
    response_text = ask_claude(pdf_text, request.message)
    return ChatResponse(response=response_text)
```

The full updated `backend/src/main.py`:
```python
import os
import uuid
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from src.claude_service import ask_claude
from src.models import ChatRequest, ChatResponse, UploadResponse
from src.pdf_service import extract_text

UPLOAD_DIR = Path("uploads")
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
    if file.content_type != "application/pdf":
        raise HTTPException(status_code=400, detail="Only PDF files are accepted")
    file_id = str(uuid.uuid4())
    dest = UPLOAD_DIR / f"{file_id}.pdf"
    content = await file.read()
    dest.write_bytes(content)
    return UploadResponse(file_id=file_id)


@app.post("/chat", response_model=ChatResponse)
def chat(request: ChatRequest):
    pdf_path = UPLOAD_DIR / f"{request.file_id}.pdf"
    if not pdf_path.exists():
        raise HTTPException(status_code=404, detail="File not found. Please upload the PDF again.")
    pdf_text = extract_text(pdf_path)
    response_text = ask_claude(pdf_text, request.message)
    return ChatResponse(response=response_text)
```

- [ ] **Step 5: Run all backend tests**

```bash
uv run pytest tests/ -v
```

Expected:
```
PASSED tests/test_health.py::test_health_returns_ok
PASSED tests/test_upload.py::test_upload_returns_file_id
PASSED tests/test_upload.py::test_upload_rejects_non_pdf
PASSED tests/test_chat.py::test_chat_returns_response
PASSED tests/test_chat.py::test_chat_returns_404_for_unknown_file_id
5 passed
```

- [ ] **Step 6: Smoke test with real Anthropic call**

```bash
ANTHROPIC_API_KEY=<your_key> uv run uvicorn src.main:app --reload
```

In another terminal:
```bash
# Upload a real PDF
curl -X POST http://localhost:8000/upload \
  -F "file=@/path/to/any.pdf" | python3 -m json.tool

# Chat with it (replace FILE_ID with value from above)
curl -X POST http://localhost:8000/chat \
  -H "Content-Type: application/json" \
  -d '{"file_id": "FILE_ID", "message": "What is this document about?"}' | python3 -m json.tool
```

Expected: Claude's response in the `response` field.

- [ ] **Step 7: Deploy updated backend to Railway**

```bash
railway up --detach
```

- [ ] **Step 8: Commit**

```bash
git add backend/src/claude_service.py backend/src/main.py backend/tests/test_chat.py
git commit -m "feat: add /chat endpoint with Anthropic SDK integration"
```

---

## Task 8: Frontend API client and FileUpload component

**Files:**
- Create: `frontend/src/api.ts`
- Create: `frontend/src/components/FileUpload.tsx`

- [ ] **Step 1: Create the API client**

`frontend/src/api.ts`:
```ts
const API_URL = import.meta.env.VITE_API_URL as string

export async function uploadPdf(file: File): Promise<string> {
  const form = new FormData()
  form.append('file', file)
  const res = await fetch(`${API_URL}/upload`, { method: 'POST', body: form })
  if (!res.ok) throw new Error(`Upload failed: ${res.statusText}`)
  const data = await res.json()
  return data.file_id as string
}

export async function sendMessage(fileId: string, message: string): Promise<string> {
  const res = await fetch(`${API_URL}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ file_id: fileId, message }),
  })
  if (!res.ok) throw new Error(`Chat failed: ${res.statusText}`)
  const data = await res.json()
  return data.response as string
}
```

- [ ] **Step 2: Create the FileUpload component**

`frontend/src/components/FileUpload.tsx`:
```tsx
import { useRef, useState } from 'react'
import { uploadPdf } from '../api'

interface Props {
  onUpload: (fileId: string, fileName: string) => void
}

export default function FileUpload({ onUpload }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [status, setStatus] = useState<'idle' | 'uploading' | 'error'>('idle')
  const [error, setError] = useState('')

  async function handleFile(file: File) {
    if (file.type !== 'application/pdf') {
      setError('Please select a PDF file.')
      setStatus('error')
      return
    }
    setStatus('uploading')
    setError('')
    try {
      const fileId = await uploadPdf(file)
      onUpload(fileId, file.name)
    } catch (e) {
      setError('Upload failed. Check that the backend is running.')
      setStatus('error')
    }
  }

  return (
    <div className="flex flex-col items-center gap-4 p-8 border-2 border-dashed border-gray-300 rounded-lg">
      <p className="text-gray-600">Upload a business case PDF to begin</p>
      <button
        className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
        disabled={status === 'uploading'}
        onClick={() => inputRef.current?.click()}
      >
        {status === 'uploading' ? 'Uploading…' : 'Choose PDF'}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
      />
      {error && <p className="text-red-600 text-sm">{error}</p>}
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/api.ts frontend/src/components/FileUpload.tsx
git commit -m "feat: add API client and FileUpload component"
```

---

## Task 9: Frontend Chat component and App wiring

**Files:**
- Create: `frontend/src/components/Chat.tsx`
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Create the Chat component**

`frontend/src/components/Chat.tsx`:
```tsx
import { useState } from 'react'
import { sendMessage } from '../api'

interface Message {
  role: 'user' | 'assistant'
  content: string
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
    setMessages((prev) => [...prev, userMessage])
    setInput('')
    setLoading(true)
    try {
      const reply = await sendMessage(fileId, trimmed)
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

- [ ] **Step 2: Wire App.tsx to show upload → chat flow**

`frontend/src/App.tsx`:
```tsx
import { useState } from 'react'
import Chat from './components/Chat'
import FileUpload from './components/FileUpload'

export default function App() {
  const [session, setSession] = useState<{ fileId: string; fileName: string } | null>(null)

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-6 py-4">
        <h1 className="text-xl font-bold text-gray-900">CaseTutor</h1>
        <p className="text-sm text-gray-500">AI-powered business case analysis</p>
      </header>
      <div className="max-w-3xl mx-auto mt-8 px-4">
        {!session ? (
          <FileUpload
            onUpload={(fileId, fileName) => setSession({ fileId, fileName })}
          />
        ) : (
          <div className="bg-white border rounded-lg shadow-sm" style={{ height: '70vh' }}>
            <Chat fileId={session.fileId} fileName={session.fileName} />
          </div>
        )}
      </div>
    </main>
  )
}
```

- [ ] **Step 3: Run the dev server and verify the UI**

```bash
cd frontend
npm run dev
```

Open http://localhost:5173. Verify:
- Upload page shows
- Can pick a PDF and it uploads (needs backend running locally)
- After upload, chat interface appears
- Can type a message and get a response from Claude

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/Chat.tsx frontend/src/App.tsx
git commit -m "feat: add Chat component and wire upload→chat flow in App"
```

---

## Task 10: Full production deployment and end-to-end verification

- [ ] **Step 1: Deploy backend to Railway**

```bash
cd backend
railway up --detach
```

Wait for deployment to complete:
```bash
railway logs
```

- [ ] **Step 2: Deploy frontend to Vercel**

```bash
cd frontend
vercel --prod
```

- [ ] **Step 3: End-to-end test in production**

1. Open `https://case-tutor.vercel.app` in browser
2. Upload a real PDF (any business document or case study)
3. Ask: "What is this document about?"
4. Verify Claude's response appears in the chat

- [ ] **Step 4: Run full backend test suite one final time**

```bash
cd backend
uv run pytest tests/ -v
```

Expected: 5 passed, 0 failed.

- [ ] **Step 5: Final commit and tag**

```bash
git add -A
git commit -m "chore: iteration 1 complete — skateboard deployed"
git tag v0.1.0
```

---

## What you should understand after Iteration 1

- **FastAPI**: Python web framework, async-first, automatic OpenAPI docs at `/docs`
- **uv**: fast Python package manager — replaces pip + venv, pins deps in `uv.lock`
- **Pydantic**: data validation via Python type hints — FastAPI uses it for request/response schemas
- **CORS**: why browsers block cross-origin requests and how `CORSMiddleware` unlocks it
- **Anthropic SDK**: `client.messages.create()` — synchronous, stateless, each call is independent
- **Railway + Procfile**: how `$PORT` works, why we can't hardcode port 8000
- **Ephemeral filesystem limitation**: why uploads disappear on container restart (motivates iteration 2)
- **The gap RAG solves**: you'll notice Claude gets slow/expensive on large PDFs — that's the pain RAG addresses
