from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Literal
from uuid import uuid4

from bson import ObjectId
from bson.errors import InvalidId
from pymongo import ReturnDocument
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


def _message_object_id(message_id: str) -> ObjectId:
    """Validate and convert a public message ID into a MongoDB ObjectId."""

    try:
        return ObjectId(message_id)
    except (InvalidId, TypeError) as exc:
        raise ValueError("Invalid message ID.") from exc


def _build_version(
    *,
    content: str,
    sources: list[dict[str, Any]],
    version_number: int,
    responded_in_seconds: float | None,
) -> dict[str, Any]:
    """Create one independently identifiable assistant-answer version."""

    return {
        "version_id": str(uuid4()),
        "version_number": version_number,
        "content": content,
        "sources": sources,
        "responded_in_seconds": responded_in_seconds,
        "created_at": utc_now(),
    }


def create_message(
    conversation_id: str,
    role: MessageRole,
    content: str,
    responded_in_seconds: float | None = None,
    sources: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """
    Save one user or assistant message in MongoDB.

    Every assistant message starts with version 1. Each version owns its
    content, source metadata, response timing, stable version ID, and date.
    """

    validate_object_id(conversation_id)

    clean_content = content.strip()

    if not clean_content:
        raise ValueError("The message content cannot be empty.")

    if role not in ("user", "assistant"):
        raise ValueError("The message role must be user or assistant.")

    clean_sources = sources if isinstance(sources, list) else []

    message: dict[str, Any] = {
        "conversation_id": conversation_id,
        "role": role,
        "content": clean_content,
        "created_at": utc_now(),
    }

    if role == "assistant":
        first_version = _build_version(
            content=clean_content,
            sources=clean_sources,
            version_number=1,
            responded_in_seconds=responded_in_seconds,
        )

        # Top-level fields mirror the active version for backward compatibility.
        message["responded_in_seconds"] = responded_in_seconds
        message["sources"] = clean_sources
        message["versions"] = [first_version]
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


def get_message(message_id: str) -> dict[str, Any] | None:
    """Load one message by its public ID."""

    object_id = _message_object_id(message_id)

    try:
        message = messages_collection.find_one({"_id": object_id})
    except PyMongoError as exc:
        raise RuntimeError(
            "The message could not be loaded."
        ) from exc

    if message is None:
        return None

    return serialize_document(message)


def get_regeneration_question(message_id: str) -> str:
    """
    Return the user question immediately preceding an assistant message.

    Regeneration reuses that question but performs retrieval and generation
    again, so the new version may contain different content and citations.
    """

    object_id = _message_object_id(message_id)

    try:
        assistant_message = messages_collection.find_one(
            {"_id": object_id}
        )

        if assistant_message is None:
            raise ValueError("Assistant message not found.")

        if assistant_message.get("role") != "assistant":
            raise ValueError(
                "Only assistant messages can be regenerated."
            )

        user_message = messages_collection.find_one(
            {
                "conversation_id": assistant_message["conversation_id"],
                "role": "user",
                "created_at": {
                    "$lte": assistant_message["created_at"],
                },
            },
            sort=[("created_at", -1), ("_id", -1)],
        )

    except ValueError:
        raise
    except PyMongoError as exc:
        raise RuntimeError(
            "The original question could not be loaded."
        ) from exc

    if user_message is None:
        raise ValueError(
            "The user question for this answer was not found."
        )

    question = str(user_message.get("content", "")).strip()

    if not question:
        raise ValueError("The original user question is empty.")

    return question


def append_message_version(
    message_id: str,
    content: str,
    sources: list[dict[str, Any]] | None = None,
    responded_in_seconds: float | None = None,
) -> dict[str, Any]:
    """
    Append a regenerated answer and make it the active message version.

    Existing versions are never deleted. Top-level content, sources, and
    timing mirror the newly active version for backward compatibility.
    """

    object_id = _message_object_id(message_id)
    clean_content = content.strip()

    if not clean_content:
        raise ValueError("The regenerated answer cannot be empty.")

    clean_sources = sources if isinstance(sources, list) else []

    try:
        existing_message = messages_collection.find_one(
            {"_id": object_id}
        )

        if existing_message is None:
            raise ValueError("Assistant message not found.")

        if existing_message.get("role") != "assistant":
            raise ValueError(
                "Only assistant messages can have answer versions."
            )

        existing_versions = list(
            existing_message.get("versions") or []
        )

        # Upgrade older stored versions so every version has a stable ID and
        # number before the new answer is appended.
        normalized_versions: list[dict[str, Any]] = []

        if not existing_versions:
            existing_versions = [
                {
                    "content": existing_message.get("content", ""),
                    "sources": existing_message.get("sources", []),
                    "responded_in_seconds": existing_message.get(
                        "responded_in_seconds"
                    ),
                    "created_at": existing_message.get(
                        "created_at",
                        utc_now(),
                    ),
                }
            ]

        for index, version in enumerate(existing_versions):
            normalized_version = dict(version)
            normalized_version.setdefault(
                "version_id",
                str(uuid4()),
            )
            normalized_version["version_number"] = index + 1
            normalized_version.setdefault("sources", [])
            normalized_version.setdefault(
                "responded_in_seconds",
                None,
            )
            normalized_version.setdefault(
                "created_at",
                existing_message.get("created_at", utc_now()),
            )
            normalized_versions.append(normalized_version)

        new_version = _build_version(
            content=clean_content,
            sources=clean_sources,
            version_number=len(normalized_versions) + 1,
            responded_in_seconds=responded_in_seconds,
        )

        normalized_versions.append(new_version)
        active_version = len(normalized_versions) - 1

        updated_message = messages_collection.find_one_and_update(
            {"_id": object_id, "role": "assistant"},
            {
                "$set": {
                    "content": clean_content,
                    "sources": clean_sources,
                    "responded_in_seconds": responded_in_seconds,
                    "versions": normalized_versions,
                    "active_version": active_version,
                    "updated_at": utc_now(),
                }
            },
            return_document=ReturnDocument.AFTER,
        )

        update_conversation_activity(
            existing_message["conversation_id"]
        )

    except ValueError:
        raise
    except PyMongoError as exc:
        raise RuntimeError(
            "The regenerated answer could not be saved."
        ) from exc

    if updated_message is None:
        raise RuntimeError(
            "The regenerated answer was not saved."
        )

    return serialize_document(updated_message)