from pathlib import Path

from langchain_chroma import Chroma
from langchain_community.document_loaders import PyPDFLoader
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
