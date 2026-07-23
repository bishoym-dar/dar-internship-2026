from __future__ import annotations

import json
from collections.abc import AsyncIterator, Iterator
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app.database import (
    close_mongodb_connection,
    connect_to_mongodb,
)
from app.services.models.conversation import (
    create_conversation,
    get_conversation,
)
from app.services.models.message import create_message
from app.services.rag import (
    run_rag_pipeline,
    stream_rag_pipeline,
)
from app.services.routes.conversations import (
    router as conversations_router,
)


# ---------------------------------------------------------------------------
# REQUEST AND RESPONSE MODELS
# ---------------------------------------------------------------------------

class ChatRequest(BaseModel):
    message: str = Field(min_length=1)
    conversation_id: str | None = None


class ChatResponse(BaseModel):
    answer: str
    conversation_id: str
    assistant_message_id: str


# ---------------------------------------------------------------------------
# APPLICATION LIFESPAN
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(
    app: FastAPI,
) -> AsyncIterator[None]:
    """Manage MongoDB during FastAPI startup and shutdown."""

    connect_to_mongodb()

    try:
        yield
    finally:
        close_mongodb_connection()


app = FastAPI(
    title="EAD RAG Backend",
    version="0.5.1",
    lifespan=lifespan,
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


# Register conversation CRUD routes.
app.include_router(conversations_router)


# ---------------------------------------------------------------------------
# GENERAL ROUTES
# ---------------------------------------------------------------------------

@app.get("/")
def root() -> dict[str, str]:
    return {
        "message": "Backend is running",
    }


@app.get("/api/health")
def health_check() -> dict[str, str]:
    return {
        "status": "ok",
        "database": "connected",
    }


# ---------------------------------------------------------------------------
# CONVERSATION HELPERS
# ---------------------------------------------------------------------------

def get_or_create_conversation(
    conversation_id: str | None,
    first_message: str,
) -> dict[str, Any]:
    """
    Reuse an existing conversation or create a new conversation.

    New conversations use the beginning of the first user question
    as their title.
    """

    if conversation_id:
        existing_conversation = get_conversation(
            conversation_id
        )

        if existing_conversation is None:
            raise ValueError("Conversation not found.")

        return existing_conversation

    clean_title = " ".join(
        first_message.strip().split()
    )

    if len(clean_title) > 60:
        clean_title = f"{clean_title[:57]}..."

    return create_conversation(
        title=clean_title or "New Chat",
    )


# ---------------------------------------------------------------------------
# NON-STREAMING CHAT
# ---------------------------------------------------------------------------

@app.post(
    "/api/chat",
    response_model=ChatResponse,
)
def chat(
    request: ChatRequest,
) -> ChatResponse:
    """Generate and save one complete non-streaming answer."""

    clean_message = request.message.strip()

    if not clean_message:
        raise HTTPException(
            status_code=400,
            detail="The message cannot be empty.",
        )

    try:
        conversation = get_or_create_conversation(
            conversation_id=request.conversation_id,
            first_message=clean_message,
        )

        conversation_id = conversation["id"]

        create_message(
            conversation_id=conversation_id,
            role="user",
            content=clean_message,
        )

        answer, _pipeline_metrics = run_rag_pipeline(
            clean_message
        )

        assistant_message = create_message(
            conversation_id=conversation_id,
            role="assistant",
            content=answer,
        )

        return ChatResponse(
            answer=answer,
            conversation_id=conversation_id,
            assistant_message_id=assistant_message["id"],
        )

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


# ---------------------------------------------------------------------------
# STREAMING CHAT
# ---------------------------------------------------------------------------

def create_sse_stream(
    message: str,
    requested_conversation_id: str | None,
) -> Iterator[str]:
    """
    Save the user message, stream the RAG answer, and save the completed
    assistant response.

    The emitted SSE format remains compatible with the current frontend:
        chunk
        done
        error
    """

    try:
        conversation = get_or_create_conversation(
            conversation_id=requested_conversation_id,
            first_message=message,
        )

        conversation_id = conversation["id"]

        create_message(
            conversation_id=conversation_id,
            role="user",
            content=message,
        )

        full_answer_parts: list[str] = []

        for chunk in stream_rag_pipeline(message):
            if not chunk:
                continue

            full_answer_parts.append(chunk)

            chunk_payload = json.dumps(
                {
                    "type": "chunk",
                    "content": chunk,
                },
                ensure_ascii=False,
            )

            yield f"data: {chunk_payload}\n\n"

        full_answer = "".join(
            full_answer_parts
        ).strip()

        if not full_answer:
            raise RuntimeError(
                "The RAG pipeline returned an empty answer."
            )

        create_message(
            conversation_id=conversation_id,
            role="assistant",
            content=full_answer,
        )

        # Keep the original done event expected by chatApi.js.
        done_payload = json.dumps(
            {
                "type": "done",
            }
        )

        yield f"data: {done_payload}\n\n"

    except Exception as exc:
        print(
            f"Streaming persistence error: {exc}"
        )

        error_payload = json.dumps(
            {
                "type": "error",
                "message": str(exc),
            },
            ensure_ascii=False,
        )

        yield f"data: {error_payload}\n\n"


@app.post("/api/chat/stream")
def chat_stream(
    request: ChatRequest,
) -> StreamingResponse:
    """Stream and persist a RAG answer using SSE."""

    clean_message = request.message.strip()

    if not clean_message:
        raise HTTPException(
            status_code=400,
            detail="The message cannot be empty.",
        )

    return StreamingResponse(
        create_sse_stream(
            message=clean_message,
            requested_conversation_id=request.conversation_id,
        ),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )