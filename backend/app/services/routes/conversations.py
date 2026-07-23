from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException, Response
from pydantic import BaseModel, Field

from app.services.models.conversation import (
    create_conversation,
    delete_conversation,
    get_conversation,
    list_conversations,
    rename_conversation,
)


router = APIRouter(
    prefix="/api/conversations",
    tags=["Conversations"],
)


class ConversationCreateRequest(BaseModel):
    title: str = Field(
        default="New Chat",
        max_length=120,
    )


class ConversationRenameRequest(BaseModel):
    title: str = Field(
        min_length=1,
        max_length=120,
    )


@router.post(
    "",
    status_code=201,
)
def create_conversation_endpoint(
    request: ConversationCreateRequest,
) -> dict[str, Any]:
    """Create a new conversation."""

    try:
        return create_conversation(
            title=request.title,
        )

    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail=str(exc),
        ) from exc

    except RuntimeError as exc:
        raise HTTPException(
            status_code=500,
            detail=str(exc),
        ) from exc


@router.get("")
def list_conversations_endpoint() -> list[dict[str, Any]]:
    """Return all conversations ordered by recent activity."""

    try:
        return list_conversations()

    except RuntimeError as exc:
        raise HTTPException(
            status_code=500,
            detail=str(exc),
        ) from exc


@router.get("/{conversation_id}")
def get_conversation_endpoint(
    conversation_id: str,
) -> dict[str, Any]:
    """Return one conversation and all its messages."""

    try:
        conversation = get_conversation(
            conversation_id,
        )

    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail=str(exc),
        ) from exc

    except RuntimeError as exc:
        raise HTTPException(
            status_code=500,
            detail=str(exc),
        ) from exc

    if conversation is None:
        raise HTTPException(
            status_code=404,
            detail="Conversation not found.",
        )

    return conversation


@router.patch("/{conversation_id}")
def rename_conversation_endpoint(
    conversation_id: str,
    request: ConversationRenameRequest,
) -> dict[str, Any]:
    """Rename one conversation."""

    try:
        conversation = rename_conversation(
            conversation_id=conversation_id,
            title=request.title,
        )

    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail=str(exc),
        ) from exc

    except RuntimeError as exc:
        raise HTTPException(
            status_code=500,
            detail=str(exc),
        ) from exc

    if conversation is None:
        raise HTTPException(
            status_code=404,
            detail="Conversation not found.",
        )

    return conversation


@router.delete(
    "/{conversation_id}",
    status_code=204,
)
def delete_conversation_endpoint(
    conversation_id: str,
) -> Response:
    """Delete a conversation, its messages, and its feedback."""

    try:
        was_deleted = delete_conversation(
            conversation_id,
        )

    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail=str(exc),
        ) from exc

    except RuntimeError as exc:
        raise HTTPException(
            status_code=500,
            detail=str(exc),
        ) from exc

    if not was_deleted:
        raise HTTPException(
            status_code=404,
            detail="Conversation not found.",
        )

    return Response(status_code=204)