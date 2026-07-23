from __future__ import annotations

import json
from collections.abc import Iterator

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app.services.rag import run_rag_pipeline, stream_rag_pipeline


class ChatRequest(BaseModel):
    message: str = Field(min_length=1)


class ChatResponse(BaseModel):
    answer: str


app = FastAPI(
    title="EAD RAG Backend",
    version="0.2.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def root() -> dict[str, str]:
    return {"message": "Backend is running"}


@app.get("/api/health")
def health_check() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/chat", response_model=ChatResponse)
def chat(request: ChatRequest) -> ChatResponse:
    """Return one complete, non-streaming RAG answer."""

    try:
        answer, _pipeline_metrics = run_rag_pipeline(request.message)
        return ChatResponse(answer=answer)

    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail=str(exc),
        ) from exc

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail="The RAG system could not process the message.",
        ) from exc


def create_sse_stream(message: str) -> Iterator[str]:
    """
    Convert RAG text chunks into Server-Sent Events.

    Each event contains JSON so the frontend can distinguish normal text
    chunks, completion, and errors.
    """

    try:
        for chunk in stream_rag_pipeline(message):
            print(f"FastAPI forwarding chunk: {chunk!r}")

            if not chunk:
                continue

            payload = json.dumps(
                {
                    "type": "chunk",
                    "content": chunk,
                },
                ensure_ascii=False,
            )
            yield f"data: {payload}\n\n"

        done_payload = json.dumps({"type": "done"})
        yield f"data: {done_payload}\n\n"

    except Exception as exc:
        error_payload = json.dumps(
            {
                "type": "error",
                "message": str(exc),
            },
            ensure_ascii=False,
        )
        yield f"data: {error_payload}\n\n"


@app.post("/api/chat/stream")
def chat_stream(request: ChatRequest) -> StreamingResponse:
    """Stream a RAG answer to the frontend using SSE."""

    clean_message = request.message.strip()

    if not clean_message:
        raise HTTPException(
            status_code=400,
            detail="The message cannot be empty.",
        )

    return StreamingResponse(
        create_sse_stream(clean_message),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )