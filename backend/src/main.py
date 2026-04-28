import asyncio
import os
import uuid
from contextlib import asynccontextmanager
from pathlib import Path

import asyncpg
from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from langchain_core.messages import AIMessage, HumanMessage

from src.agent import run_agent
from src.database import get_messages, get_sessions, init_db, save_messages, upsert_session
from src.evaluator import evaluate_message
from src.models import ChatRequest, ChatResponse, MessageItem, SessionItem, UploadResponse
from src.rag_service import CHROMA_DIR, index_pdf

DATA_DIR = Path(os.environ.get("DATA_DIR", Path(__file__).resolve().parent.parent))
UPLOAD_DIR = DATA_DIR / "uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


@asynccontextmanager
async def lifespan(app: FastAPI):
    pool = await asyncpg.create_pool(os.environ["DATABASE_URL"])
    await init_db(pool)
    app.state.pool = pool
    yield
    await pool.close()


app = FastAPI(title="CaseTutor API", lifespan=lifespan)

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
async def upload(file: UploadFile = File(...), session_id: str = Form(...)):
    base_type = (file.content_type or "").split(";")[0].strip()
    if base_type != "application/pdf":
        raise HTTPException(status_code=400, detail="Only PDF files are accepted")
    file_id = str(uuid.uuid4())
    dest = UPLOAD_DIR / f"{file_id}.pdf"
    content = await file.read()
    dest.write_bytes(content)
    index_pdf(file_id, dest)
    await upsert_session(app.state.pool, session_id, file_id, file.filename or file_id)
    return UploadResponse(file_id=file_id)


@app.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    pdf_path = UPLOAD_DIR / f"{request.file_id}.pdf"
    if not pdf_path.exists():
        raise HTTPException(status_code=404, detail="File not found. Please upload the PDF again.")
    chroma_path = CHROMA_DIR / request.file_id
    if not chroma_path.exists():
        raise HTTPException(status_code=404, detail="File not found. Please upload the PDF again.")

    stored = await get_messages(app.state.pool, request.session_id, request.file_id)
    history = [
        HumanMessage(content=m["content"]) if m["role"] == "user"
        else AIMessage(content=m["content"])
        for m in stored
    ]

    agent_result, eval_result = await asyncio.gather(
        run_agent(request.file_id, request.message, history),
        evaluate_message(request.message, history),
        return_exceptions=True,
    )
    if isinstance(agent_result, Exception):
        raise HTTPException(status_code=502, detail="The AI agent returned an unexpected response.")
    if isinstance(eval_result, Exception):
        eval_result = {}

    answer = agent_result.get("answer")
    response_type = agent_result.get("response_type")
    if not answer or not response_type:
        raise HTTPException(status_code=502, detail="The AI agent returned an unexpected response.")

    thinking_quality = eval_result.get("thinking_quality", "developing")
    feedback = eval_result.get("feedback", "")

    await save_messages(app.state.pool, request.session_id, request.file_id, [
        {"role": "user", "content": request.message},
        {
            "role": "assistant",
            "content": answer,
            "response_type": response_type,
            "thinking_quality": thinking_quality,
            "feedback": feedback,
        },
    ])
    # Updates last_active_at; file_name already stored from /upload
    await upsert_session(app.state.pool, request.session_id, request.file_id, "")

    return ChatResponse(
        response=answer,
        response_type=response_type,
        thinking_quality=thinking_quality,
        feedback=feedback,
    )


@app.get("/sessions/{session_id}", response_model=list[SessionItem])
async def list_sessions(session_id: str):
    return await get_sessions(app.state.pool, session_id)


@app.get("/sessions/{session_id}/{file_id}/messages", response_model=list[MessageItem])
async def list_messages(session_id: str, file_id: str):
    return await get_messages(app.state.pool, session_id, file_id)
