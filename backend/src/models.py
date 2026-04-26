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
