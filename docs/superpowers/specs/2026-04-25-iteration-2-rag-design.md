# Iteration 2 (Scooter) — RAG Pipeline Design

**Date:** 2026-04-25
**Status:** Approved

## Goal

Replace the "full PDF in context" approach with a RAG pipeline so the tutor scales to large PDFs without hitting token limits or incurring excessive cost. Add conversation history so the Socratic tutor can build on prior exchanges within a session.

## Architecture

### Upload flow (new)
```
PDF → disk (unchanged)
PDF → PyPDFLoader → RecursiveCharacterTextSplitter → OpenAI embeddings → ChromaDB (persisted to backend/chroma/{file_id}/)
```

### Chat flow (new)
```
{message, conversation_history, file_id}
  → create_history_aware_retriever
      (rewrites question as standalone using history)
  → ChromaDB retriever (top 4 chunks)
  → create_stuff_documents_chain
      (stuffs chunks into prompt, calls Claude)
  → {answer}
```

## Key Design Decisions

- **ChromaDB storage:** persisted to disk at `backend/chroma/{file_id}/`, one collection per uploaded PDF. Path anchored to `__file__` like `UPLOAD_DIR`. Directory is gitignored.
- **Conversation history:** frontend sends the full `conversation_history` array with each `/chat` request. Server remains stateless — no session storage.
- **LangChain depth:** full LCEL chain via `create_history_aware_retriever` + `create_retrieval_chain`. No legacy `ConversationalRetrievalChain`.
- **Chunking:** `RecursiveCharacterTextSplitter`, chunk_size=1000, chunk_overlap=200.
- **Retrieval:** top 4 chunks (`k=4`).
- **Embeddings:** OpenAI `text-embedding-3-small` via `langchain-openai`.
- **LLM:** `ChatAnthropic(model="claude-sonnet-4-6")` via `langchain-anthropic`.

## Files

### New
- `backend/src/rag_service.py` — entire RAG pipeline:
  - `index_pdf(file_id: str, file_path: Path) -> None` — chunks, embeds, stores in ChromaDB
  - `get_rag_chain(file_id: str) -> Runnable` — loads ChromaDB collection, builds and returns LCEL chain
- `backend/tests/test_rag_service.py` — unit tests for `index_pdf` and `get_rag_chain` with mocked OpenAI embeddings

### Modified
- `backend/src/models.py` — add `Message(role: str, content: str)`; add `conversation_history: list[Message] = []` to `ChatRequest`
- `backend/src/main.py` — `/upload` calls `index_pdf` after saving; `/chat` invokes `get_rag_chain(file_id).invoke(...)` instead of `extract_text` + `ask_claude`
- `backend/src/claude_service.py` — deleted. `ask_claude` is retired; LangChain owns the LLM call via `langchain-anthropic`.
- `frontend/src/api.ts` — `sendMessage` adds `conversation_history` to request body
- `frontend/src/components/Chat.tsx` — passes `messages` array to `sendMessage`

### Untouched
- `backend/src/pdf_service.py` — superseded by `PyPDFLoader` inside `rag_service.py`; left in place but unused
- All other frontend files
- `backend/Procfile`, deployment config

## LCEL Chain (rag_service.py)

```python
llm = ChatAnthropic(model="claude-sonnet-4-6", max_tokens=1024)
embeddings = OpenAIEmbeddings(model="text-embedding-3-small")

vectorstore = Chroma(
    persist_directory=str(CHROMA_DIR / file_id),
    embedding_function=embeddings,
)
retriever = vectorstore.as_retriever(search_kwargs={"k": 4})

contextualize_prompt = ChatPromptTemplate.from_messages([
    ("system",
     "Given the chat history and the latest user question, rewrite it as a "
     "standalone question. Return it as-is if already standalone."),
    MessagesPlaceholder("chat_history"),
    ("human", "{input}"),
])
history_aware_retriever = create_history_aware_retriever(llm, retriever, contextualize_prompt)

qa_prompt = ChatPromptTemplate.from_messages([
    ("system", SYSTEM_PROMPT + "\n\nRelevant context from the case:\n{context}"),
    MessagesPlaceholder("chat_history"),
    ("human", "{input}"),
])
question_answer_chain = create_stuff_documents_chain(llm, qa_prompt)

return create_retrieval_chain(history_aware_retriever, question_answer_chain)
```

## Chat invocation (main.py)

```python
from langchain_core.messages import AIMessage, HumanMessage

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

## Models (models.py)

```python
class Message(BaseModel):
    role: str   # "user" | "assistant"
    content: str

class ChatRequest(BaseModel):
    file_id: str
    message: str
    conversation_history: list[Message] = []

class ChatResponse(BaseModel):
    response: str
```

## New Environment Variables

```
OPENAI_API_KEY=your_key_here   # used only for text-embedding-3-small
```

Add to `backend/.env` and `backend/.env.example`.

## New Dependencies

```
langchain>=0.3.0
langchain-anthropic>=0.3.0
langchain-openai>=0.2.0
langchain-chroma>=0.1.0
langchain-community>=0.3.0
```

## Testing

- All existing 5 tests updated to match new model signatures (`conversation_history: []`)
- `test_upload.py` — verify `index_pdf` is called after a successful upload (`patch("src.main.index_pdf")`)
- `test_chat.py` — mock `get_rag_chain` to return a fake chain; verify `/chat` returns 200 with `response` field
- `test_rag_service.py` (new):
  - `test_index_pdf_creates_chroma_collection` — runs `index_pdf` with `mock/sample.pdf`, checks ChromaDB directory is created (mocks OpenAI embeddings)
  - `test_get_rag_chain_returns_runnable` — checks that `get_rag_chain` returns a LangChain `Runnable` for an indexed file
  - `test_get_rag_chain_raises_for_unknown_file` — checks that accessing a non-existent collection raises cleanly

## CI

No changes needed. Mocked embeddings mean `OPENAI_API_KEY` is not required in GitHub Actions.

## Deployment

`OPENAI_API_KEY` must be set in Railway for production (used by `index_pdf` on every upload):
```bash
railway variables set OPENAI_API_KEY=<your_key>
```
This is not needed in Vercel (frontend never calls OpenAI directly).

## What stays the same

- Frontend UI — no visible changes
- `/upload` API contract (request/response identical)
- `/chat` API contract (response identical; `conversation_history` added to request with default `[]` so old clients still work)
- Railway + Vercel deployment
