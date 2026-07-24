from __future__ import annotations

import json
from collections.abc import AsyncIterator, Iterator
from contextlib import asynccontextmanager
from datetime import datetime
from time import perf_counter
from typing import Any

from bson import ObjectId

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
from app.services.models.message import (
    append_message_version,
    create_message,
    get_regeneration_question,
)
from app.services.rag import (
    run_rag_pipeline,
    stream_rag_pipeline,
)
from app.services.routes.conversations import (
    router as conversations_router,
)

from app.services.routes.feedback import (
    router as feedback_router,
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
    sources: list[dict[str, Any]] = Field(
        default_factory=list
    )


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
    version="0.7.0",
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


app.include_router(conversations_router)

app.include_router(feedback_router)
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
            raise ValueError(
                "Conversation not found."
            )

        return existing_conversation

    clean_title = " ".join(
        first_message.strip().split()
    )

    if len(clean_title) > 60:
        clean_title = (
            f"{clean_title[:57]}..."
        )

    return create_conversation(
        title=clean_title or "New Chat",
    )


# ---------------------------------------------------------------------------
# SHARED STREAM HELPERS
# ---------------------------------------------------------------------------

def json_serializer(value: Any) -> str:
    """Convert MongoDB and datetime values into JSON-compatible strings."""

    if isinstance(value, datetime):
        return value.isoformat()

    if isinstance(value, ObjectId):
        return str(value)

    raise TypeError(
        f"Object of type {type(value).__name__} "
        "is not JSON serializable"
    )


def sse_payload(payload: dict[str, Any]) -> str:
    """Serialize one JSON Server-Sent Event."""

    return (
        "data: "
        f"{json.dumps(
            payload,
            ensure_ascii=False,
            default=json_serializer,
        )}"
        "\n\n"
    )


def stream_rag_events(
    question: str,
) -> Iterator[tuple[str, Any]]:
    """Yield validated RAG chunks and source lists."""

    for event in stream_rag_pipeline(question):
        if not isinstance(event, dict):
            continue

        event_type = event.get("type")

        if event_type == "chunk":
            chunk = str(event.get("content", ""))

            if chunk:
                yield "chunk", chunk

        elif event_type == "sources":
            sources = event.get("sources", [])

            if not isinstance(sources, list):
                sources = []

            yield "sources", sources


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

        generation_started_at = perf_counter()
        answer, pipeline_metrics = run_rag_pipeline(
            clean_message
        )
        responded_in_seconds = (
            perf_counter() - generation_started_at
        )

        sources = pipeline_metrics.get(
            "sources",
            [],
        )

        if not isinstance(sources, list):
            sources = []

        assistant_message = create_message(
            conversation_id=conversation_id,
            role="assistant",
            content=answer,
            sources=sources,
            responded_in_seconds=responded_in_seconds,
        )

        return ChatResponse(
            answer=answer,
            conversation_id=conversation_id,
            assistant_message_id=assistant_message["id"],
            sources=sources,
        )

    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail=str(exc),
        ) from exc

    except Exception as exc:
        print(
            f"Non-streaming RAG error: {exc}"
        )

        raise HTTPException(
            status_code=500,
            detail=(
                "The RAG system could not "
                "process the message."
            ),
        ) from exc


# ---------------------------------------------------------------------------
# STREAMING CHAT
# ---------------------------------------------------------------------------

