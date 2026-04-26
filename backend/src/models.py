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
