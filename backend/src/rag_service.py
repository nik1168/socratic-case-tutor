from pathlib import Path

from langchain_chroma import Chroma
from langchain_classic.chains import create_history_aware_retriever, create_retrieval_chain
from langchain_classic.chains.combine_documents import create_stuff_documents_chain
from langchain_anthropic import ChatAnthropic
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