def create_sse_stream(
    message: str,
    requested_conversation_id: str | None,
) -> Iterator[str]:
    """
    Save the user message, stream the RAG answer, then save the complete
    assistant response and its first version.
    """

    try:
        conversation = get_or_create_conversation(
            conversation_id=(
                requested_conversation_id
            ),
            first_message=message,
        )

        conversation_id = conversation["id"]

        create_message(
            conversation_id=conversation_id,
            role="user",
            content=message,
        )

        full_answer_parts: list[str] = []
        sources: list[dict[str, Any]] = []
        generation_started_at = perf_counter()

        for event_type, event_value in stream_rag_events(message):
            if event_type == "chunk":
                chunk = str(event_value)
                full_answer_parts.append(chunk)

                yield sse_payload(
                    {
                        "type": "chunk",
                        "content": chunk,
                    }
                )

            elif event_type == "sources":
                sources = event_value

                yield sse_payload(
                    {
                        "type": "sources",
                        "sources": sources,
                    }
                )

        responded_in_seconds = (
            perf_counter() - generation_started_at
        )
        full_answer = "".join(
            full_answer_parts
        ).strip()

        if not full_answer:
            raise RuntimeError(
                "The RAG pipeline returned "
                "an empty answer."
            )

        assistant_message = create_message(
            conversation_id=conversation_id,
            role="assistant",
            content=full_answer,
            sources=sources,
            responded_in_seconds=responded_in_seconds,
        )

        first_version = assistant_message["versions"][0]

        yield sse_payload(
            {
                "type": "done",
                "assistant_message_id": assistant_message["id"],
                "conversation_id": conversation_id,
                "sources": sources,
                "responded_in_seconds": responded_in_seconds,
                "version": first_version,
                "active_version": 0,
                "version_count": 1,
            }
        )

    except Exception as exc:
        print(
            f"Streaming persistence error: {exc}"
        )

        yield sse_payload(
            {
                "type": "error",
                "message": str(exc),
            }
        )


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
            requested_conversation_id=(
                request.conversation_id
            ),
        ),
        media_type="text/event-stream",
        headers={
            "Cache-Control": (
                "no-cache, no-transform"
            ),
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


# ---------------------------------------------------------------------------
# RESPONSE REGENERATION AND VERSION HISTORY
# ---------------------------------------------------------------------------

def create_regeneration_sse_stream(
    assistant_message_id: str,
) -> Iterator[str]:
    """
    Regenerate an assistant answer and append it as a new stored version.

    Retrieval runs again, so each new version receives its own source list.
    """

    try:
        question = get_regeneration_question(
            assistant_message_id
        )

        full_answer_parts: list[str] = []
        sources: list[dict[str, Any]] = []
        generation_started_at = perf_counter()

        for event_type, event_value in stream_rag_events(question):
            if event_type == "chunk":
                chunk = str(event_value)
                full_answer_parts.append(chunk)

                yield sse_payload(
                    {
                        "type": "chunk",
                        "content": chunk,
                    }
                )

            elif event_type == "sources":
                sources = event_value

                yield sse_payload(
                    {
                        "type": "sources",
                        "sources": sources,
                    }
                )

        responded_in_seconds = (
            perf_counter() - generation_started_at
        )
        full_answer = "".join(
            full_answer_parts
        ).strip()

        if not full_answer:
            raise RuntimeError(
                "The regenerated RAG answer was empty."
            )

        updated_message = append_message_version(
            message_id=assistant_message_id,
            content=full_answer,
            sources=sources,
            responded_in_seconds=responded_in_seconds,
        )

        active_version = updated_message["active_version"]
        versions = updated_message.get("versions", [])
        new_version = versions[active_version]

        yield sse_payload(
            {
                "type": "done",
                "assistant_message_id": updated_message["id"],
                "conversation_id": updated_message["conversation_id"],
                "sources": sources,
                "responded_in_seconds": responded_in_seconds,
                "version": new_version,
                "versions": versions,
                "active_version": active_version,
                "version_count": len(versions),
            }
        )

    except Exception as exc:
        print(
            f"Regeneration error: {exc}"
        )

        yield sse_payload(
            {
                "type": "error",
                "message": str(exc),
            }
        )


@app.post(
    "/api/messages/{assistant_message_id}/regenerate/stream"
)
def regenerate_message_stream(
    assistant_message_id: str,
) -> StreamingResponse:
    """Stream a new version of an existing assistant message."""

    return StreamingResponse(
        create_regeneration_sse_stream(
            assistant_message_id
        ),
        media_type="text/event-stream",
        headers={
            "Cache-Control": (
                "no-cache, no-transform"
            ),
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )