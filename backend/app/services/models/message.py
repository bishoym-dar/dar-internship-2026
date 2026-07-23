from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Literal

from pymongo.errors import PyMongoError

from app.database import messages_collection
from app.services.models.conversation import (
    serialize_document,
    update_conversation_activity,
    validate_object_id,
)


MessageRole = Literal["user", "assistant"]


def utc_now() -> datetime:
    """Return the current UTC time."""

    return datetime.now(timezone.utc)


def create_message(
    conversation_id: str,
    role: MessageRole,
    content: str,
    responded_in_seconds: float | None = None,
    sources: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """
    Save one user or assistant message in MongoDB.

    Assistant messages may later contain timing information and citations.
    """

    validate_object_id(conversation_id)

    clean_content = content.strip()

    if not clean_content:
        raise ValueError("The message content cannot be empty.")

    if role not in ("user", "assistant"):
        raise ValueError("The message role must be user or assistant.")

    message: dict[str, Any] = {
        "conversation_id": conversation_id,
        "role": role,
        "content": clean_content,
        "created_at": utc_now(),
    }

    if role == "assistant":
        message["responded_in_seconds"] = responded_in_seconds
        message["sources"] = sources or []

        # This structure prepares the message for response regeneration later.
        message["versions"] = [
            {
                "content": clean_content,
                "sources": sources or [],
                "created_at": utc_now(),
            }
        ]
        message["active_version"] = 0

    try:
        result = messages_collection.insert_one(message)

        saved_message = messages_collection.find_one(
            {"_id": result.inserted_id}
        )

        update_conversation_activity(conversation_id)

    except PyMongoError as exc:
        raise RuntimeError(
            "The message could not be saved."
        ) from exc

    if saved_message is None:
        raise RuntimeError(
            "The message was saved but could not be loaded."
        )

    return serialize_document(saved_message)