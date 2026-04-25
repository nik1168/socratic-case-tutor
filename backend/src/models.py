from pydantic import BaseModel


class UploadResponse(BaseModel):
    file_id: str


class ChatRequest(BaseModel):
    file_id: str
    message: str


class ChatResponse(BaseModel):
    response: str
