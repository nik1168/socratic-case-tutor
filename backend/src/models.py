from typing import Literal, Optional

from pydantic import BaseModel


class UploadResponse(BaseModel):
    file_id: str


class ChatRequest(BaseModel):
    file_id: str
    session_id: str
    message: str


class ChatResponse(BaseModel):
    response: str
    response_type: Literal["clarification", "socratic_response"]
    thinking_quality: Literal["shallow", "developing", "insightful"]
    feedback: str


class SessionItem(BaseModel):
    file_id: str
    file_name: str
    last_active_at: str
    message_count: int


class MessageItem(BaseModel):
    role: Literal["user", "assistant"]
    content: str
    response_type: Optional[str] = None
    thinking_quality: Optional[str] = None
    feedback: Optional[str] = None
