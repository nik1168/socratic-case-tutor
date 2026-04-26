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
async def chat(request: ChatRequest):
    pdf_path = UPLOAD_DIR / f"{request.file_id}.pdf"
    if not pdf_path.exists():
        raise HTTPException(status_code=404, detail="File not found. Please upload the PDF again.")
    chain = get_rag_chain(request.file_id)
    result = await chain.ainvoke({
        "input": request.message,
        "chat_history": [
            HumanMessage(content=m.content) if m.role == "user"
            else AIMessage(content=m.content)
            for m in request.conversation_history
        ],
    })
    answer = result.get("answer")
    if not answer:
        raise HTTPException(status_code=502, detail="The AI chain returned an unexpected response.")
    return ChatResponse(response=answer)
