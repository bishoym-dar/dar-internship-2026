from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from bson import ObjectId
from pymongo import DESCENDING, ReturnDocument
from pymongo.errors import PyMongoError

from app.database import (
    conversations_collection,
    feedback_collection,
    messages_collection,
)


def utc_now() -> datetime:
    """Return the current UTC time."""

    return datetime.now(timezone.utc)


def validate_object_id(value: str) -> ObjectId:
    """Convert a string ID into a MongoDB ObjectId."""

    if not ObjectId.is_valid(value):
        raise ValueError("Invalid conversation ID.")

    return ObjectId(value)


def serialize_document(
    document: dict[str, Any],
) -> dict[str, Any]:
    """
    Convert MongoDB-specific values into JSON-compatible values.
    """

    serialized = dict(document)

    if "_id" in serialized:
        serialized["id"] = str(
            serialized.pop("_id")
        )

    for field_name in (
        "created_at",
        "updated_at",
    ):
        field_value = serialized.get(
            field_name
        )

        if isinstance(field_value, datetime):
            if field_value.tzinfo is None:
                field_value = (
                    field_value.replace(
                        tzinfo=timezone.utc
                    )
                )

            serialized[field_name] = (
                field_value.isoformat()
            )

    return serialized


def create_conversation(
    title: str = "New Chat",
) -> dict[str, Any]:
    """Create and return a new conversation."""

    clean_title = (
        title.strip() or "New Chat"
    )

    current_time = utc_now()

    conversation = {
        "title": clean_title,
        "created_at": current_time,
        "updated_at": current_time,
    }

    try:
        result = (
            conversations_collection.insert_one(
                conversation
            )
        )

        created_conversation = (
            conversations_collection.find_one(
                {
                    "_id": result.inserted_id
                }
            )
        )

    except PyMongoError as exc:
        raise RuntimeError(
            "The conversation could not be created."
        ) from exc

    if created_conversation is None:
        raise RuntimeError(
            "The conversation was created "
            "but could not be loaded."
        )

    return serialize_document(
        created_conversation
    )


def list_conversations() -> list[
    dict[str, Any]
]:
    """
    Return all conversations ordered by most recent activity.
    """

    try:
        cursor = (
            conversations_collection.find()
            .sort(
                "updated_at",
                DESCENDING,
            )
        )

        return [
            serialize_document(conversation)
            for conversation in cursor
        ]

    except PyMongoError as exc:
        raise RuntimeError(
            "The conversations could not be loaded."
        ) from exc


def get_conversation(
    conversation_id: str,
) -> dict[str, Any] | None:
    """
    Return one conversation together with its messages.
    """

    object_id = validate_object_id(
        conversation_id
    )

    try:
        conversation = (
            conversations_collection.find_one(
                {
                    "_id": object_id
                }
            )
        )

        if conversation is None:
            return None

        message_cursor = (
            messages_collection.find(
                {
                    "conversation_id":
                        conversation_id
                }
            )
            .sort(
                "created_at",
                1,
            )
        )

        serialized_messages = [
            serialize_document(message)
            for message in message_cursor
        ]

    except PyMongoError as exc:
        raise RuntimeError(
            "The conversation could not be loaded."
        ) from exc

    serialized_conversation = (
        serialize_document(conversation)
    )

    serialized_conversation[
        "messages"
    ] = serialized_messages

    return serialized_conversation


def rename_conversation(
    conversation_id: str,
    title: str,
) -> dict[str, Any] | None:
    """
    Rename a conversation and return the updated document.
    """

    object_id = validate_object_id(
        conversation_id
    )

    clean_title = title.strip()

    if not clean_title:
        raise ValueError(
            "The conversation title cannot be empty."
        )

    try:
        updated_conversation = (
            conversations_collection
            .find_one_and_update(
                {
                    "_id": object_id
                },
                {
                    "$set": {
                        "title": clean_title,
                        "updated_at": utc_now(),
                    }
                },
                return_document=(
                    ReturnDocument.AFTER
                ),
            )
        )

    except PyMongoError as exc:
        raise RuntimeError(
            "The conversation could not be renamed."
        ) from exc

    if updated_conversation is None:
        return None

    return serialize_document(
        updated_conversation
    )


def delete_conversation(
    conversation_id: str,
) -> bool:
    """
    Delete a conversation, its messages, and feedback.

    Feedback documents are linked to message IDs, so message IDs
    are collected before deleting the messages.
    """

    object_id = validate_object_id(
        conversation_id
    )

    try:
        conversation = (
            conversations_collection.find_one(
                {
                    "_id": object_id
                }
            )
        )

        if conversation is None:
            return False

        message_cursor = (
            messages_collection.find(
                {
                    "conversation_id":
                        conversation_id
                },
                {
                    "_id": 1
                },
            )
        )

        message_ids = [
            str(message["_id"])
            for message in message_cursor
        ]

        if message_ids:
            feedback_collection.delete_many(
                {
                    "message_id": {
                        "$in": message_ids
                    }
                }
            )

        messages_collection.delete_many(
            {
                "conversation_id":
                    conversation_id
            }
        )

        delete_result = (
            conversations_collection.delete_one(
                {
                    "_id": object_id
                }
            )
        )

    except PyMongoError as exc:
        raise RuntimeError(
            "The conversation could not be deleted."
        ) from exc

    return delete_result.deleted_count == 1


def update_conversation_activity(
    conversation_id: str,
) -> None:
    """
    Move a conversation to the top of the recent-chat list.
    """

    object_id = validate_object_id(
        conversation_id
    )

    try:
        conversations_collection.update_one(
            {
                "_id": object_id
            },
            {
                "$set": {
                    "updated_at": utc_now()
                }
            },
        )

    except PyMongoError as exc:
        raise RuntimeError(
            "The conversation activity "
            "could not be updated."
        ) from exc